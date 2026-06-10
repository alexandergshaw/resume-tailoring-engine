/**
 * Local sentence-embedding utility (no LLM, no network at request time).
 *
 * Uses @xenova/transformers to run the MiniLM sentence-transformer
 * (all-MiniLM-L6-v2) in ONNX, fully offline. Embeddings give meaning-based
 * relevance so a resume bullet can match a job requirement even with no shared
 * keywords. The model loads lazily and is cached at module scope so the
 * long-lived worker amortizes the one-time load cost.
 *
 * Graceful degradation: if the model can't load (offline CI, missing files),
 * `getEmbedder()` resolves to null and callers fall back to keyword behavior.
 * This mirrors the dual-backend pattern used for Supabase vs in-memory.
 */

export type Embedder = (texts: string[]) => Promise<number[][]>;

let embedderPromise: Promise<Embedder | null> | null = null;
let injectedEmbedder: Embedder | null | undefined;

/**
 * Test seam: force a specific embedder (or null to force the fallback path).
 * Pass `undefined` to clear the override and restore lazy loading.
 */
export function setEmbedderForTesting(embedder: Embedder | null | undefined): void {
  injectedEmbedder = embedder;
  embedderPromise = null;
}

export async function getEmbedder(): Promise<Embedder | null> {
  if (injectedEmbedder !== undefined) {
    return injectedEmbedder;
  }

  embedderPromise ??= loadEmbedder();
  return embedderPromise;
}

async function loadEmbedder(): Promise<Embedder | null> {
  try {
    const { pipeline } = await import('@xenova/transformers');
    const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

    return async (texts: string[]): Promise<number[][]> => {
      const output = await extractor(texts, { pooling: 'mean', normalize: true });
      // Transformers.js returns a Tensor; reshape to rows of embeddings.
      const data = Array.from(output.data as Float32Array);
      const dims = output.dims as number[];
      const rows = dims[0];
      const cols = dims[dims.length - 1];
      const result: number[][] = [];
      for (let r = 0; r < rows; r += 1) {
        result.push(data.slice(r * cols, (r + 1) * cols));
      }
      return result;
    };
  } catch (error) {
    console.error('Embedding model unavailable; falling back to keyword matching.', error);
    return null;
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
