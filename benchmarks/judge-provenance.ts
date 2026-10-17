/** Comparing scores from different judges can mistake evaluator drift for improvement. */
export function assertMatchingJudges(before: Record<string, unknown>, after: Record<string, unknown>): void {
    for (const field of ['model', 'rubricVersion', 'rubricHash']) {
        if (typeof before[field] !== 'string' || !before[field] || before[field] !== after[field]) {
            throw Error(`Invalid comparison: judge ${field} differs or is missing; rejudge both runs with the same evaluator`);
        }
    }
    if (before.inputBuilderHash !== after.inputBuilderHash) {
        throw Error('Invalid comparison: judge input evidence builder differs; rejudge both runs with the same evaluator');
    }
}
