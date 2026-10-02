import 'dotenv/config';
import { pipeline } from '@xenova/transformers';
import { QdrantClient } from '@qdrant/js-client-rest';
import mysql from 'mysql2/promise';

const qdrant = new QdrantClient({ url: 'http://localhost:6333' });
const COLLECTION = 'risk_clauses';
const SIMILARITY_THRESHOLD = 0.35; // calibrated based on testing with all-MiniLM-L6-v2 // tweak this later based on real results

async function main() {
  const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

  const db = await mysql.createConnection({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE
});

  // Get all clauses that haven't been flagged yet
  const [clauses] = await db.execute('SELECT clause_id, clause_text FROM clauses');

  for (const clause of clauses) {
    const output = await embedder(clause.clause_text, { pooling: 'mean', normalize: true });
    const vector = Array.from(output.data);

    // Search only against pattern-type points
    const searchResponse = await qdrant.query(COLLECTION, {
  query: vector,
  limit: 4,
  filter: { must: [{ key: 'type', match: { value: 'pattern' } }] },
  with_payload: true
});
const results = searchResponse.points;

    console.log(`\nClause ${clause.clause_id}: "${clause.clause_text.substring(0, 60)}..."`);

    for (const match of results) {
      console.log(`  -> Pattern ${match.payload.mysql_id}, score: ${match.score.toFixed(4)}`);

      if (match.score >= SIMILARITY_THRESHOLD) {
        // Get the category for this pattern
        const [[pattern]] = await db.execute(
          'SELECT category_id FROM risk_patterns WHERE pattern_id = ?',
          [match.payload.mysql_id]
        );

        // Avoid duplicate flags if you run this script more than once
        const [[existing]] = await db.execute(
          'SELECT flag_id FROM risk_flags WHERE clause_id = ? AND pattern_id = ?',
          [clause.clause_id, match.payload.mysql_id]
        );

        if (!existing) {
          await db.execute(
            `INSERT INTO risk_flags (clause_id, pattern_id, similarity_score, category_id)
             VALUES (?, ?, ?, ?)`,
            [clause.clause_id, match.payload.mysql_id, match.score, pattern.category_id]
          );
          console.log(`     Flagged! (category ${pattern.category_id})`);
        } else {
          console.log(`     Already flagged, skipping.`);
        }
      }
    }
  }

  await db.end();
  console.log('\nDone analyzing all clauses.');
}

main();