import { describe, expect, it } from 'vitest';
import { FRAMEWORK } from '$lib/api/treeherder';
import {
	type AndroidTest,
	axisLabel,
	DEVICES,
	FRAMEWORKS,
	MOZPERFTEST_FRAMEWORK,
	TESTS,
	testByKey
} from './config';

describe('the test catalogue', () => {
	it('queries Speedometer under browsertime, not mozperftest', () => {
		const speedometer = TESTS.filter((test) => test.suite === 'speedometer3');

		expect(speedometer.length).toBeGreaterThan(0);
		for (const test of speedometer) {
			expect(test.framework, test.key).toBe(FRAMEWORK.browsertime);
		}
	});

	it('queries the startup tests under mozperftest', () => {
		const startup = TESTS.filter((test) => test.suite !== 'speedometer3');

		expect(startup.length).toBeGreaterThan(0);
		for (const test of startup) {
			expect(test.framework, test.key).toBe(MOZPERFTEST_FRAMEWORK);
		}
	});

	// The signature fan-out is driven by this, so a catalogue spanning several
	// frameworks must produce a request per framework per device.
	it('lists every framework the catalogue uses, once each', () => {
		expect([...FRAMEWORKS].sort()).toEqual(
			[...new Set(TESTS.map((test) => test.framework))].sort()
		);
		expect(FRAMEWORKS).toContain(FRAMEWORK.browsertime);
		expect(FRAMEWORKS).toContain(MOZPERFTEST_FRAMEWORK);
	});

	it('has a unique key per test, since test names alone collide', () => {
		const keys = TESTS.map((test) => test.key);
		expect(new Set(keys).size).toBe(keys.length);

		// Why the key exists at all: at least one Treeherder test name is
		// published under more than one suite, so keying rows on the test name
		// would collapse them.
		const names = TESTS.map((test) => test.test);
		expect(new Set(names).size).toBeLessThan(names.length);
	});

	// A recording is a `<suite>.tgz` published by the mozperftest job, so the
	// flag is only meaningful there -- the browsertime speedometer3 jobs have no
	// such artifact and a chip offering a video would 404. Which mozperftest
	// suites happen to publish one is inventory, and lives in config.ts alone.
	it('only claims recordings for mozperftest suites', () => {
		const withVideo = TESTS.filter((test) => test.hasVideo);

		expect(withVideo.length).toBeGreaterThan(0);
		for (const test of withVideo) {
			expect(test.framework, test.key).toBe(MOZPERFTEST_FRAMEWORK);
		}
	});

	it('falls back to the first test for an unknown key', () => {
		expect(testByKey('made-up')).toBe(TESTS[0]);
	});
});

describe('devices', () => {
	it('gives each device a distinct Treeherder platform', () => {
		const platforms = DEVICES.map((device) => device.platform);
		expect(new Set(platforms).size).toBe(DEVICES.length);
		for (const platform of platforms) expect(platform).toMatch(/^android-hw-/);
	});
});

describe('axisLabel', () => {
	// Built here rather than looked up by key: `testByKey` falls back to
	// TESTS[0], so a renamed key would silently label a different test's axis
	// instead of failing, and the catalogue is not what is under test.
	const test = (overrides: Partial<AndroidTest>): AndroidTest => ({
		key: 'x',
		label: 'X',
		suite: 'x',
		test: 'x',
		framework: MOZPERFTEST_FRAMEWORK,
		unit: 'ms',
		lowerIsBetter: true,
		hasVideo: false,
		...overrides
	});

	it('names the unit and the direction', () => {
		expect(axisLabel(test({ unit: 'ms', lowerIsBetter: true }))).toBe('ms (lower is better)');
		expect(axisLabel(test({ unit: 'mWh', lowerIsBetter: true }))).toBe('mWh (lower is better)');
	});

	// A unitless measurement is a score, and on this page scores go up.
	it('calls a unitless measurement a score', () => {
		expect(axisLabel(test({ unit: '', lowerIsBetter: false }))).toBe('Score (higher is better)');
	});
});
