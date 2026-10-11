import 'dotenv/config';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { fileURLToPath } from 'node:url';

import { generateEmbedding } from './embedding.js';
import qdrant, { COLLECTION, ensureCollection } from './qdrant.js';

export async function embedRiskPatterns(db) {
  await ensureCollection();

  const [patterns] = await db.execute(
    'SELECT pattern_id, pattern_text FROM risk_patterns'
  );

  for (const pattern of patterns) {
    const vector = await generateEmbedding(pattern.pattern_text);
    const vectorId = 10000 + pattern.pattern_id;

    await qdrant.upsert(COLLECTION, {
      points: [{
        id: vectorId,
        vector,
        payload: {
          mysql_id: pattern.pattern_id,
          type: 'pattern',
        },
      }],
      wait: true,
    });

    await db.execute(
      'UPDATE risk_patterns SET vector_id = ? WHERE pattern_id = ?',
      [String(vectorId), pattern.pattern_id]
    );
  }

  return patterns.length;
}

async function main() {
  const db = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  });

  try {
    const count = await embedRiskPatterns(db);
    console.log(`Embedded ${count} risk pattern(s).`);
  } finally {
    await db.end();
  }
}

const currentFile = path.resolve(fileURLToPath(import.meta.url));
const executedFile = process.argv[1] ? path.resolve(process.argv[1]) : null;

if (executedFile && currentFile === executedFile) {
  main().catch((error) => {
    console.error('Embedding failed:', error);
    process.exitCode = 1;
  });
}
