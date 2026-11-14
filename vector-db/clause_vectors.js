import { generateEmbedding } from './embedding.js';
import qdrant, { COLLECTION, clausePointId, ensureCollection } from './qdrant.js';

// Embeds clauses and stores them in Qdrant without ever overwriting a point that
// belongs to another (possibly deleted) clause. See clausePointId() for the id rules.
//
// clauses: rows with clause_id, clause_text, vector_id and (optionally) contract_id.
// db:      connection/pool of the logged-in MySQL account (needs UPDATE on clauses.vector_id).
// options: collection / embed are injectable for isolated tests.
export async function indexClauseEmbeddings(clauses, db, { collection = COLLECTION, embed = generateEmbedding } = {}) {
  await ensureCollection(collection);
  const points = [];

  for (const clause of clauses) {
    points.push({
      id: clausePointId(clause),
      vector: await embed(clause.clause_text),
      payload: { mysql_id: clause.clause_id, contract_id: clause.contract_id ?? null, type: 'clause' },
    });
  }

  if (points.length === 0) return points;

  // Record the point id in MySQL before writing to Qdrant, so a retry after a
  // failed upsert reuses the same id instead of creating a duplicate point.
  for (const [index, point] of points.entries()) {
    if (String(clauses[index].vector_id ?? '') !== String(point.id)) {
      await db.execute(
        'UPDATE clauses SET vector_id = ? WHERE clause_id = ?',
        [String(point.id), clauses[index].clause_id]
      );
    }
  }

  await qdrant.upsert(collection, { points, wait: true });
  return points;
}
