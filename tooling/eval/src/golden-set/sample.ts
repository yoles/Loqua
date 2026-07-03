import type { GoldenCase } from './types.ts';

// PLACEHOLDER — prouve le runner (lot 1.7). Le vrai golden set (50-100 énoncés)
// est constitué au lot 2.5, puis enrichi à chaque faux positif/négatif réel.
export const SAMPLE_GOLDEN_SET: readonly GoldenCase[] = [
  {
    id: 'sample-standup-1',
    scenario: 'standup',
    input: { text: 'Yesterday I have make a deploy of the new feature', variant: 'en-US' },
    mustDetect: ['grammar'],
    referenceCorrection: 'Yesterday I deployed the new feature',
  },
  {
    id: 'sample-review-1',
    scenario: 'code-review',
    input: { text: 'This function it is too much complicated', variant: 'en-US' },
    mustDetect: ['syntax', 'word-order'],
    referenceCorrection: 'This function is way too complicated',
  },
];
