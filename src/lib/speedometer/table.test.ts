import { describe, expect, it } from 'vitest';
import { measurement } from '../../tests/factories';
import {
	buildComparisonTable,
	diffColor,
	diffColumnKey,
	relativeDiff,
	sortComparisonRows,
	TEST_COLUMN,
	trailingAverage,
	valueColumnKey
} from './table';

const day = 24 * 60 * 60 * 1000;
const at = (daysAgo: number) => new Date(Date.parse('2026-08-20T00:00:00Z') - daysAgo * day);

describe('trailingAverage', () => {
	it('returns null for no measurements', () => {
		expect(trailingAverage([])).toBeNull();
	});

	it('averages measurements within 7 days of the most recent one', () => {
		expect(
			trailingAverage([
				measurement({ date: at(0), value: 10 }),
				measurement({ date: at(3), value: 20 }),
				measurement({ date: at(6), value: 30 })
			])
		).toBe(20);
	});

	it('excludes measurements older than the window', () => {
		expect(
			trailingAverage([
				measurement({ date: at(0), value: 10 }),
				measurement({ date: at(30), value: 1000 })
			])
		).toBe(10);
	});

	it('anchors the window to the group, not to wall-clock time', () => {
		expect(
			trailingAverage([
				measurement({ date: at(60), value: 10 }),
				measurement({ date: at(63), value: 30 })
			])
		).toBe(20);
	});

	it('is unaffected by input order', () => {
		const points = [
			measurement({ date: at(6), value: 30 }),
			measurement({ date: at(0), value: 10 }),
			measurement({ date: at(3), value: 20 })
		];
		expect(trailingAverage(points)).toBe(trailingAverage([...points].reverse()));
	});
});

// The direction a row is read in: a time row is better lower, a score row is
// better higher.
const LOWER_IS_BETTER = true;
const HIGHER_IS_BETTER = false;

describe('relativeDiff', () => {
	it('measures a time difference relative to Firefox', () => {
		// Firefox 110ms vs Chrome 100ms: Firefox is 9.09% of its own time slower.
		expect(relativeDiff(110, 100, LOWER_IS_BETTER)).toBeCloseTo(0.0909, 4);
	});

	it('measures a score difference relative to the competitor', () => {
		// Firefox 110 vs Chrome 100: Firefox scores 10% higher than Chrome.
		expect(relativeDiff(110, 100, HIGHER_IS_BETTER)).toBeCloseTo(0.1, 4);
	});

	it('returns null when either side is missing or non-positive', () => {
		expect(relativeDiff(null, 100, HIGHER_IS_BETTER)).toBeNull();
		expect(relativeDiff(100, null, HIGHER_IS_BETTER)).toBeNull();
		expect(relativeDiff(0, 100, HIGHER_IS_BETTER)).toBeNull();
		expect(relativeDiff(100, 0, HIGHER_IS_BETTER)).toBeNull();
	});
});

// The palette itself is deliberately not asserted -- restyling the table is a
// change that breaks nothing, and a test naming the exact hex would fail on it.
// What is asserted is the structure: four distinct bands at the thresholds, and
// the same colour for the same news whichever way the row reads.
describe('diffColor', () => {
	it('puts the thresholds in four distinct bands', () => {
		const bands = [
			diffColor(-0.1, LOWER_IS_BETTER), // Firefox faster
			diffColor(0, LOWER_IS_BETTER),
			diffColor(0.15, LOWER_IS_BETTER),
			diffColor(0.5, LOWER_IS_BETTER) // Firefox much slower
		];

		expect(new Set(bands).size).toBe(4);
	});

	// Same thresholds, opposite direction: on the score row a positive diff
	// means Firefox is ahead, which is good, so it must read as the good end of
	// the scale rather than the bad one.
	it('inverts the direction for the score row', () => {
		expect(diffColor(0.1, HIGHER_IS_BETTER)).toBe(diffColor(-0.1, LOWER_IS_BETTER));
		expect(diffColor(-0.5, HIGHER_IS_BETTER)).toBe(diffColor(0.5, LOWER_IS_BETTER));
		expect(diffColor(0.1, HIGHER_IS_BETTER)).not.toBe(diffColor(-0.5, HIGHER_IS_BETTER));
	});

	// Functional rather than cosmetic: `inherit` is how the cell says "no
	// comparison", so it must not be one of the bands.
	it('has no colour when there is nothing to compare', () => {
		expect(diffColor(null, LOWER_IS_BETTER)).toBe('inherit');
	});
});

