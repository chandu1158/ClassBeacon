export type Interval = [number, number]; // [startSec, endSec]

/**
 * Merges overlapping and adjacent intervals.
 * Pure function suitable for property testing.
 */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return [];

  // Filter invalid intervals (start > end or negative)
  const valid = intervals
    .filter(([start, end]) => start >= 0 && end >= start)
    .sort((a, b) => a[0] - b[0]);

  if (valid.length === 0) return [];

  const merged: Interval[] = [valid[0]!];

  for (let i = 1; i < valid.length; i++) {
    const current = valid[i]!;
    const last = merged[merged.length - 1]!;

    if (current[0] <= last[1]) {
      // Overlapping or touching intervals
      last[1] = Math.max(last[1], current[1]);
    } else {
      merged.push(current);
    }
  }

  return merged;
}

/**
 * Calculates total unique watched seconds from merged intervals.
 */
export function computeTotalWatchedSeconds(intervals: Interval[]): number {
  const merged = mergeIntervals(intervals);
  return merged.reduce((total, [start, end]) => total + (end - start), 0);
}

/**
 * Quantises merged intervals into discrete chunks.
 * A chunk of length `chunkSec` is marked watched ONLY if the total played coverage
 * within that chunk's time window [chunkIndex * chunkSec, (chunkIndex + 1) * chunkSec]
 * is at least `thresholdRatio` (default 80%, i.e. 4s for a 5s chunk).
 */
export function computeWatchedChunks(
  intervals: Interval[],
  chunkSec = 5,
  totalChunks: number,
  thresholdRatio = 0.8,
): Record<string, true> {
  const merged = mergeIntervals(intervals);
  const chunks: Record<string, true> = {};
  const requiredCoverageSec = chunkSec * thresholdRatio;

  for (let index = 0; index < totalChunks; index++) {
    const chunkStart = index * chunkSec;
    const chunkEnd = (index + 1) * chunkSec;

    let coveredSec = 0;

    for (const [start, end] of merged) {
      if (end <= chunkStart || start >= chunkEnd) continue; // No overlap

      const overlapStart = Math.max(start, chunkStart);
      const overlapEnd = Math.min(end, chunkEnd);
      coveredSec += overlapEnd - overlapStart;
    }

    if (coveredSec >= requiredCoverageSec - 0.001) {
      chunks[index.toString()] = true;
    }
  }

  return chunks;
}

/**
 * Returns the furthest validly watched time (in seconds) based on contiguous watched chunks.
 * Used to enforce sequential seeking lock.
 */
export function getFurthestWatchedPosition(chunks: Record<string, true>, chunkSec = 5): number {
  let contiguousCount = 0;
  while (chunks[contiguousCount.toString()] === true) {
    contiguousCount++;
  }
  return contiguousCount * chunkSec;
}
