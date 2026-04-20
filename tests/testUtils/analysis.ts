import type { AnalysisOutput, AnalysisResult } from '@analysis/pipeline';

/**
 * Narrows an AnalysisResult to a completed run. Tests that bypass the
 * wall-detection gate (via wallDetectionEnabled: false or no HF key)
 * always land on the 'completed' branch; this helper asserts that and
 * returns the narrowed type for ergonomic downstream access.
 */
export function expectCompleted(result: AnalysisResult): AnalysisOutput {
  if (result.kind !== 'completed') {
    throw new Error(
      `Expected analysis to complete, got kind=${result.kind} (reason=${
        'reason' in result ? result.reason : 'n/a'
      })`,
    );
  }
  return result;
}
