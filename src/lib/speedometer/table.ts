import type { Measurement } from '$lib/api/treeherder';
import {
	BROWSERS,
	type BrowserDef,
	type BrowserKey,
	classify,
	isSafariApplication
} from '$lib/browsers';
import { type ColumnType, type SortDirection, sortRows } from '$lib/sort';
import { displayName, lowerIsBetter, unitFor } from './config';

/** Browsers compared against Firefox, in table column order. */
const COMPARISON_KEYS: readonly BrowserKey[] = ['chrome', 'car', 'safari', 'safari-tp'];

/** Browsers whose raw value gets a column, in table column order. */
const VALUE_KEYS: readonly BrowserKey[] = [
	'firefox',
	'firefox-nar',
	'chrome',
	'car',
	'safari',
	'safari-tp'
];

export interface TableColumn {
	key: BrowserKey;
	browser: BrowserDef;
}

export interface CellValue {
	/** Mean over the trailing 7 days, or null when there is no data. */
	average: number | null;
	formatted: string;
}

export interface DiffValue {
	/** Fraction, e.g. 0.12 for 12% slower than Firefox. Null when incomparable. */
	diff: number | null;
	formatted: string;
	/** Colour reflecting whether the difference is good or bad for Firefox. */
	color: string;
}

export interface TableRow {
	test: string;
	label: string;
	unit: string;
	values: Record<BrowserKey, CellValue>;
	diffs: Record<BrowserKey, DiffValue>;
}

export interface ComparisonTable {
	valueColumns: TableColumn[];
	diffColumns: TableColumn[];
	rows: TableRow[];
}

const AVERAGE_WINDOW_DAYS = 7;

export function trailingAverage(measurements: readonly Measurement[]): number | null {
	if (measurements.length === 0) return null;

	let mostRecent = -Infinity;
	for (const m of measurements) {
		const time = m.date.getTime();
		if (time > mostRecent) mostRecent = time;
	}

	const cutoff = mostRecent - AVERAGE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

	let sum = 0;
	let count = 0;
	for (const m of measurements) {
		if (m.date.getTime() >= cutoff) {
			sum += m.value;
			count++;
		}
	}

	return count === 0 ? null : sum / count;
}

/**
 * Time differences are relative to Firefox; score differences to the competitor.
 * Positive means slower for times and higher for scores. diffColor accounts for
 * that direction so colours consistently indicate better or worse performance.
 */
export function relativeDiff(
	firefox: number | null,
	other: number | null,
	lowerIsBetter: boolean
): number | null {
	if (firefox === null || other === null || firefox <= 0 || other <= 0) return null;

	return lowerIsBetter
		? (firefox - other) / firefox // times: Firefox slower => positive
		: (firefox - other) / other; // score: Firefox higher => positive
}

export function diffColor(diff: number | null, lowerIsBetter: boolean): string {
	if (diff === null) return 'inherit';

	// Normalise so that positive is always "worse for Firefox".
	const badness = lowerIsBetter ? diff : -diff;

	if (badness < -0.05) return 'green';
	if (badness < 0.095) return 'black';
	if (badness < 0.2) return '#b38f00';
	return 'red';
}

function round(value: number, decimals: number): number {
	const factor = 10 ** decimals;
	return Math.round(value * factor) / factor;
}

function formatValue(average: number | null, unit: string): string {
	return average === null ? 'N/A' : `${round(average, 2)}${unit}`;
}

function formatDiff(diff: number | null): string {
	return diff === null ? 'N/A' : `${round(diff * 100, 1)}%`;
}

/**
 * How a row key is displayed and which direction is good.
 *
 * Defaults to the Speedometer meaning of a key, which is the test name. Android
 * overrides all three because its rows are catalogue entries rather than test
 * names: two of its tests are both called `applink_startup` (they differ by
 * suite), and its units and directions vary per row -- ms, mWh and a score.
 */
export interface RowNaming {
	label(key: string): string;
	/** Suffix appended to a value, including any leading space. */
	unit(key: string): string;
	lowerIsBetter(key: string): boolean;
}

export const SPEEDOMETER_NAMING: RowNaming = {
	label: displayName,
	unit: unitFor,
	lowerIsBetter
};

