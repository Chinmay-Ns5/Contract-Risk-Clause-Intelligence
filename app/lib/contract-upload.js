import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PDFParse } from 'pdf-parse';

const CLAUSE_HEADING = /^(?:(?:section|article|clause)\s+[A-Z0-9IVX.-]+|(?:\d+(?:\.\d+)*[.)]?|[IVXLCDM]+[.)])\s+[A-Z])/i;

PDFParse.setWorker(
  pathToFileURL(resolve(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')).href
);

export async function extractClausesFromPdf(buffer) {
  const parser = new PDFParse({ data: buffer });
  let extractedText;

  try {
    const result = await parser.getText({ pageJoiner: '' });
    extractedText = result.text;
  } finally {
    await parser.destroy();
  }

  const text = String(extractedText || '')
    .replace(/\0/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\f/g, '\n\n')
    .trim();

  if (!text || !/[a-z]/i.test(text)) {
    throw new Error('NO_EXTRACTABLE_TEXT');
  }

  const clauses = [];
  let currentLines = [];

  function flushClause() {
    const clause = currentLines.join(' ').replace(/\s+/g, ' ').trim();
    if (clause) clauses.push(clause);
    currentLines = [];
  }

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();

    if (!line) {
      flushClause();
      continue;
    }

    if (currentLines.length > 0 && CLAUSE_HEADING.test(line)) {
      flushClause();
    }

    currentLines.push(line);
  }

  flushClause();

  if (clauses.length === 0) {
    throw new Error('NO_EXTRACTABLE_TEXT');
  }

  return clauses;
}