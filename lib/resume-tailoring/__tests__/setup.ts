import { beforeEach } from 'vitest';
import { setEmbedderForTesting } from '@/lib/resume-tailoring/embeddings';
import { setNlpForTesting } from '@/lib/resume-tailoring/nlp';

// Keep the suite fully offline and deterministic: never download the MiniLM
// embedding model or load the wink-nlp model implicitly. Tests that want to
// exercise those paths inject their own stubs explicitly.
beforeEach(() => {
  setEmbedderForTesting(null);
  setNlpForTesting(null);
});
