// Phase 6: Script to generate and upload clause/pattern embeddings.
// Not yet written — will be filled in when we cover Phase 6.
import { pipeline } from '@xenova/transformers';
import { QdrantClient } from '@qdrant/js-client-rest';
import mysql from 'mysql2/promise';

const qdrant = new QdrantClient({ url: 'http://localhost:6333' });
const COLLECTION = 'risk_clauses';

async function main() {
  const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

  await qdrant.createCollection(COLLECTION, {
    vectors: { size: 384, distance: 'Cosine' }
  }).catch(() => console.log('Collection already exists, skipping.'));

  const db = await mysql.createConnection({
    host: 'localhost', user: 'root', password: 'Every1is=', database: 'contract_risk_db'
  });

  const [clauses] = await db.execute('SELECT clause_id, clause_text FROM clauses');
  for (const clause of clauses) {
    const output = await embedder(clause.clause_text, { pooling: 'mean', normalize: true });
    const vector = Array.from(output.data);

    await qdrant.upsert(COLLECTION, {
      points: [{
        id: clause.clause_id,
        vector: vector,
        payload: { mysql_id: clause.clause_id, type: 'clause' }
      }]
    });

    await db.execute('UPDATE clauses SET vector_id = ? WHERE clause_id = ?',
      [String(clause.clause_id), clause.clause_id]);

    console.log(`Embedded clause ${clause.clause_id}`);
  }

  await db.end();
  console.log('Done embedding clauses.');
}

main();