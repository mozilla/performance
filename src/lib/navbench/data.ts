/**
 * Data loading for the Navigation Benchmark route.
 *
 * Not built on `loadSignatures`: that exists to fetch Firefox from the selected
 * repository and the competitors from mozilla-central, and NavBench has neither
 * a repository choice nor competitors. Going straight to `fetchSignatures` is
 * shorter than the options it would take to disable both halves.
 */
import {
	fetchSignatures,
	type Measurement,
	type PerfSignature,
	selectCanonicalSignatures
} from '$lib/api/treeherder';
import { loadMeasurements } from '$lib/speedometer/data';
import {
	NAVBENCH_FRAMEWORK,
	NAVBENCH_REPOSITORY,
	NAVBENCH_SUITE,
	OVERALL_TEST,
	platformByKey,
	testKey
} from './config';

/** Days of history behind the comparison table, independent of the chart range. */
export const TABLE_WINDOW_DAYS = 30;

/** Every nav-bench signature on a platform, both Firefox and Nightly-as-Release. */
export async function loadNavBenchSignatures(
	platformKey: string,
	signal?: AbortSignal
): Promise<PerfSignature[]> {
	const { platforms } = platformByKey(platformKey);

	const perPlatform = await Promise.all(
		platforms.map((platform) =>
			fetchSignatures(
				{ repository: NAVBENCH_REPOSITORY, framework: NAVBENCH_FRAMEWORK, platform },
				signal
			).catch(
				// A platform pair can include one that never runs the benchmark --
				// windows-hwref publishes shippable only -- and that is not an error.
				() => [] as PerfSignature[]
			)
		)
	);

	const navBench = perPlatform
		.flat()
		.filter((sig) => sig.suite === NAVBENCH_SUITE && sig.application === 'firefox');

	return selectCanonicalSignatures(navBench);
}

/** Signatures for one test, overall or per-site. */
export function signaturesForTest(
	signatures: readonly PerfSignature[],
	test: string
): PerfSignature[] {
	return signatures.filter((sig) => testKey(sig.test) === test);
}

export async function loadNavBenchMeasurements(
	signatures: readonly PerfSignature[],
	days: number,
	signal?: AbortSignal
): Promise<Measurement[]> {
	return loadMeasurements(signatures, days, false, signal, NAVBENCH_FRAMEWORK);
}

/** Row key for the comparison table: the test, with the overall named. */
export function rowKeyFor(measurement: Measurement): string {
	return testKey(measurement.test);
}

/**
 * The tests present on this platform, overall first and the rest alphabetical.
 *
 * Discovered rather than configured: the benchmark's site list changes, and the
 * page should follow it without an edit here.
 */
export function testsIn(signatures: readonly PerfSignature[]): string[] {
	const tests = new Set(signatures.map((sig) => testKey(sig.test)));
	tests.delete(OVERALL_TEST);
	return [OVERALL_TEST, ...[...tests].sort()];
}
