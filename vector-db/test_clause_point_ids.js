// Isolated test of the collision-free clause point id strategy (clausePointId /
// indexClauseEmbeddings) and of pattern-only similarity search.
//
// Isolation:
//  - Uses a NEW, uniquely named Qdrant collection (cri_test_point_ids_<random>);
//    the real collection is only read (point ids + count, before and after).
//  - Uses a mock MySQL connection that records statements; no MySQL data is touched.
//  - Uses a deterministic fake embedder (no model download).
//  - Cleanup deletes exactly the point ids this test created, then drops the test
//    collection only if it is empty and carries the unique test prefix.
//
// Run: node vector-db/test_clause_point_ids.js   (needs QDRANT_URL)

import { createHash, randomUUID } from 'node:crypto';
import { indexClauseEmbeddings } from './clause_vectors.js';
import qdrant, { COLLECTION, clausePointId, ensureCollection, searchSimilarPatterns } from './qdrant.js';

const TEST_PREFIX = 'cri_test_point_ids_';
const TEST_COLLECTION = `${TEST_PREFIX}${randomUUID().slice(0, 8)}`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const createdPointIds = new Set();
let failures = 0;

function check(ok, message) {
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${message}`);
}

function fakeEmbed(text) {
  const vector = [];
  for (let i = 0; vector.length < 384; i++) {
    for (const byte of createHash('sha256').update(`${text}:${i}`).digest()) vector.push(byte / 255 - 0.5);
  }
  const v = vector.slice(0, 384);
  const norm = Math.hypot(...v);
  return v.map((x) => x / norm);
}

function mockDb(onExecute) {
  const calls = [];
  return {
    calls,
    async execute(sql, params) {
      calls.push({ sql, params });
      if (onExecute) await onExecute(sql, params);
      return [{ affectedRows: 1 }];
    },
  };
}

async function upsertTestPoint(id, text, payload) {
  await qdrant.upsert(TEST_COLLECTION, { wait: true, points: [{ id, vector: fakeEmbed(text), payload }] });
  createdPointIds.add(id);
}

async function getPoint(collection, id) {
  const [point] = await qdrant.retrieve(collection, { ids: [id], with_payload: true, with_vector: true });
  return point || null;
}

async function index(clauses, db) {
  const points = await indexClauseEmbeddings(clauses, db, { collection: TEST_COLLECTION, embed: async (t) => fakeEmbed(t) });
  points.forEach((p) => createdPointIds.add(p.id));
  return points;
}

async function allPointIds(collection) {
  const { points } = await qdrant.scroll(collection, { limit: 100000, with_payload: false, with_vector: false });
  return points.map((p) => String(p.id)).sort();
}

const count = async (collection) => (await qdrant.count(collection, { exact: true })).count;

async function main() {
  console.log('=== clausePointId rules (pure) ===');
  const fresh = clausePointId({ clause_id: 5, vector_id: null });
  check(UUID.test(fresh), 'clause without vector_id gets a random UUID');
  check(clausePointId({ clause_id: 5, vector_id: null }) !== fresh, 'two new clauses never share an id');
  check(clausePointId({ clause_id: 5, vector_id: fresh }) === fresh, 'existing UUID vector_id is reused');
  check(clausePointId({ clause_id: 5, vector_id: fresh.toUpperCase() }) === fresh, 'UUID comparison is case-insensitive');
  check(clausePointId({ clause_id: 5, vector_id: '5' }) === 5, 'legacy vector_id equal to own clause_id is reused (numeric)');
  check(UUID.test(clausePointId({ clause_id: 5, vector_id: '6' })), 'vector_id pointing at a different numeric id is not reused');

  const realIdsBefore = await allPointIds(COLLECTION);
  const realCountBefore = await count(COLLECTION);
  const existing = await qdrant.getCollections();
  if (existing.collections.some((c) => c.name === TEST_COLLECTION)) throw new Error('Test collection already exists; refusing to continue.');
  await ensureCollection(TEST_COLLECTION);
  console.log(`\nUsing isolated collection ${TEST_COLLECTION}; real collection "${COLLECTION}" has ${realCountBefore} points (read only).`);

  try {
    console.log('\n=== A. Reused auto-increment clause_id with a stale vector present ===');
    await upsertTestPoint(42, 'stale clause from a deleted contract', { type: 'clause', mysql_id: 42, marker: 'stale' });
    const staleBefore = await getPoint(TEST_COLLECTION, 42);
    let pointExistedAtUpdate = null;
    const dbA = mockDb(async (sql, params) => { pointExistedAtUpdate = Boolean(await getPoint(TEST_COLLECTION, params[0])); });
    const [pointA] = await index([{ clause_id: 42, contract_id: 9001, clause_text: 'new clause reusing id 42', vector_id: null }], dbA);
    check(UUID.test(pointA.id), `new clause stored under UUID ${pointA.id}, not 42`);
    const staleAfter = await getPoint(TEST_COLLECTION, 42);
    check(JSON.stringify(staleAfter.vector) === JSON.stringify(staleBefore.vector) && staleAfter.payload.marker === 'stale', 'stale point 42 untouched (vector + payload identical)');
    const storedA = await getPoint(TEST_COLLECTION, pointA.id);
    check(storedA?.payload.mysql_id === 42 && storedA.payload.type === 'clause' && storedA.payload.contract_id === 9001, 'new point payload links to MySQL clause 42 (mysql_id, type, contract_id)');
    check(dbA.calls.length === 1 && /UPDATE clauses SET vector_id = \? WHERE clause_id = \?/.test(dbA.calls[0].sql)
      && dbA.calls[0].params[0] === pointA.id && dbA.calls[0].params[1] === 42, 'clauses.vector_id updated to the UUID');
    check(pointExistedAtUpdate === false, 'vector_id recorded in MySQL before the Qdrant upsert (retry-safe)');

    console.log('\n=== B. Re-indexing the same clause (re-upload / re-analysis) ===');
    const countB = await count(TEST_COLLECTION);
    const dbB = mockDb();
    const [pointB] = await index([{ clause_id: 42, contract_id: 9001, clause_text: 'new clause reusing id 42', vector_id: pointA.id }], dbB);
    check(pointB.id === pointA.id, 'same point id reused');
    check(await count(TEST_COLLECTION) === countB, 'no duplicate point created');
    check(dbB.calls.length === 0, 'no MySQL update needed');

    console.log('\n=== C. Legacy clause whose vector_id equals its clause_id ===');
    await upsertTestPoint(7, 'legacy clause seven', { type: 'clause', mysql_id: 7 });
    const countC = await count(TEST_COLLECTION);
    const dbC = mockDb();
    const [pointC] = await index([{ clause_id: 7, contract_id: 9002, clause_text: 'legacy clause seven', vector_id: '7' }], dbC);
    check(pointC.id === 7 && await count(TEST_COLLECTION) === countC, 'legacy point 7 reused, no duplicate');
    check(dbC.calls.length === 0, 'existing record not modified');

    console.log('\n=== D. vector_id referring to a different point ===');
    await upsertTestPoint(99, 'someone else', { type: 'clause', mysql_id: 99, marker: 'other' });
    const otherBefore = await getPoint(TEST_COLLECTION, 99);
    const [pointD] = await index([{ clause_id: 8, contract_id: 9002, clause_text: 'clause eight', vector_id: '99' }], mockDb());
    const otherAfter = await getPoint(TEST_COLLECTION, 99);
    check(UUID.test(pointD.id), 'gets its own UUID');
    check(JSON.stringify(otherAfter.vector) === JSON.stringify(otherBefore.vector) && otherAfter.payload.marker === 'other', 'point 99 untouched');

    console.log('\n=== E. Batch of clauses ===');
    const batch = await index([1, 2, 3].map((n) => ({ clause_id: 500 + n, contract_id: 9003, clause_text: `batch clause ${n}`, vector_id: null })), mockDb());
    check(new Set(batch.map((p) => p.id)).size === 3 && batch.every((p) => UUID.test(p.id)), 'three distinct UUIDs');

    console.log('\n=== F. Similarity search still returns only patterns ===');
    await upsertTestPoint(10001, 'unlimited liability for all damages', { type: 'pattern', mysql_id: 1 });
    await upsertTestPoint(10002, 'automatic renewal of the agreement', { type: 'pattern', mysql_id: 2 });
    const results = await searchSimilarPatterns(fakeEmbed('new clause reusing id 42'), 4, TEST_COLLECTION);
    check(results.length === 2 && results.every((r) => r.payload.type === 'pattern'), `type=pattern filter applied (${results.length} results, clause points excluded even when identical)`);
    const exact = await searchSimilarPatterns(fakeEmbed('unlimited liability for all damages'), 4, TEST_COLLECTION);
    check(exact[0]?.payload.mysql_id === 1 && exact[0].score > 0.999, 'best match keeps mysql_id and cosine score');
  } finally {
    console.log('\n=== CLEANUP ===');
    const ids = [...createdPointIds];
    await qdrant.delete(TEST_COLLECTION, { wait: true, points: ids });
    const remaining = await count(TEST_COLLECTION);
    check(remaining === 0, `deleted exactly the ${ids.length} test points; ${remaining} left in test collection`);
    if (remaining === 0 && TEST_COLLECTION.startsWith(TEST_PREFIX)) {
      await qdrant.deleteCollection(TEST_COLLECTION);
      console.log(`  dropped empty test collection ${TEST_COLLECTION}`);
    }
    const realIdsAfter = await allPointIds(COLLECTION);
    check(JSON.stringify(realIdsAfter) === JSON.stringify(realIdsBefore) && await count(COLLECTION) === realCountBefore,
      `real collection "${COLLECTION}" unchanged (${realCountBefore} points, same ids)`);
  }

  console.log(`\n${failures === 0 ? 'ALL QDRANT POINT ID TESTS PASSED' : `${failures} FAILURE(S)`}`);
}

main().catch((error) => {
  console.error('Test crashed:', error);
  failures++;
}).finally(() => { process.exitCode = failures ? 1 : 0; });