export interface TableOptions {
	supportsSafari: boolean;
	/**
	 * Which browsers get columns, overriding the default set and
	 * `supportsSafari`. NavBench is Firefox-only, and a table of Chrome and
	 * Chromium-as-Release columns reading `N/A` on every row is worse than no
	 * columns.
	 */
	browsers?: readonly BrowserKey[];
	/** Which row a measurement belongs to. Defaults to its test name. */
	rowKey?(measurement: Measurement): string;
	naming?: RowNaming;
	/**
	 * Average Safari over this platform only. The chart keeps Safari's history
	 * from the platform it used to run on, but averaging the two together would
	 * skew the numbers while both are inside the window.
	 */
	safariPlatform?: string;
}

export function buildComparisonTable(
	measurements: readonly Measurement[],
	keys: readonly string[],
	options: TableOptions
): ComparisonTable {
	const rowKey = options.rowKey ?? ((measurement: Measurement) => measurement.test);
	const naming = options.naming ?? SPEEDOMETER_NAMING;

	const allowed = options.browsers ? new Set(options.browsers) : null;
	const included = (key: BrowserKey) =>
		allowed
			? allowed.has(key)
			: options.supportsSafari || (key !== 'safari' && key !== 'safari-tp');

	const column = (key: BrowserKey): TableColumn => ({
		key,
		browser: BROWSERS.find((b) => b.key === key)!
	});

	const byRow = new Map<string, Map<BrowserKey, Measurement[]>>();
	for (const measurement of measurements) {
		const browser = classify(measurement);
		if (!browser) continue;
		if (
			options.safariPlatform &&
			isSafariApplication(measurement.application) &&
			measurement.platform !== options.safariPlatform
		) {
			continue;
		}

		const key = rowKey(measurement);
		let browsers = byRow.get(key);
		if (!browsers) {
			browsers = new Map();
			byRow.set(key, browsers);
		}
		const existing = browsers.get(browser.key);
		if (existing) {
			existing.push(measurement);
		} else {
			browsers.set(browser.key, [measurement]);
		}
	}

	const rows: TableRow[] = [];

	for (const test of keys) {
		const browsers = byRow.get(test);
		if (!browsers) continue;

		const averages = {} as Record<BrowserKey, number | null>;
		for (const { key } of BROWSERS) {
			averages[key] = trailingAverage(browsers.get(key) ?? []);
		}

		// No Firefox number means nothing to compare against.
		if (averages.firefox === null) continue;

		const unit = naming.unit(test);
		const lower = naming.lowerIsBetter(test);

		const values = {} as Record<BrowserKey, CellValue>;
		for (const { key } of BROWSERS) {
			values[key] = { average: averages[key], formatted: formatValue(averages[key], unit) };
		}

		const diffs = {} as Record<BrowserKey, DiffValue>;
		for (const key of COMPARISON_KEYS) {
			const diff = relativeDiff(averages.firefox, averages[key], lower);
			diffs[key] = { diff, formatted: formatDiff(diff), color: diffColor(diff, lower) };
		}

		rows.push({ test, label: naming.label(test), unit, values, diffs });
	}

	return {
		valueColumns: VALUE_KEYS.filter(included).map(column),
		diffColumns: COMPARISON_KEYS.filter(included).map(column),
		rows
	};
}

export const TEST_COLUMN = 'test';

export const valueColumnKey = (browser: BrowserKey) => `value:${browser}`;
export const diffColumnKey = (browser: BrowserKey) => `diff:${browser}`;

/** Text for the name column, numeric for every other. */
export function comparisonColumnType(key: string): ColumnType {
	return key === TEST_COLUMN ? 'text' : 'number';
}

export function comparisonSortValue(row: TableRow, key: string): unknown {
	if (key === TEST_COLUMN) return row.label;

	const separator = key.indexOf(':');
	if (separator === -1) return null;
	const kind = key.slice(0, separator);
	const browser = key.slice(separator + 1) as BrowserKey;

	if (kind === 'value') return row.values[browser]?.average ?? null;
	if (kind === 'diff') return row.diffs[browser]?.diff ?? null;
	return null;
}

/**
 * `table.rows` in sort order, or untouched when nothing is sorted.
 *
 * The unsorted case returns the original array rather than a copy: the natural
 * order is the configured test order, which is meaningful on its own, and it is
 * what the table shows until someone clicks a header.
 */
export function sortComparisonRows(
	rows: readonly TableRow[],
	column: string,
	direction: SortDirection
): readonly TableRow[] {
	if (column === '') return rows;
	return sortRows(
		rows,
		(row) => comparisonSortValue(row, column),
		comparisonColumnType(column),
		direction
	);
}
