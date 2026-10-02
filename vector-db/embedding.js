import { pipeline } from '@xenova/transformers';

let embedder = null;

async function getEmbedder() {
  if (!embedder) {
    console.log('Loading embedding model...');

    embedder = await pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2'
    );

    console.log('Embedding model loaded.');
  }

  return embedder;
}

export async function generateEmbedding(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Text must be a non-empty string.');
  }

  const model = await getEmbedder();

  const output = await model(text, {
    pooling: 'mean',
    normalize: true
  });

  return Array.from(output.data);
}