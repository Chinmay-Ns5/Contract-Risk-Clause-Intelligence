import { createHash } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getDb } from '@/app/lib/db';
import { extractClausesFromPdf } from '@/app/lib/contract-upload';
import { generateEmbedding } from '@/vector-db/embedding';
import qdrant, { COLLECTION } from '@/vector-db/qdrant';
import { NextResponse } from 'next/server';

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const activeUploads = new Set();

export async function GET() {
  const db = getDb();
  const [rows] = await db.execute('SELECT * FROM contracts ORDER BY upload_date DESC');
  return NextResponse.json(rows);
}

export async function POST(request) {
  if (request.headers.get('content-type')?.includes('multipart/form-data')) {
    return uploadPdfContract(request);
  }

  const db = getDb();
  const body = await request.json();
  const { title, uploaded_by, file_path } = body;

  if (!title || !uploaded_by) {
    return NextResponse.json({ error: 'title and uploaded_by are required' }, { status: 400 });
  }

  const [result] = await db.execute(
    'INSERT INTO contracts (title, uploaded_by, file_path, status) VALUES (?, ?, ?, "pending")',
    [title, uploaded_by, file_path || null]
  );

  return NextResponse.json({ contract_id: result.insertId, title, status: 'pending' }, { status: 201 });
}

async function uploadPdfContract(request) {
  let formData;

  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid upload form.' }, { status: 400 });
  }

  const file = formData.get('file');
  const uploadedBy = Number(formData.get('uploaded_by'));
  const titleInput = String(formData.get('title') || '').trim();

  if (!file || typeof file.arrayBuffer !== 'function') {
    return NextResponse.json({ error: 'Select a PDF file to upload.' }, { status: 400 });
  }

  if (file.size === 0) {
    return NextResponse.json({ error: 'The selected PDF is empty.' }, { status: 400 });
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'PDF files must be 20 MB or smaller.' }, { status: 413 });
  }

  if (!Number.isInteger(uploadedBy) || uploadedBy <= 0) {
    return NextResponse.json({ error: 'Enter a valid uploader user ID.' }, { status: 400 });
  }

  let bytes;
  try {
    bytes = Buffer.from(await file.arrayBuffer());
  } catch {
    return NextResponse.json({ error: 'Unable to read the uploaded file.' }, { status: 400 });
  }

  if (bytes.subarray(0, 1024).indexOf(Buffer.from('%PDF-')) === -1) {
    return NextResponse.json({ error: 'The uploaded file is not a valid PDF.' }, { status: 415 });
  }

  let clauses;
  try {
    clauses = await extractClausesFromPdf(bytes);
  } catch (error) {
    console.error('PDF text extraction failed:', error);
    if (error.message === 'NO_EXTRACTABLE_TEXT') {
      return NextResponse.json(
        { error: 'No extractable text was found. Scanned/image-only PDFs are not supported.' },
        { status: 422 }
      );
    }

    return NextResponse.json(
      { error: 'Unable to read this PDF. It may be corrupt or password-protected.' },
      { status: 400 }
    );
  }

  const originalName = path.basename(file.name || 'contract.pdf', path.extname(file.name || 'contract.pdf'));
  const title = (titleInput || originalName || 'Uploaded contract').slice(0, 255);
  const digest = createHash('sha256')
    .update(String(uploadedBy))
    .update(bytes)
    .digest('hex');
  const filename = `${digest}.pdf`;
  const filePath = `/uploads/${filename}`;
  const storageDirectory = path.join(process.cwd(), 'uploads');
  const storagePath = path.join(storageDirectory, filename);

  if (activeUploads.has(filePath)) {
    return NextResponse.json(
      { error: 'This PDF upload is already being processed.' },
      { status: 409 }
    );
  }

  activeUploads.add(filePath);
  let createdFile = false;

  try {
    await mkdir(storageDirectory, { recursive: true });
    try {
      await writeFile(storagePath, bytes, { flag: 'wx' });
      createdFile = true;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }

    const db = getDb();
    const [[existingContract]] = await db.execute(
      `SELECT contract_id, title, status
       FROM contracts
       WHERE uploaded_by = ? AND file_path = ?
       LIMIT 1`,
      [uploadedBy, filePath]
    );

    if (existingContract) {
      const [existingClauses] = await db.execute(
        'SELECT clause_id, clause_text FROM clauses WHERE contract_id = ? ORDER BY clause_order',
        [existingContract.contract_id]
      );
      const warning = await indexClauseEmbeddings(existingClauses, db);

      return NextResponse.json({
        success: true,
        already_exists: true,
        contract_id: existingContract.contract_id,
        title: existingContract.title,
        status: existingContract.status,
        clauses_created: existingClauses.length,
        embeddings_stored: !warning,
        warning,
      });
    }

    const connection = await db.getConnection();
    let contractId;

    try {
      await connection.beginTransaction();

      const [contractResult] = await connection.execute(
        `INSERT INTO contracts (title, uploaded_by, file_path, status)
         VALUES (?, ?, ?, 'pending')`,
        [title, uploadedBy, filePath]
      );
      contractId = contractResult.insertId;

      for (const [index, clauseText] of clauses.entries()) {
        await connection.execute(
          'INSERT INTO clauses (contract_id, clause_text, clause_order) VALUES (?, ?, ?)',
          [contractId, clauseText, index + 1]
        );
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    const [[contract]] = await db.execute(
      'SELECT contract_id, title, status, upload_date FROM contracts WHERE contract_id = ?',
      [contractId]
    );
    const [savedClauses] = await db.execute(
      'SELECT clause_id, clause_text FROM clauses WHERE contract_id = ? ORDER BY clause_order',
      [contractId]
    );
    const warning = await indexClauseEmbeddings(savedClauses, db);

    return NextResponse.json({
      success: true,
      ...contract,
      file_path: filePath,
      clauses_created: savedClauses.length,
      embeddings_stored: !warning,
      warning,
    }, { status: 201 });
  } catch (error) {
    console.error('Contract upload failed:', error);
    if (createdFile) {
      await unlink(storagePath).catch(() => {});
    }

    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      return NextResponse.json(
        { error: 'Uploader user ID was not found. Check the ID and try again.' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Unable to save the uploaded contract. Please try again.' },
      { status: 500 }
    );
  } finally {
    activeUploads.delete(filePath);
  }
}

async function indexClauseEmbeddings(clauses, db) {
  try {
    const points = [];

    for (const clause of clauses) {
      const vector = await generateEmbedding(clause.clause_text);
      points.push({
        id: clause.clause_id,
        vector,
        payload: { mysql_id: clause.clause_id, type: 'clause' },
      });
    }

    if (points.length > 0) {
      await qdrant.upsert(COLLECTION, { points, wait: true });

      for (const point of points) {
        await db.execute(
          'UPDATE clauses SET vector_id = ? WHERE clause_id = ?',
          [String(point.id), point.id]
        );
      }
    }

    return null;
  } catch (error) {
    console.error('Uploaded clause embedding failed:', error);
    return 'The contract and clauses were saved, but clause embeddings could not be stored. The contract remains pending.';
  }
}