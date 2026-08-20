import { describe, expect, it } from 'vitest';
import { defaultGroup, groupByScenario, replicatesByTest, scenarioOf } from './video';
import type { PerfherderData } from '$lib/api/taskcluster';
import type { TarEntry } from '$lib/api/targz';
import type { VideoGroup } from '$lib/replicate-videos';

const entry = (name: string): TarEntry => ({ name, data: new Uint8Array(0) });

const ROOT = 'browsertime-videos-annotated/nav-bench/pages';

/** Paths as they appear in a real archive. */
const video = (domain: string, scenario: string, n: number) =>
	entry(`${ROOT}/${domain}/${scenario}/data/video/${n}.mp4`);

describe('scenarioOf', () => {
	it('reads the scenario directory out of a recording path', () => {
		expect(scenarioOf(`${ROOT}/www_bbc_com/bbc-nav-subnav/data/video/3.mp4`)).toBe(
			'bbc-nav-subnav'
		);
	});

	it('tells two scenarios of the same site apart', () => {
		expect(scenarioOf(`${ROOT}/www_bbc_com/bbc-nav-load/data/video/1.mp4`)).toBe('bbc-nav-load');
		expect(scenarioOf(`${ROOT}/www_bbc_com/bbc-nav-subnav/data/video/1.mp4`)).toBe(
			'bbc-nav-subnav'
		);
	});

	it('returns undefined for a path that is not a recording', () => {
		expect(scenarioOf('browsertime-videos-annotated/nav-bench/browsertime.json')).toBeUndefined();
		expect(scenarioOf('browsertime-videos-annotated/jobs.json')).toBeUndefined();
	});
});

describe('groupByScenario', () => {
	it('groups the recordings by scenario and skips everything else', () => {
		const entries = [
			entry('browsertime-videos-annotated/jobs.json'),
			entry('browsertime-videos-annotated/nav-bench/browsertime.json'),
			video('www_bbc_com', 'bbc-nav-load', 1),
			video('www_bbc_com', 'bbc-nav-load', 2),
			video('www_bbc_com', 'bbc-nav-subnav', 1),
			video('www_amazon_ca', 'amazon-nav-load', 1)
		];

		const groups = groupByScenario(entries);

		expect([...groups.keys()].sort()).toEqual([
			'amazon-nav-load',
			'bbc-nav-load',
			'bbc-nav-subnav'
		]);
		expect(groups.get('bbc-nav-load')).toHaveLength(2);
	});

	it('groups a site it has never heard of', () => {
		const groups = groupByScenario([video('example_com', 'example-nav-load', 1)]);

		expect([...groups.keys()]).toEqual(['example-nav-load']);
	});
});

describe('replicatesByTest', () => {
	/** Trimmed from a real NavBench perfherder-data.json. */
	const data: PerfherderData = {
		suites: [
			{
				name: 'nav-bench-overall',
				value: 201.94,
				unit: 'score',
				subtests: [
					{ name: 'amazon-nav-load-score', value: 198.009, replicates: [136.986, 204.082] },
					{ name: 'bbc-nav-subnav-score', value: 181.194, replicates: [174.419, 192.308] }
				]
			},
			{
				name: 'nav-bench.amazon-nav-load',
				unit: 'ms',
				subtests: [{ name: 'amazon-nav-load-min-si', value: 267, replicates: [438, 294] }]
			}
		]
	};

	it('keys replicates by the Treeherder test name', () => {
		const byTest = replicatesByTest(data);

		expect(byTest.get('amazon-nav-load-score')).toEqual([136.986, 204.082]);
		expect(byTest.get('bbc-nav-subnav-score')).toEqual([174.419, 192.308]);
	});

	/**
	 * The per-site `nav-bench.<site>` suites report min-SpeedIndex in ms, which
	 * is a different measurement from the score the chart plots. Reading only the
	 * overall suite keeps the panel's numbers comparable with the chart's.
	 */
	it('ignores the per-site suites that report a different metric', () => {
		expect(replicatesByTest(data).has('amazon-nav-load-min-si')).toBe(false);
	});

	it('returns nothing when the artifact has no overall suite', () => {
		expect(replicatesByTest({ suites: [] }).size).toBe(0);
	});
});

describe('defaultGroup', () => {
	const groups = [
		{ key: 'amazon-nav-load', label: '', videos: [] },
		{ key: 'bbc-nav-subnav', label: '', videos: [] }
	] as VideoGroup[];

	it('opens the site whose chart was clicked', () => {
		expect(defaultGroup(groups, 'bbc-nav-subnav-score')).toBe('bbc-nav-subnav');
	});

	// The overall chart is a geomean over every site, so no group is more
	// relevant than another.
	it('falls back to the first group for the overall chart', () => {
		expect(defaultGroup(groups, 'overall')).toBe('amazon-nav-load');
	});

	it('falls back when the charted site has no recordings in this job', () => {
		expect(defaultGroup(groups, 'reddit-nav-load-score')).toBe('amazon-nav-load');
	});
});
