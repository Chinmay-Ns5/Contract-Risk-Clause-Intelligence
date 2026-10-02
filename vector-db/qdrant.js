import 'dotenv/config';
import { QdrantClient } from '@qdrant/js-client-rest';

const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL
});

export const COLLECTION =
  process.env.QDRANT_COLLECTION || 'risk_clauses';

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