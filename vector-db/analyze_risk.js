import 'dotenv/config';
import mysql from 'mysql2/promise';

import { generateEmbedding } from './embedding.js';
import { searchSimilarPatterns } from './qdrant.js';

const SIMILARITY_THRESHOLD = 0.35;

async function main() {
  const db = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
  });

  try {
    const [clauses] = await db.execute(
      'SELECT clause_id, clause_text FROM clauses'
    );

    for (const clause of clauses) {
      const vector = await generateEmbedding(clause.clause_text);

      const results = await searchSimilarPatterns(vector, 4);

      console.log(
        `\nClause ${clause.clause_id}: "${clause.clause_text.substring(0, 60)}..."`
      );

      for (const match of results) {
        const patternId = match.payload.mysql_id;
        const score = match.score;

        console.log(
          `  -> Pattern ${patternId}, score: ${score.toFixed(4)}`
        );

        if (score < SIMILARITY_THRESHOLD) {
          continue;
        }

        const [[pattern]] = await db.execute(
          `SELECT category_id
           FROM risk_patterns
           WHERE pattern_id = ?`,
          [patternId]
        );

        if (!pattern) {
          console.log(
            `     Pattern ${patternId} not found in MySQL, skipping.`
          );
          continue;
        }

        const [[existing]] = await db.execute(
          `SELECT flag_id
           FROM risk_flags
           WHERE clause_id = ?
             AND pattern_id = ?`,
          [clause.clause_id, patternId]
        );

        if (!existing) {
          await db.execute(
            `INSERT INTO risk_flags
              (clause_id, pattern_id, similarity_score, category_id)
             VALUES (?, ?, ?, ?)`,
            [
              clause.clause_id,
              patternId,
              score,
              pattern.category_id
            ]
          );

          console.log(
            `     Flagged! (category ${pattern.category_id})`
          );
        } else {
          console.log(`     Already flagged, skipping.`);
        }
      }
    }

    console.log('\nDone analyzing all clauses.');
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error('Risk analysis failed:', error);
  process.exit(1);
});