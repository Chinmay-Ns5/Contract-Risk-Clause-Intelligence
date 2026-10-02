import 'dotenv/config';
import mysql from 'mysql2/promise';

import { generateEmbedding } from './embedding.js';
import { searchSimilarPatterns } from './qdrant.js';

const SIMILARITY_THRESHOLD = 0.35;

async function main() {
  // Connect to MySQL
  const db = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
  });

  console.log('Connected to MySQL.');

  // Get all clauses from the database
  const [clauses] = await db.execute(
    'SELECT clause_id, clause_text FROM clauses'
  );

  console.log(`Found ${clauses.length} clause(s) to analyze.`);

  for (const clause of clauses) {
    console.log(
      `\nClause ${clause.clause_id}: "${clause.clause_text.substring(0, 60)}..."`
    );

    // Generate embedding for the clause
    const vector = await generateEmbedding(clause.clause_text);

    // Search Qdrant for the most similar risk patterns
    const results = await searchSimilarPatterns(vector, 4);

    for (const match of results) {
      console.log(
        `  -> Pattern ${match.payload.mysql_id}, score: ${match.score.toFixed(4)}`
      );

      // Only flag patterns above the similarity threshold
      if (match.score >= SIMILARITY_THRESHOLD) {
        // Get the category associated with this risk pattern
        const [[pattern]] = await db.execute(
          'SELECT category_id FROM risk_patterns WHERE pattern_id = ?',
          [match.payload.mysql_id]
        );

        // Safety check in case the pattern does not exist in MySQL
        if (!pattern) {
          console.log(
            `     Pattern ${match.payload.mysql_id} not found in MySQL, skipping.`
          );
          continue;
        }

        // Avoid duplicate flags if the analysis is run multiple times
        const [[existing]] = await db.execute(
          `SELECT flag_id
           FROM risk_flags
           WHERE clause_id = ? AND pattern_id = ?`,
          [clause.clause_id, match.payload.mysql_id]
        );

        if (!existing) {
          // Store the detected risk flag in MySQL
          await db.execute(
            `INSERT INTO risk_flags
             (clause_id, pattern_id, similarity_score, category_id)
             VALUES (?, ?, ?, ?)`,
            [
              clause.clause_id,
              match.payload.mysql_id,
              match.score,
              pattern.category_id
            ]
          );

          console.log(
            `     Flagged! (category ${pattern.category_id})`
          );
        } else {
          console.log(
            `     Already flagged, skipping.`
          );
        }
      }
    }
  }

  await db.end();

  console.log('\nDone analyzing all clauses.');
}

main().catch((error) => {
  console.error('\nError during risk analysis:');
  console.error(error);
  process.exit(1);
});