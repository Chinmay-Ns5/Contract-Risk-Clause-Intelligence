import { createHash } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { getSessionUser, hasRole } from '@/app/lib/auth';
import { getDb } from '@/app/lib/db';
import { extractClausesFromPdf } from '@/app/lib/contract-upload';
import { runAnalysis } from '@/vector-db/analyze_risk';
import { generateEmbedding } from '@/vector-db/embedding';
import { embedRiskPatterns } from '@/vector-db/embed_patterns';
import qdrant, { COLLECTION, ensureCollection } from '@/vector-db/qdrant';
import { NextResponse } from 'next/server';

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const activeUploads = new Set();

export async function GET() {
  const db = getDb();
  const [rows] = await db.execute('SELECT * FROM contracts ORDER BY upload_date DESC');
  return NextResponse.json(rows);
}

export async function POST(request) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }
  if (!hasRole(user, ['admin'])) {
    return NextResponse.json({ error: 'Admin role required to create contracts.' }, { status: 403 });
  }

  if (request.headers.get('content-type')?.includes('multipart/form-data')) {
    return uploadPdfContract(request, user);
  }

  const db = getDb();
  const body = await request.json();
  const { title, file_path } = body;

  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  const [result] = await db.execute(
    'INSERT INTO contracts (title, uploaded_by, file_path, status) VALUES (?, ?, ?, "pending")',
    [title, user.user_id, file_path || null]
  );

  return NextResponse.json({ contract_id: result.insertId, title, status: 'pending' }, { status: 201 });
}

async function uploadPdfContract(request, user) {
  let formData;

  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid upload form.' }, { status: 400 });
  }

  const file = formData.get('file');
  const uploadedBy = Number(user.user_id);
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
  let contractSaved = false;

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
      contractSaved = true;
      const [existingClauses] = await db.execute(
        'SELECT clause_id, clause_text FROM clauses WHERE contract_id = ? ORDER BY clause_order',
        [existingContract.contract_id]
      );
      await indexClauseEmbeddings(existingClauses, db);
      const patternsEmbedded = await embedRiskPatterns(db);
      const analysis = await runAnalysis(existingContract.contract_id);
      await db.execute(
        `UPDATE contracts SET status = 'analyzed' WHERE contract_id = ?`,
        [existingContract.contract_id]
      );

      return NextResponse.json({
        success: true,
        already_exists: true,
        contract_id: existingContract.contract_id,
        title: existingContract.title,
        status: 'analyzed',
        clauses_created: existingClauses.length,
        embeddings_stored: true,
        patterns_embedded: patternsEmbedded,
        analysis,
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
      contractSaved = true;
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
    await indexClauseEmbeddings(savedClauses, db);
    const patternsEmbedded = await embedRiskPatterns(db);
    const analysis = await runAnalysis(contractId);
    await db.execute(
      `UPDATE contracts SET status = 'analyzed' WHERE contract_id = ?`,
      [contractId]
    );

    return NextResponse.json({
      success: true,
      ...contract,
      status: 'analyzed',
      file_path: filePath,
      clauses_created: savedClauses.length,
      embeddings_stored: true,
      patterns_embedded: patternsEmbedded,
      analysis,
    }, { status: 201 });
  } catch (error) {
    console.error('Contract upload failed:', error);
    if (createdFile && !contractSaved) {
      await unlink(storagePath).catch(() => {});
    }

    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      return NextResponse.json(
        { error: 'Uploader user ID was not found. Check the ID and try again.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: false,
      error: contractSaved
        ? `Contract was saved, but risk detection failed: ${error.message || 'Unknown analysis error.'}`
        : `Unable to save the uploaded contract: ${error.message || 'Unknown upload error.'}`,
      contract_saved: contractSaved,
    }, { status: 500 });
  } finally {
    activeUploads.delete(filePath);
  }
}

async function indexClauseEmbeddings(clauses, db) {
  await ensureCollection();
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
}
