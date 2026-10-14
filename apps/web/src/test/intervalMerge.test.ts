import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  mergeIntervals,
  computeTotalWatchedSeconds,
  computeWatchedChunks,
  getFurthestWatchedPosition,
  type Interval,
} from '@cb/lib/intervalMerge';

describe('intervalMerge pure functions', () => {
  describe('Unit tests (real-world cases)', () => {
    it('handles empty intervals', () => {
      expect(mergeIntervals([])).toEqual([]);
      expect(computeTotalWatchedSeconds([])).toBe(0);
      expect(computeWatchedChunks([], 5, 10)).toEqual({});
      expect(getFurthestWatchedPosition({})).toBe(0);
    });

    it('merges overlapping intervals correctly', () => {
      const input: Interval[] = [
        [0, 5],
        [3, 8],
        [10, 15],
      ];
      const merged = mergeIntervals(input);
      expect(merged).toEqual([
        [0, 8],
        [10, 15],
      ]);
      expect(computeTotalWatchedSeconds(input)).toBe(13);
    });

    it('handles replay of same interval without double counting', () => {
      const input: Interval[] = [
        [0, 10],
        [0, 10],
        [2, 5],
      ];
      expect(mergeIntervals(input)).toEqual([[0, 10]]);
      expect(computeTotalWatchedSeconds(input)).toBe(10);
    });

    it('quantises 5-second chunks with 80% coverage (4 seconds minimum)', () => {
      // Chunk 0: [0, 5] -> watched 4.5s -> SHOULD be marked
      // Chunk 1: [5, 10] -> watched 2.0s -> SHOULD NOT be marked
      const input: Interval[] = [
        [0, 4.5],
        [7, 9],
      ];
      const chunks = computeWatchedChunks(input, 5, 2, 0.8);
      expect(chunks).toEqual({ '0': true });
      expect(chunks['1']).toBeUndefined();
    });

    it('calculates furthest contiguous watched position', () => {
      const chunks: Record<string, true> = { '0': true, '1': true, '3': true };
      // 0 and 1 are contiguous -> 2 * 5 = 10s
      expect(getFurthestWatchedPosition(chunks, 5)).toBe(10);
    });
  });

  describe('Property-based tests with fast-check', () => {
    it('property: total watched seconds never exceeds total video duration', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 10, max: 3600 }), // durationSec
          fc.array(
            fc.tuple(
              fc.float({ min: 0, max: 3600, noNaN: true }),
              fc.float({ min: 0, max: 3600, noNaN: true }),
            ),
          ),
          (_durationSec, rawIntervals) => {
            const intervals: Interval[] = rawIntervals.map(([a, b]) =>
              a <= b ? [a, b] : [b, a],
            );
            const total = computeTotalWatchedSeconds(intervals);
            return total <= Math.max(...intervals.map(([, end]) => end), 0);
          },
        ),
      );
    });

    it('property: mergeIntervals produces non-overlapping, sorted intervals', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.tuple(
              fc.float({ min: 0, max: 1000, noNaN: true }),
              fc.float({ min: 0, max: 1000, noNaN: true }),
            ),
          ),
          (rawIntervals) => {
            const intervals: Interval[] = rawIntervals.map(([a, b]) =>
              a <= b ? [a, b] : [b, a],
            );
            const merged = mergeIntervals(intervals);

            for (let i = 0; i < merged.length - 1; i++) {
              const current = merged[i]!;
              const next = merged[i + 1]!;

              // Strict gap between merged intervals
              if (current[1] >= next[0]) return false;
              // Sorted by start
              if (current[0] > next[0]) return false;
            }
            return true;
          },
        ),
      );
    });

    it('property: replaying identical intervals does not increase unique watched seconds', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.tuple(
              fc.float({ min: 0, max: 500, noNaN: true }),
              fc.float({ min: 0, max: 500, noNaN: true }),
            ),
          ),
          (rawIntervals) => {
            const intervals: Interval[] = rawIntervals.map(([a, b]) =>
              a <= b ? [a, b] : [b, a],
            );
            const singleRunTotal = computeTotalWatchedSeconds(intervals);
            const doubleRunTotal = computeTotalWatchedSeconds([...intervals, ...intervals]);

            return Math.abs(singleRunTotal - doubleRunTotal) < 0.00001;
          },
        ),
      );
    });
  });
});
