import 'dotenv/config';
import { QdrantClient } from '@qdrant/js-client-rest';

const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL
});

export const COLLECTION =
  process.env.QDRANT_COLLECTION || 'risk_clauses';

export async function ensureCollection() {
  try {
    await qdrant.createCollection(COLLECTION, {
      vectors: {
        size: 384,
        distance: 'Cosine',
      },
    });
  } catch (error) {
    const message = error?.data?.status?.error || error?.message || '';
    if (error?.status !== 409 && !message.toLowerCase().includes('already exists')) {
      throw new Error(`Unable to create Qdrant collection "${COLLECTION}": ${message}`);
    }
  }

  const collection = await qdrant.getCollection(COLLECTION);
  if (collection.status !== 'green') {
    const optimizerError = typeof collection.optimizer_status === 'object'
      ? collection.optimizer_status.error
      : collection.optimizer_status;
    throw new Error(
      `Qdrant collection "${COLLECTION}" is not healthy `
      + `(status: ${collection.status || 'unknown'}). `
      + `${optimizerError || 'Check Qdrant storage and collection logs.'}`
    );
  }
}

export async function searchSimilarPatterns(vector, limit = 4) {
  const response = await qdrant.query(COLLECTION, {
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

export default qdrant;