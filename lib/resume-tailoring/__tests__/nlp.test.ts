import { describe, expect, it } from 'vitest';
import {
  insertKeywordGrammatically,
  leadingVerb,
  nounTokens,
  setNlpForTesting,
  strengthenVerb,
} from '@/lib/resume-tailoring/nlp';

// Minimal stub mimicking the slice of the wink-nlp API the util consumes.
// pos tags are keyed off token text so tests stay deterministic and offline.
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

describe('nlp fallback behavior (model unavailable)', () => {
  it('returns input unchanged when nlp is null', () => {
    setNlpForTesting(null);
    expect(leadingVerb('Built React services')).toBeNull();
    expect(nounTokens('Built React services')).toEqual([]);
    expect(strengthenVerb('Worked on services', 'engineered')).toBe('Worked on services');
    // No keyword present yet → trailing fallback qualifier added.
    expect(insertKeywordGrammatically('Built services', 'Kafka')).toBe('Built services with Kafka');
  });
});

describe('nlp POS-aware rewriting (stubbed model)', () => {
  it('detects the leading verb and noun tokens', () => {
    setNlpForTesting(stubNlp({ built: 'VERB', react: 'PROPN', services: 'NOUN' }));
    expect(leadingVerb('Built React services')).toBe('built');
    expect(nounTokens('Built React services')).toEqual(['react', 'services']);
  });

  it('strengthens a weak leading verb', () => {
    setNlpForTesting(stubNlp({ worked: 'VERB' }));
    expect(strengthenVerb('Worked on backend services', 'engineered')).toBe('Engineered on backend services');
  });

  it('leaves strong leading verbs untouched', () => {
    setNlpForTesting(stubNlp({ architected: 'VERB' }));
    expect(strengthenVerb('Architected platform', 'engineered')).toBe('Architected platform');
  });

  it('places a keyword as a grammatical modifier near nouns', () => {
    setNlpForTesting(stubNlp({ built: 'VERB', payment: 'NOUN', services: 'NOUN' }));
    expect(insertKeywordGrammatically('Built payment services', 'Kafka')).toBe('Built payment services using Kafka');
  });

  it('never duplicates a keyword already present', () => {
    setNlpForTesting(stubNlp({ built: 'VERB', kafka: 'PROPN' }));
    expect(insertKeywordGrammatically('Built Kafka pipelines', 'Kafka')).toBe('Built Kafka pipelines');
  });
});
