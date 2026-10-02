import 'dotenv/config';
import mysql from 'mysql2/promise';

import { generateEmbedding } from './embedding.js';
import { searchSimilarPatterns } from './qdrant.js';

const SIMILARITY_THRESHOLD = 0.35;

/**
 * Analyze clauses for a specific contract.
 *
 * @param {number} contractId
 * @returns {Promise<object>} Analysis summary
 */
export async function runAnalysis(contractId) {
  const db = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
  });

  console.log('Connected to MySQL.');

  try {
    // Get only clauses belonging to this contract
    const [clauses] = await db.execute(
      `SELECT clause_id, clause_text
       FROM clauses
       WHERE contract_id = ?`,
      [contractId]
    );

    console.log(
      `Found ${clauses.length} clause(s) to analyze for contract ${contractId}.`
    );

    let flaggedCount = 0;
    let skippedCount = 0;

    for (const clause of clauses) {
      console.log(
        `\nClause ${clause.clause_id}: "${clause.clause_text.substring(0, 60)}..."`
      );

      // Generate embedding for the clause
      const vector = await generateEmbedding(clause.clause_text);

      // Search Qdrant for similar risk patterns
      const results = await searchSimilarPatterns(vector, 4);

      for (const match of results) {
        const patternId = match.payload.mysql_id;
        const score = match.score;

        console.log(
          `  -> Pattern ${patternId}, score: ${score.toFixed(4)}`
        );

        // Ignore results below the similarity threshold
        if (score < SIMILARITY_THRESHOLD) {
          continue;
        }

        // Get the category associated with this risk pattern
        const [[pattern]] = await db.execute(
          `SELECT category_id
           FROM risk_patterns
           WHERE pattern_id = ?`,
          [patternId]
        );

        // Safety check
        if (!pattern) {
          console.log(
            `     Pattern ${patternId} not found in MySQL, skipping.`
          );
          continue;
        }

        // Prevent duplicate flags
        const [[existing]] = await db.execute(
          `SELECT flag_id
           FROM risk_flags
           WHERE clause_id = ? AND pattern_id = ?`,
          [clause.clause_id, patternId]
        );

        if (!existing) {
          // Store risk detection in MySQL
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

          flaggedCount++;

          console.log(
            `     Flagged! (category ${pattern.category_id})`
          );
        } else {
          skippedCount++;

          console.log(
            `     Already flagged, skipping.`
          );
        }
      }
    }

    console.log('\nDone analyzing contract.');

    return {
      contract_id: contractId,
      clauses_analyzed: clauses.length,
      new_flags: flaggedCount,
      existing_flags: skippedCount
    };

  } finally {
    await db.end();
  }
}


/**
 * Allow the script to still be executed directly from PowerShell.
 *
 * Example:
 * node --env-file=.env.local vector-db/analyze_risk.js
 */
async function main() {
  const db = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
  });

  const [[contract]] = await db.execute(
    `SELECT contract_id
     FROM contracts
     ORDER BY contract_id
     LIMIT 1`
  );

  await db.end();

  if (!contract) {
    throw new Error('No contracts found in the database.');
  }

  await runAnalysis(contract.contract_id);
}


// Only run main() when this file is executed directly.
// When imported by the Next.js API, runAnalysis() is used instead.
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  main().catch((error) => {
    console.error('\nError during risk analysis:');
    console.error(error);
    process.exit(1);
  });
}