describe('buildComparisonTable', () => {
	const rowFor = (test: string, values: Array<[string, number]>) =>
		values.map(([application, value]) => measurement({ test, application, date: at(1), value }));

	it('builds a row per test with values and diffs', () => {
		const table = buildComparisonTable(
			rowFor('TodoMVC-Vue/total', [
				['firefox', 110],
				['chrome', 100]
			]),
			['TodoMVC-Vue/total'],
			{ supportsSafari: false }
		);

		expect(table.rows).toHaveLength(1);
		expect(table.rows[0].values.firefox.formatted).toBe('110 ms');
		expect(table.rows[0].diffs.chrome.formatted).toBe('9.1%');
		expect(table.rows[0].diffs.chrome.color).toBe('black');
	});

	it('formats the score row without a unit', () => {
		const table = buildComparisonTable(rowFor('score', [['firefox', 42.5]]), ['score'], {
			supportsSafari: false
		});

		expect(table.rows[0].values.firefox.formatted).toBe('42.5');
		expect(table.rows[0].label).toBe('Overall Score');
	});

	it('drops rows with no Firefox data', () => {
		const table = buildComparisonTable(
			rowFor('TodoMVC-Vue/total', [['chrome', 100]]),
			['TodoMVC-Vue/total'],
			{ supportsSafari: false }
		);

		expect(table.rows).toEqual([]);
	});

	it('reports N/A for a browser with no data rather than dropping the row', () => {
		const table = buildComparisonTable(
			rowFor('TodoMVC-Vue/total', [['firefox', 110]]),
			['TodoMVC-Vue/total'],
			{ supportsSafari: false }
		);

		expect(table.rows[0].values.chrome.formatted).toBe('N/A');
		expect(table.rows[0].diffs.chrome.formatted).toBe('N/A');
	});

	it('preserves the requested test order', () => {
		const measurements = [
			...rowFor('TodoMVC-Vue/total', [['firefox', 1]]),
			...rowFor('score', [['firefox', 2]]),
			...rowFor('Editor-TipTap/total', [['firefox', 3]])
		];

		const table = buildComparisonTable(
			measurements,
			['Editor-TipTap/total', 'TodoMVC-Vue/total', 'score'],
			{ supportsSafari: false }
		);

		expect(table.rows.map((r) => r.test)).toEqual([
			'Editor-TipTap/total',
			'TodoMVC-Vue/total',
			'score'
		]);
	});

	it('omits Safari columns on platforms that do not run Safari', () => {
		const table = buildComparisonTable([], [], { supportsSafari: false });

		expect(table.valueColumns.map((c) => c.key)).toEqual([
			'firefox',
			'firefox-nar',
			'chrome',
			'car'
		]);
		expect(table.diffColumns.map((c) => c.key)).toEqual(['chrome', 'car']);
	});

	it('includes Safari columns where Safari runs', () => {
		const table = buildComparisonTable([], [], { supportsSafari: true });

		expect(table.valueColumns.map((c) => c.key)).toEqual([
			'firefox',
			'firefox-nar',
			'chrome',
			'car',
			'safari',
			'safari-tp'
		]);
		expect(table.diffColumns).toHaveLength(4);
	});

	it('separates Firefox from Nightly-as-Release by platform', () => {
		const table = buildComparisonTable(
			[
				measurement({ test: 'score', application: 'firefox', value: 100, date: at(1) }),
				measurement({
					test: 'score',
					application: 'firefox',
					platform: 'macosx1500-aarch64-nightlyasrelease',
					value: 200,
					date: at(1)
				})
			],
			['score'],
			{ supportsSafari: false }
		);

		expect(table.rows[0].values.firefox.average).toBe(100);
		expect(table.rows[0].values['firefox-nar'].average).toBe(200);
	});

	it('averages Safari over its current platform only', () => {
		const safariPlatform = 'macosx2700-aarch64-shippable';
		const table = buildComparisonTable(
			[
				measurement({ test: 'score', application: 'firefox', value: 100, date: at(1) }),
				measurement({ test: 'score', application: 'safari', value: 50, date: at(1) }),
				measurement({
					test: 'score',
					application: 'safari',
					platform: safariPlatform,
					value: 80,
					date: at(1)
				}),
				measurement({ test: 'score', application: 'safari-tp', value: 60, date: at(1) })
			],
			['score'],
			{ supportsSafari: true, safariPlatform }
		);

		expect(table.rows[0].values.firefox.average).toBe(100);
		expect(table.rows[0].values.safari.average).toBe(80);
		expect(table.rows[0].values['safari-tp'].average).toBeNull();
	});
});

