/**
 * Speedometer Experimental: the `speedometer-experimental` suite, which runs
 * Speedometer's experimental workloads and reports CPU time, GC and power
 * metrics alongside them.
 *
 * Upstream (6221d70) hardcodes the 42 test names and guesses each unit from
 * its name. Both are discovered from the signatures here instead: the test
 * list is what Treeherder has on the platform, and each signature carries its
 * own `measurement_unit` and `lower_is_better`. Upstream's guess got `score`
 * and `score-internal` wrong, charting them as lower-is-better.
 */
import { perfherder2Url, type PerfSignature } from '$lib/api/treeherder';
import { PLATFORMS, SPEEDOMETER_FRAMEWORK } from './config';
import { speedometerSchemaFor } from './state';
import type { SpeedometerSuite } from './suite';
import type { RowNaming } from './table';

export const EXPERIMENTAL_SUITE = 'speedometer-experimental';

/**
 * The suite's overall score, whose signature has no test name. Named so it
 * can be a table row and the default URL value, as NavBench's is.
 */
export const OVERALL_TEST = 'overall';

const PLATFORM_KEYS = ['windows', 'windows-hwref', 'linux', 'osxm4'];

export const EXPERIMENTAL_PLATFORMS = PLATFORMS.filter((platform) =>
	PLATFORM_KEYS.includes(platform.key)
);

export function experimentalTestKey(test: string | undefined): string {
	return test ? test : OVERALL_TEST;
}

/**
 * Every test on the platform, the overall first.
 *
 * The rest in code-unit order, as upstream lists them: the workloads are
 * capitalised and the metrics (`cpuTime`, `perfstats-*`, `powerUsage_*`) are
 * not, so the two groups stay apart.
 */
export function experimentalTests(signatures: readonly PerfSignature[]): string[] {
	const tests = new Set(signatures.map((sig) => experimentalTestKey(sig.test)));
	tests.delete(OVERALL_TEST);
	return [OVERALL_TEST, ...[...tests].sort()];
}

/** The workloads' totals, which are what "Load All Subtest Charts" shows upstream. */
export function experimentalSubtests(signatures: readonly PerfSignature[]): string[] {
	return experimentalTests(signatures).filter((test) => test.endsWith('/total'));
}

/** Labels from the test name, units and direction from the signature. */
export function experimentalNaming(signatures: readonly PerfSignature[]): RowNaming {
	const byTest = new Map<string, PerfSignature>();
	for (const sig of signatures) {
		const key = experimentalTestKey(sig.test);
		if (!byTest.has(key)) byTest.set(key, sig);
	}

	return {
		label: (test) => (test === OVERALL_TEST ? 'Overall Score' : test.replace(/\/total$/, '')),
		unit: (test) => {
			const unit = byTest.get(test)?.measurement_unit;
			return !unit || unit === 'score' ? '' : ` ${unit}`;
		},
		// Treeherder sends null for most tests in this suite. Every one of them is
		// a time or an energy figure, for which lower is better.
		lowerIsBetter: (test) => byTest.get(test)?.lower_is_better ?? true
	};
}

export const SPEEDOMETER_EXPERIMENTAL: SpeedometerSuite = {
	name: 'Speedometer Experimental',
	description:
		'Speedometer’s experimental workloads, with CPU time, garbage collection and power metrics.',
	breakdownTitle: 'Breakdown: Speedometer Experimental Metrics',
	suite: EXPERIMENTAL_SUITE,
	platforms: EXPERIMENTAL_PLATFORMS,
	schema: speedometerSchemaFor({
		os: 'windows',
		platformKeys: PLATFORM_KEYS,
		test: OVERALL_TEST,
		// Upstream's default; the page offers mozilla-central as well.
		repository: 'autoland'
	}),
	testKey: experimentalTestKey,
	tests: experimentalTests,
	subtests: experimentalSubtests,
	naming: experimentalNaming,
	// No Safari: the suite does not run it.
	browsers: ['firefox', 'firefox-nar', 'chrome', 'car'],
	alerts: false,
	annotations: [
		{
			date: '2026-09-29T17:44:27Z',
			label: 'Bug 2076189',
			description:
				'Switched the suite to the sp4 tag of the experimental workloads; scores before and after are not comparable',
			url: 'https://bugzilla.mozilla.org/show_bug.cgi?id=2076189'
		}
	],
	perfherderUrl: (series) =>
		perfherder2Url(series.map((each) => ({ ...each, framework: SPEEDOMETER_FRAMEWORK })))
};
