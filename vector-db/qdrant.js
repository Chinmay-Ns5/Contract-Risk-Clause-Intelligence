import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { QdrantClient } from '@qdrant/js-client-rest';

const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL
});

export const COLLECTION =
  process.env.QDRANT_COLLECTION || 'risk_clauses';

export async function ensureCollection(collectionName = COLLECTION) {
  try {
    await qdrant.createCollection(collectionName, {
      vectors: {
        size: 384,
        distance: 'Cosine',
      },
    });
  } catch (error) {
    const message = error?.data?.status?.error || error?.message || '';
    if (error?.status !== 409 && !message.toLowerCase().includes('already exists')) {
      throw new Error(`Unable to create Qdrant collection "${collectionName}": ${message}`);
    }
  }

  const collection = await qdrant.getCollection(collectionName);
  if (collection.status !== 'green') {
    const optimizerError = typeof collection.optimizer_status === 'object'
      ? collection.optimizer_status.error
      : collection.optimizer_status;
    throw new Error(
      `Qdrant collection "${collectionName}" is not healthy `
      + `(status: ${collection.status || 'unknown'}). `
      + `${optimizerError || 'Check Qdrant storage and collection logs.'}`
    );
  }
}

export async function searchSimilarPatterns(vector, limit = 4, collectionName = COLLECTION) {
  const response = await qdrant.query(collectionName, {
    query: vector,
    limit,
    filter: {
      must: [
        {
          key: 'type',
          match: {
            value: 'pattern'
          }
        }
      ]
    },
    with_payload: true
  });

  return response.points;
}

export async function deletePointById(id) {
  try {
    await qdrant.delete(COLLECTION, { wait: true, points: [id] });
    console.log(`Deleted Qdrant point ${id} from "${COLLECTION}".`);
  } catch (error) {
    const message = error?.data?.status?.error || error?.message || 'Unknown error';
    console.error(`Failed to delete Qdrant point ${id}: ${message}`);
    throw new Error(`Unable to delete Qdrant point ${id}: ${message}`);
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Point id for a clause vector. MySQL auto-increment clause_ids can be reused
// (e.g. after deletes and a counter reset) while stale Qdrant points remain, so
// new clause points get a random UUID that is stored in clauses.vector_id.
//  - vector_id is a UUID                  -> reuse it (re-indexing updates the same point)
//  - vector_id equals the clause_id       -> legacy point written by this clause; reuse it
//  - otherwise (NULL / anything else)     -> new UUID; any existing point is left untouched
export function clausePointId({ clause_id, vector_id }) {
  const existing = String(vector_id ?? '');
  if (UUID_PATTERN.test(existing)) return existing.toLowerCase();
  if (existing !== '' && existing === String(clause_id)) return Number(existing);
  return randomUUID();
}

export default qdrant;