describe('sortComparisonRows', () => {
	const table = buildComparisonTable(
		[
			measurement({ test: 'TodoMVC-Vue/total', application: 'firefox', date: at(1), value: 300 }),
			measurement({ test: 'TodoMVC-Vue/total', application: 'chrome', date: at(1), value: 100 }),
			measurement({ test: 'Editor-TipTap/total', application: 'firefox', date: at(1), value: 100 }),
			measurement({ test: 'Editor-TipTap/total', application: 'chrome', date: at(1), value: 200 }),
			measurement({ test: 'Charts-chartjs/total', application: 'firefox', date: at(1), value: 200 })
		],
		['TodoMVC-Vue/total', 'Editor-TipTap/total', 'Charts-chartjs/total'],
		{ supportsSafari: false }
	);

	const labels = (rows: readonly { label: string }[]) => rows.map((row) => row.label);

	it('leaves the configured order alone when nothing is sorted', () => {
		expect(sortComparisonRows(table.rows, '', 'asc')).toBe(table.rows);
	});

	it('sorts by test name', () => {
		expect(labels(sortComparisonRows(table.rows, TEST_COLUMN, 'asc'))).toEqual([
			'Charts-chartjs',
			'Editor-TipTap',
			'TodoMVC-Vue'
		]);
	});

	it('sorts by a browser value column, numerically', () => {
		expect(labels(sortComparisonRows(table.rows, valueColumnKey('firefox'), 'asc'))).toEqual([
			'Editor-TipTap',
			'Charts-chartjs',
			'TodoMVC-Vue'
		]);
	});

	it('sorts by a difference column on the underlying number, not the formatted string', () => {
		// These are times, so lowerIsBetter and the diff is (firefox - other) /
		// firefox: Firefox is slower on TodoMVC-Vue (300 vs 100, +66.7%) and
		// faster on Editor-TipTap (100 vs 200, -100%). Opposite signs on purpose,
		// because ordering the rendered text would sort '-100.0%' by its leading
		// character rather than its value.
		expect(
			labels(sortComparisonRows(table.rows, diffColumnKey('chrome'), 'asc')).slice(0, 2)
		).toEqual(['Editor-TipTap', 'TodoMVC-Vue']);
		expect(
			labels(sortComparisonRows(table.rows, diffColumnKey('chrome'), 'desc')).slice(0, 2)
		).toEqual(['TodoMVC-Vue', 'Editor-TipTap']);
	});

	it('keeps rows with no value together at the end in both directions', () => {
		// Charts-chartjs has no Chrome measurement, so its diff is null. It must
		// not be flipped into the middle when the direction changes.
		const asc = labels(sortComparisonRows(table.rows, diffColumnKey('chrome'), 'asc'));
		const desc = labels(sortComparisonRows(table.rows, diffColumnKey('chrome'), 'desc'));
		expect(asc.at(-1)).toBe('Charts-chartjs');
		expect(desc.at(-1)).toBe('Charts-chartjs');
	});

	it('ignores a column key that means nothing', () => {
		expect(labels(sortComparisonRows(table.rows, 'value:nonsense', 'asc'))).toEqual(
			labels(table.rows)
		);
	});
});
