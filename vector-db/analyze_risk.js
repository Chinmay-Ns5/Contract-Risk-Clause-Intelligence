import 'dotenv/config';
import mysql from 'mysql2/promise';
import path from 'path';
import { fileURLToPath } from 'url';

import { generateEmbedding } from './embedding.js';
import { searchSimilarPatterns } from './qdrant.js';

const SIMILARITY_THRESHOLD = 0.35;

/**
 * Create a MySQL database connection.
 */
async function createDbConnection() {
  return mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  });
}

/**
 * Analyze clauses for one specific contract.
 *
 * @param {number} contractId
 * @returns {Promise<object>} Analysis summary
 */
export async function runAnalysis(contractId) {
  if (!Number.isInteger(contractId) || contractId <= 0) {
    throw new Error(
      `Invalid contractId: ${contractId}. contractId must be a positive integer.`
    );
  }

  const db = await createDbConnection();

  console.log(`\nStarting risk analysis for contract ${contractId}...`);

  try {
    // ------------------------------------------------------------
    // 1. Verify that the contract exists
    // ------------------------------------------------------------
    const [[contract]] = await db.execute(
      `SELECT contract_id, title
       FROM contracts
       WHERE contract_id = ?`,
      [contractId]
    );

    if (!contract) {
      throw new Error(
        `Contract ${contractId} does not exist in the database.`
      );
    }

    console.log(`Contract: ${contract.title}`);

    // ------------------------------------------------------------
    // 2. Get ONLY clauses belonging to this contract
    // ------------------------------------------------------------
    const [clauses] = await db.execute(
      `SELECT clause_id, clause_text
       FROM clauses
       WHERE contract_id = ?
       ORDER BY clause_id`,
      [contractId]
    );

    console.log(
      `Found ${clauses.length} clause(s) to analyze for contract ${contractId}.`
    );

    if (clauses.length === 0) {
      console.log(
        `No clauses found for contract ${contractId}. Nothing to analyze.`
      );

      return {
        contract_id: contractId,
        contract_title: contract.title,
        clauses_analyzed: 0,
        new_flags: 0,
        existing_flags: 0,
      };
    }

    let flaggedCount = 0;
    let skippedCount = 0;

    // ------------------------------------------------------------
    // 3. Analyze each clause
    // ------------------------------------------------------------
    for (const clause of clauses) {
      const preview =
        clause.clause_text.length > 80
          ? `${clause.clause_text.substring(0, 80)}...`
          : clause.clause_text;

      console.log(`\nClause ${clause.clause_id}: "${preview}"`);

      // ----------------------------------------------------------
      // 4. Generate embedding
      // ----------------------------------------------------------
      console.log('  Generating embedding...');

      const vector = await generateEmbedding(clause.clause_text);

      // ----------------------------------------------------------
      // 5. Search Qdrant for similar risk patterns
      // ----------------------------------------------------------
      console.log('  Searching Qdrant...');

      const results = await searchSimilarPatterns(vector, 4);

      if (!results || results.length === 0) {
        console.log('  No similar risk patterns found.');
        continue;
      }

      // ----------------------------------------------------------
      // 6. Process matching risk patterns
      // ----------------------------------------------------------
      for (const match of results) {
        const patternId = match.payload?.mysql_id;
        const score = match.score;

        if (!patternId || typeof score !== 'number') {
          console.log('  Invalid Qdrant result, skipping.');
          continue;
        }

        console.log(
          `  -> Pattern ${patternId}, score: ${score.toFixed(4)}`
        );

        // Ignore results below similarity threshold
        if (score < SIMILARITY_THRESHOLD) {
          console.log(
            `     Below threshold (${SIMILARITY_THRESHOLD}), skipping.`
          );
          continue;
        }

        // --------------------------------------------------------
        // 7. Get category associated with risk pattern
        // --------------------------------------------------------
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

        // --------------------------------------------------------
        // 8. Prevent duplicate risk flags
        // --------------------------------------------------------
        const [[existing]] = await db.execute(
          `SELECT flag_id
           FROM risk_flags
           WHERE clause_id = ?
             AND pattern_id = ?`,
          [clause.clause_id, patternId]
        );

        if (existing) {
          skippedCount++;

          console.log(
            `     Already flagged as flag ${existing.flag_id}, skipping.`
          );

          continue;
        }

        // --------------------------------------------------------
        // 9. Store new risk detection
        // --------------------------------------------------------
        await db.execute(
          `INSERT INTO risk_flags
             (clause_id, pattern_id, similarity_score, category_id)
           VALUES (?, ?, ?, ?)`,
          [
            clause.clause_id,
            patternId,
            score,
            pattern.category_id,
          ]
        );

        flaggedCount++;

        console.log(
          `     FLAGGED! Pattern ${patternId}, category ${pattern.category_id}`
        );
      }
    }

    // ------------------------------------------------------------
    // 10. Return summary
    // ------------------------------------------------------------
    const summary = {
      contract_id: contractId,
      contract_title: contract.title,
      clauses_analyzed: clauses.length,
      new_flags: flaggedCount,
      existing_flags: skippedCount,
    };

    console.log('\n========================================');
    console.log('Risk analysis completed');
    console.log('========================================');
    console.log(`Contract ID      : ${summary.contract_id}`);
    console.log(`Contract         : ${summary.contract_title}`);
    console.log(`Clauses analyzed : ${summary.clauses_analyzed}`);
    console.log(`New flags        : ${summary.new_flags}`);
    console.log(`Existing flags   : ${summary.existing_flags}`);
    console.log('========================================\n');

    return summary;
  } finally {
    await db.end();
  }
}

/**
 * Standalone execution.
 *
 * Usage:
 *
 * node --env-file=.env.local vector-db/analyze_risk.js 1
 */
async function main() {
  console.log('Standalone risk analyzer started.');

  const contractIdArgument = process.argv[2];

  if (!contractIdArgument) {
    throw new Error(
      'Missing contractId.\n\n' +
      'Usage:\n' +
      'node --env-file=.env.local vector-db/analyze_risk.js <contractId>\n\n' +
      'Example:\n' +
      'node --env-file=.env.local vector-db/analyze_risk.js 1'
    );
  }

  const contractId = Number(contractIdArgument);

  if (!Number.isInteger(contractId) || contractId <= 0) {
    throw new Error(
      `Invalid contractId "${contractIdArgument}". ` +
      'Please provide a positive integer.'
    );
  }

  await runAnalysis(contractId);
}

/**
 * Run main() only when this file is executed directly.
 *
 * This version uses fileURLToPath(), which correctly handles
 * Windows paths.
 */
const currentFile = path.resolve(fileURLToPath(import.meta.url));
const executedFile = process.argv[1]
  ? path.resolve(process.argv[1])
  : null;

if (executedFile && currentFile === executedFile) {
  main().catch((error) => {
    console.error('\nError during risk analysis:');
    console.error(error.message || error);
    process.exit(1);
  });
}