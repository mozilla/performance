import { describe, expect, it } from 'vitest';
import { measurement } from '../../tests/factories';
import {
	a11yRows,
	beyondNoise,
	displayTimeChange,
	formatChange,
	pairByPush,
	sharedExtent
} from './a11y';

const day = 24 * 60 * 60 * 1000;
const at = (daysAgo: number) => new Date(Date.parse('2026-11-27T00:00:00Z') - daysAgo * day);

/** One NavBench run: plain, accessibility-enabled or Nightly-as-Release. */
function run(
	kind: 'off' | 'on' | 'nar',
	revision: string,
	value: number,
	options: { test?: string; daysAgo?: number; jobId?: number } = {}
) {
	return measurement({
		suite: kind === 'on' ? 'nav-bench-a11y-overall' : 'nav-bench-overall',
		application: 'firefox',
		platform:
			kind === 'nar' ? 'macosx1500-aarch64-nightlyasrelease' : 'macosx1500-aarch64-shippable',
		test: options.test ?? '',
		revision,
		value,
		date: at(options.daysAgo ?? 1),
		jobId: options.jobId ?? 1
	});
}

describe('displayTimeChange', () => {
	// Scores are 60000 / SpeedIndex, so a score of 100 is 600 ms and 80 is 750.
	it('is the relative change in SpeedIndex', () => {
		expect(displayTimeChange(100, 80)).toBeCloseTo(750 / 600 - 1);
	});

	it('is negative when the page displays sooner with accessibility on', () => {
		expect(displayTimeChange(100, 125)).toBeCloseTo(-0.2);
	});
});

describe('pairByPush', () => {
	it('pairs the two variants on the same push, oldest first', () => {
		const pairs = pairByPush(
			[
				run('off', 'b', 110, { daysAgo: 1 }),
				run('on', 'b', 100, { daysAgo: 1, jobId: 7 }),
				run('off', 'a', 120, { daysAgo: 2 }),
				run('on', 'a', 100, { daysAgo: 2 })
			],
			'overall'
		);

		expect(pairs.map((pair) => pair.revision)).toEqual(['a', 'b']);
		expect(pairs[1]).toMatchObject({ off: 110, on: 100, jobId: 7 });
		expect(pairs[1].change).toBeCloseTo(0.1);
	});

	it('skips pushes that ran only one variant', () => {
		const pairs = pairByPush(
			[run('off', 'a', 100), run('off', 'b', 100), run('on', 'b', 90), run('on', 'c', 90)],
			'overall'
		);

		expect(pairs.map((pair) => pair.revision)).toEqual(['b']);
	});

	it('averages retriggers within a push', () => {
		const [pair] = pairByPush(
			[run('off', 'a', 100), run('off', 'a', 110), run('on', 'a', 90), run('on', 'a', 100)],
			'overall'
		);

		expect(pair.off).toBe(105);
		expect(pair.on).toBe(95);
	});

	// Nightly-as-Release runs on the same pushes; pairing it would compare
	// two builds rather than accessibility off and on.
	it('compares against the shippable run, not Nightly-as-Release', () => {
		const [pair] = pairByPush(
			[run('nar', 'a', 200), run('off', 'a', 100), run('on', 'a', 90)],
			'overall'
		);

		expect(pair.off).toBe(100);
	});

	it('keeps each test to its own pairs', () => {
		const pairs = pairByPush(
			[
				run('off', 'a', 100),
				run('on', 'a', 90),
				run('off', 'a', 300, { test: 'wikipedia-nav-load-score' }),
				run('on', 'a', 200, { test: 'wikipedia-nav-load-score' })
			],
			'wikipedia-nav-load-score'
		);

		expect(pairs).toHaveLength(1);
		expect(pairs[0].change).toBeCloseTo(0.5);
	});
});

const site = (name: string) => `${name}-nav-load-score`;

const data = [
	run('off', 'a', 100),
	run('on', 'a', 98),
	run('off', 'b', 104),
	run('on', 'b', 96),
	run('off', 'a', 300, { test: site('wikipedia') }),
	run('on', 'a', 200, { test: site('wikipedia') }),
	run('off', 'a', 100, { test: site('bbc') }),
	run('on', 'a', 101, { test: site('bbc') })
];
const tests = ['overall', site('bbc'), site('reddit'), site('wikipedia')];

describe('a11yRows', () => {
	it('puts the overall first, then the largest change', () => {
		expect(a11yRows(data, tests).map((row) => row.test)).toEqual([
			'overall',
			site('wikipedia'),
			site('bbc')
		]);
	});

	it('drops a test with no paired pushes', () => {
		expect(a11yRows(data, tests).some((row) => row.test === site('reddit'))).toBe(false);
	});

	it('averages over the pushes and keeps the per-push spread', () => {
		const [overall] = a11yRows(data, tests);

		expect(overall.off).toBe(102);
		expect(overall.on).toBe(97);
		expect(overall.change).toBeCloseTo(102 / 97 - 1);
		expect(overall.min).toBeCloseTo(100 / 98 - 1);
		expect(overall.max).toBeCloseTo(104 / 96 - 1);
		expect(overall.pushes).toBe(2);
	});
});

describe('formatChange', () => {
	it('signs the value', () => {
		expect(formatChange(0.0423)).toBe('+4.2%');
		expect(formatChange(-0.008)).toBe('-0.8%');
		expect(formatChange(0)).toBe('0.0%');
	});
});

describe('beyondNoise', () => {
	it('only marks differences larger than push-to-push noise, in either direction', () => {
		expect(beyondNoise(0.05)).toBe(true);
		expect(beyondNoise(0.01)).toBe(false);
		expect(beyondNoise(-0.05)).toBe(true);
	});
});

describe('sharedExtent', () => {
	it('spans every row and zero, with room either side', () => {
		const extent = sharedExtent(a11yRows(data, tests));

		expect(extent.min).toBeLessThan(0);
		expect(extent.max).toBeGreaterThan(0.5);
	});
});
