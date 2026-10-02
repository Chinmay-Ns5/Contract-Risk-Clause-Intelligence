import 'dotenv/config';
import { pipeline } from '@xenova/transformers';
import { QdrantClient } from '@qdrant/js-client-rest';
import mysql from 'mysql2/promise';

const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL
});

const COLLECTION = process.env.QDRANT_COLLECTION || 'risk_clauses';

async function main() {
  const embedder = await pipeline(
    'feature-extraction',
    'Xenova/all-MiniLM-L6-v2'
  );

  const db = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
  });

  const [patterns] = await db.execute(
    'SELECT pattern_id, pattern_text FROM risk_patterns'
  );

  for (const pattern of patterns) {
    const output = await embedder(
      pattern.pattern_text,
      {
        pooling: 'mean',
        normalize: true
      }
    );

    const vector = Array.from(output.data);

    const qdrantId = 10000 + pattern.pattern_id;

    await qdrant.upsert(COLLECTION, {
      points: [
        {
          id: qdrantId,
          vector: vector,
          payload: {
            mysql_id: pattern.pattern_id,
            type: 'pattern'
          }
        }
      ]
    });

    await db.execute(
      'UPDATE risk_patterns SET vector_id = ? WHERE pattern_id = ?',
      [String(qdrantId), pattern.pattern_id]
    );

    console.log(`Embedded pattern ${pattern.pattern_id}`);
  }

  await db.end();

  console.log('Done embedding patterns.');
}

main();