import { describe, expect, it } from 'vitest';
import {
	dateRange,
	failureRate,
	groupByEngine,
	OTHER_ENGINE,
	parseDay,
	totalsOf,
	UNATTRIBUTED
} from './engine';

type Row = Parameters<typeof groupByEngine>[0][number];

/**
 * The calendar day a Date names *locally*, which is the whole point: these
 * dates are days rather than instants, so `toISOString` would assert about UTC
 * and the suite would pass or fail on the machine's timezone.
 */
const localDay = (date: Date) =>
	`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const row = (overrides: Partial<Row> = {}): Row => ({
	date: '2026-07-12',
	engine_id: 'smart-tab-topic-engine',
	engine_creation_p5: 100,
	engine_creation_p50: 900,
	engine_creation_p75: 1200,
	engine_creation_p99: 4000,
	inference_p5: 10,
	inference_p50: 80,
	inference_p75: 120,
	inference_p99: 400,
	engine_creation_success_count: 1851,
	inference_success_count: 2113,
	engine_creation_failure_count: 809,
	inference_failure_count: 0,
	...overrides
});

describe('parseDay', () => {
	it('reads a bare date as a local calendar day, not as UTC midnight', () => {
		// The bug this exists to prevent: `Date.parse('2026-07-12')` is UTC
		// midnight, which formats as the 11th anywhere west of Greenwich, so
		// every date on the page would be a day early for most of the world.
		const date = parseDay('2026-07-12')!;
		expect(localDay(date)).toBe('2026-07-12');
		expect(date.getHours()).toBe(0);
	});

	it('still accepts a full timestamp, in case the query stops truncating', () => {
		expect(parseDay('2026-07-12T21:13:35Z')!.getTime()).toBe(Date.parse('2026-07-12T21:13:35Z'));
	});

	it('rejects out-of-range fields rather than rolling them over', () => {
		// `new Date(2026, 12, 40)` is a real date in 2027, so without the
		// round-trip check this would become a plausible wrong day.
		expect(parseDay('2026-13-40')).toBeNull();
		expect(parseDay('2026-02-30')).toBeNull();
	});

	it('rejects what is not a date at all', () => {
		expect(parseDay('not a date')).toBeNull();
		expect(parseDay('')).toBeNull();
	});
});

describe('groupByEngine', () => {
	it('groups rows by engine id', () => {
		const engines = groupByEngine([
			row({ engine_id: 'pdfjs' }),
			row({ engine_id: 'link-preview' }),
			row({ engine_id: 'pdfjs', date: '2026-07-13' })
		]);

		expect(engines.map((engine) => engine.id)).toEqual(['link-preview', 'pdfjs']);
		expect(engines[1].points).toHaveLength(2);
	});

	it('sorts each engine by date, whatever order the rows arrive in', () => {
		const engines = groupByEngine([
			row({ date: '2026-07-16' }),
			row({ date: '2026-07-12' }),
			row({ date: '2026-07-14' })
		]);

		expect(engines[0].points.map((point) => localDay(point.date))).toEqual([
			'2026-07-12',
			'2026-07-14',
			'2026-07-16'
		]);
	});

	it('names the null engine id instead of passing it through', () => {
		const engines = groupByEngine([row({ engine_id: null })]);
		expect(engines[0].id).toBe(UNATTRIBUTED);
		expect(engines[0].label).toBe(UNATTRIBUTED);
	});

	it('labels the Glean overflow bucket', () => {
		const engines = groupByEngine([row({ engine_id: OTHER_ENGINE })]);
		expect(engines[0].label).toContain('overflow');
	});

	it('orders the aggregate buckets after real engines', () => {
		// A plain `.sort()` puts `__other__` first, because `_` precedes every
		// letter -- ahead of every engine anyone came to look at.
		const engines = groupByEngine([
			row({ engine_id: OTHER_ENGINE }),
			row({ engine_id: null }),
			row({ engine_id: 'webextension' }),
			row({ engine_id: 'about-inference' })
		]);

		expect(engines.map((engine) => engine.id)).toEqual([
			'about-inference',
			'webextension',
			OTHER_ENGINE,
			UNATTRIBUTED
		]);
	});

	it('keeps null percentiles null and coerces null counts to zero', () => {
		// A failure-only day: the query's FULL JOIN leaves the success side null.
		const [engine] = groupByEngine([
			row({
				engine_creation_p50: null,
				inference_p50: null,
				engine_creation_success_count: null,
				inference_success_count: null,
				inference_failure_count: 4140
			})
		]);

		expect(engine.points[0].engineCreationP50).toBeNull();
		expect(engine.points[0].inferenceP50).toBeNull();
		expect(engine.points[0].engineCreationSuccess).toBe(0);
		expect(engine.points[0].inferenceFailure).toBe(4140);
	});

	it('drops rows with an unparseable date', () => {
		expect(groupByEngine([row({ date: 'not a date' })])).toEqual([]);
	});

	it('returns no engines for an empty dataset', () => {
		expect(groupByEngine([])).toEqual([]);
	});
});

describe('totalsOf', () => {
	it('sums each count across the window', () => {
		const [engine] = groupByEngine([
			row({ date: '2026-07-12', engine_creation_failure_count: 809, inference_success_count: 10 }),
			row({ date: '2026-07-13', engine_creation_failure_count: 1115, inference_success_count: 20 })
		]);

		expect(engine.totals.engineCreationFailure).toBe(809 + 1115);
		expect(engine.totals.inferenceSuccess).toBe(30);
	});

	it('is all zeroes for no points', () => {
		expect(totalsOf([])).toEqual({
			engineCreationSuccess: 0,
			engineCreationFailure: 0,
			inferenceSuccess: 0,
			inferenceFailure: 0
		});
	});
});

describe('failureRate', () => {
	it('is failures over attempts', () => {
		expect(failureRate(3, 1)).toBe(0.25);
	});

	it('is null when nothing was attempted, rather than 0 or NaN', () => {
		expect(failureRate(0, 0)).toBeNull();
	});

	it('is 1 when everything failed', () => {
		expect(failureRate(0, 5)).toBe(1);
	});
});

describe('dateRange', () => {
	it('spans every engine, not just the first', () => {
		const engines = groupByEngine([
			row({ engine_id: 'pdfjs', date: '2026-07-14' }),
			row({ engine_id: 'link-preview', date: '2026-07-12' }),
			row({ engine_id: 'webextension', date: '2026-07-18' })
		]);

		const range = dateRange(engines)!;
		expect(localDay(range.first)).toBe('2026-07-12');
		expect(localDay(range.last)).toBe('2026-07-18');
	});

	it('is null when there is nothing to span', () => {
		expect(dateRange([])).toBeNull();
	});
});
