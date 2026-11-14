import 'dotenv/config';
import { pipeline } from '@huggingface/transformers';
import { QdrantClient } from '@qdrant/js-client-rest';
import mysql from 'mysql2/promise';
import { clausePointId } from './qdrant.js';

const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL
});

const COLLECTION = process.env.QDRANT_COLLECTION || 'risk_clauses';

async function main() {
  const embedder = await pipeline(
    'feature-extraction',
    'Xenova/all-MiniLM-L6-v2'
  );

  await qdrant.createCollection(COLLECTION, {
    vectors: {
      size: 384,
      distance: 'Cosine'
    }
  }).catch(() => console.log('Collection already exists, skipping.'));

  const db = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
  });

  const [clauses] = await db.execute(
    'SELECT clause_id, contract_id, clause_text, vector_id FROM clauses'
  );

  for (const clause of clauses) {
    const output = await embedder(
      clause.clause_text,
      {
        pooling: 'mean',
        normalize: true
      }
    );

    const vector = Array.from(output.data);
    // Collision-free point id (see clausePointId); recorded in MySQL before the upsert.
    const pointId = clausePointId(clause);
    await db.execute(
      'UPDATE clauses SET vector_id = ? WHERE clause_id = ?',
      [String(pointId), clause.clause_id]
    );

    await qdrant.upsert(COLLECTION, {
      points: [
        {
          id: pointId,
          vector: vector,
          payload: {
            mysql_id: clause.clause_id,
            contract_id: clause.contract_id,
            type: 'clause'
          }
        }
      ]
    });

    console.log(`Embedded clause ${clause.clause_id}`);
  }

  await db.end();

  console.log('Done embedding clauses.');
}

main();