// Demonstrates Qdrant vector deletion using one isolated test point.
// Only TEST_POINT_ID is ever deleted. It cannot collide with real points:
// clause vectors use clause_id and pattern vectors use 10000 + pattern_id.
// Run (from the vector-db folder): QDRANT_URL=http://localhost:6333 node test_delete_vector.js
import qdrant, { COLLECTION, ensureCollection, deletePointById } from './qdrant.js';
import { generateEmbedding } from './embedding.js';

const TEST_POINT_ID = 999999001;

async function getPoint(id) {
  const points = await qdrant.retrieve(COLLECTION, { ids: [id], with_payload: true });
  return points[0] || null;
}

async function countPoints() {
  return (await qdrant.count(COLLECTION, { exact: true })).count;
}

async function main() {
  await ensureCollection();
  const before = await countPoints();
  console.log(`Points before test: ${before}`);

  if (await getPoint(TEST_POINT_ID)) {
    throw new Error(`Test ID ${TEST_POINT_ID} already exists; refusing to continue.`);
  }

  const vector = await generateEmbedding('Temporary test clause used only to demonstrate vector deletion.');
  await qdrant.upsert(COLLECTION, {
    wait: true,
    points: [{ id: TEST_POINT_ID, vector, payload: { type: 'test_vector', mysql_id: null } }],
  });

  const inserted = await getPoint(TEST_POINT_ID);
  if (!inserted || inserted.payload?.type !== 'test_vector') {
    throw new Error('Test vector was not inserted correctly.');
  }
  console.log(`PASS: test vector exists (payload.type=${inserted.payload.type}); count=${await countPoints()}`);

  // Safety check: only delete the point if it is really the test vector.
  await deletePointById(TEST_POINT_ID);

  if (await getPoint(TEST_POINT_ID)) {
    throw new Error('Test vector still exists after deletion.');
  }
  const after = await countPoints();
  console.log(`PASS: test vector deleted; count=${after}`);

  if (after !== before) {
    throw new Error(`Point count changed: before=${before}, after=${after}`);
  }
  console.log('PASS: existing vectors untouched (point count unchanged).');
}

main().catch((error) => {
  console.error('FAIL:', error.message);
  process.exitCode = 1;
});
