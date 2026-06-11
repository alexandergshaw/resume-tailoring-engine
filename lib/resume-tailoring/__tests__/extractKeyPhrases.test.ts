import { describe, expect, it } from 'vitest';
import { extractKeyPhrases } from '@/lib/resume-tailoring/extractKeyPhrases';
import { setNlpForTesting } from '@/lib/resume-tailoring/nlp';

// Stub mimicking the slice of wink-nlp the miner uses. POS tags are keyed off
// token text (whitespace-split) so phrase chunking is deterministic + offline.
function stubNlp(posByToken: Record<string, string>) {
  return {
    its: { pos: 'pos' },
    readDoc(text: string) {
      const tokens = text.split(/\s+/).filter(Boolean);
      return {
        tokens() {
          return {
            out(its?: unknown) {
              if (its === 'pos') {
                return tokens.map((token) => posByToken[token.toLowerCase()] ?? 'X');
              }
              return tokens;
            },
          };
        },
      };
    },
  };
}

describe('extractKeyPhrases (model unavailable — deterministic fallback)', () => {
  it('mines multi-word phrases a literal taxonomy would miss', async () => {
    setNlpForTesting(null);
    const phrases = await extractKeyPhrases(
      'Required: distributed systems experience\nResponsibilities: build observability tooling',
      null,
    );
    const texts = phrases.map((phrase) => phrase.text);
    expect(texts).toContain('distributed systems');
    expect(texts).toContain('observability tooling');
  });
});

describe('extractKeyPhrases (stubbed NLP noun-phrase chunking)', () => {
  it('captures noun phrases and tech tokens, ranking required above body', async () => {
    setNlpForTesting(
      stubNlp({
        'event-driven': 'ADJ',
        architecture: 'NOUN',
        scalable: 'ADJ',
        culture: 'NOUN',
      }),
    );

    const phrases = await extractKeyPhrases(
      'We value a scalable culture\nRequired: event-driven architecture and CI/CD',
      null,
    );
    const texts = phrases.map((phrase) => phrase.text.toLowerCase());

    expect(texts).toContain('event-driven architecture');
    expect(texts.some((text) => text.includes('ci/cd'))).toBe(true);

    const required = phrases.find((phrase) => phrase.text.toLowerCase() === 'event-driven architecture');
    const body = phrases.find((phrase) => phrase.text.toLowerCase() === 'scalable culture');
    expect(required).toBeDefined();
    expect(body).toBeDefined();
    expect(required!.weight).toBeGreaterThan(body!.weight);
    expect(required!.source).toBe('required');
  });
});
