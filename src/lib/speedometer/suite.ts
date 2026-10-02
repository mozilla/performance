/**
 * What the Speedometer dashboard needs to know about the suite it shows.
 *
 * Two pages share the dashboard: Speedometer 3, and Speedometer Experimental,
 * which upstream added in 6221d70 as a `mode` flag tested in seventeen places
 * through speedometer-metrics.js. Here the differences are one object per
 * suite, and the dashboard reads them from it.
 */
import type { ChartAnnotation } from '$lib/annotations';
import { perfherderGraphsUrl, type PerfSignature, type Repository } from '$lib/api/treeherder';
import type { BrowserKey } from '$lib/browsers';
import {
	ALL_TESTS,
	type PlatformConfig,
	PLATFORMS,
	SPEEDOMETER_FRAMEWORK,
	SPEEDOMETER_SUITE
} from './config';
import { availableSubtests } from './data';
import { type SpeedometerSchema, speedometerSchema } from './state';
import { type RowNaming, SPEEDOMETER_NAMING } from './table';

export interface PerfherderSeries {
	repository: Repository;
	signatureId: number;
}

export interface SpeedometerSuite {
	/** Page title and headings, e.g. `Speedometer 3`. */
	name: string;
	/** A sentence under the platform picker, for a suite that needs introducing. */
	description?: string;
	breakdownTitle: string;
	/** Treeherder's suite name. */
	suite: string;
	platforms: readonly PlatformConfig[];
	schema: SpeedometerSchema;
	/**
	 * The chart, table and URL key for a signature's or measurement's test
	 * name. Treeherder gives a suite's own summary no test name at all.
	 */
	testKey(test: string | undefined): string;
	/** Breakdown table rows, in order. */
	tests(signatures: readonly PerfSignature[]): readonly string[];
	/** The tests charted by "Load All Subtest Charts". */
	subtests(signatures: readonly PerfSignature[]): readonly string[];
	naming(signatures: readonly PerfSignature[]): RowNaming;
	/** Table columns. Omitted means every browser, Safari where the platform has it. */
	browsers?: readonly BrowserKey[];
	/** Whether the page offers Perfherder alert markers. */
	alerts: boolean;
	/** Dashed markers on every chart, for changes to the suite itself. */
	annotations?: readonly ChartAnnotation[];
	/** Where the chart title links. */
	perfherderUrl(series: readonly PerfherderSeries[]): string;
}

/** The signatures behind some set of a suite's tests. */
export function signaturesForTests(
	suite: SpeedometerSuite,
	signatures: readonly PerfSignature[],
	tests: readonly string[]
): PerfSignature[] {
	return signatures.filter((sig) => tests.includes(suite.testKey(sig.test)));
}

export const SPEEDOMETER3: SpeedometerSuite = {
	name: 'Speedometer 3',
	breakdownTitle: 'Breakdown: Speedometer 3 Subtests',
	suite: SPEEDOMETER_SUITE,
	platforms: PLATFORMS,
	schema: speedometerSchema,
	// The suite summary has no test name and is not shown; `score` is the
	// overall the page charts.
	testKey: (test) => test ?? '',
	tests: () => ALL_TESTS,
	subtests: availableSubtests,
	naming: () => SPEEDOMETER_NAMING,
	alerts: true,
	perfherderUrl: (series) =>
		perfherderGraphsUrl(series.map((each) => ({ ...each, framework: SPEEDOMETER_FRAMEWORK })))
};
