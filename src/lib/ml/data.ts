/**
 * The ML performance dataset published by mozilla/performance-data.
 *
 * It is a raw Redash query result (`query_result.data.rows`) of
 * (date, test, suite, platform, repository, value) rows -- ~144k of them --
 * which the dashboard renames and indexes before charting.
 */
import { fetchJson } from '$lib/api/http';

export const ML_DATA_URL =
	'https://raw.githubusercontent.com/mozilla/performance-data/refs/heads/main/ml-data.json';

interface RedashResult {
	query_result: { data: { rows: RawRow[] } };
}

interface RawRow {
	date: string;
	test: string;
	suite: string;
	platform: string;
	repository: string;
	value: number;
}

export interface MlPoint {
	date: Date;
	value: number;
}

/** suite -> test -> platform -> points, all keys lower-cased, dates ascending. */
export type MlIndex = Record<string, Record<string, Record<string, MlPoint[]>>>;

export const PLATFORMS = {
	windows11Ref: 'windows11-64-24h2-hw-ref-shippable',
	windows11: 'windows11-64-24h2-shippable',
	linuxHPE: 'linux1804-64-shippable',
	macOS: 'macosx1015-64-shippable-qr'
} as const;

export type PlatformKey = keyof typeof PLATFORMS;

export const PLATFORM_LABELS: Record<PlatformKey, string> = {
	windows11Ref: 'Windows 11 Reference',
	windows11: 'Windows 11',
	linuxHPE: 'Linux',
	macOS: 'macOS'
};

export const PLATFORM_DESCRIPTIONS: Record<PlatformKey, string> = {
	windows11Ref: 'Dell OptiPlex 7080, Intel Core i7-10700, 16GB RAM, 512GB SSD.',
	windows11: 'HP EliteBook 850 G7, Intel Core i5-10210U, 8GB RAM, 256GB SSD.',
	linuxHPE: 'HPE Moonshot m710x, Intel Xeon D-1587, 32GB RAM, 480GB SSD.',
	macOS: 'Apple Mac Mini R8, 8GB RAM, 256GB SSD.'
};

export const PLATFORM_KEYS = Object.keys(PLATFORMS) as PlatformKey[];
export const DEFAULT_PLATFORM: PlatformKey = 'windows11Ref';

export function normalizeRows(rows: readonly RawRow[]): RawRow[] {
	const out: RawRow[] = [];

	for (const row of rows) {
		let suite = row.suite;
		let test = row.test.replace('total-memory-usage', 'residual-memory-usage');

		if (suite === 'browser_ml_engine_perf.js') {
			suite = 'Basic ML Perf';
		} else if (suite === 'browser_ml_engine_multi_perf.js') {
			// The test name carries a prefix naming the model; use the rest.
			const fields = test.split('-');
			const prefix = fields.shift() ?? '';
			// Intent and suggest models belong to the Suggest dashboard, which
			// reads browser_ml_suggest_feature_perf.js instead.
			if (prefix.includes('intent') || prefix.includes('suggest')) continue;
			test = fields.join('-');
		} else if (suite === 'browser_ml_suggest_feature_perf.js') {
			const fields = test.split('-');
			const prefix = fields.shift() ?? '';
			const rest = fields.join('-');
			if (prefix.includes('INTENT') && !rest.includes('model-run-latency')) {
				suite = 'Suggest';
			} else if (prefix.includes('SUGGEST')) {
				suite = 'Suggest';
			} else {
				continue;
			}
			test = rest;
		} else if (suite === 'browser_ml_autofill_perf.js') {
			suite = 'Autofill';
			test = test.replace('AUTOFILL-', '');
		} else if (suite === 'browser_ml_summarizer_perf.js') {
			suite = 'Summarizer';
			test = test.replace('SUM-', '').replace('ONNX-COMMUNITY-', '').replace('XENOVA-', '');
		} else if (suite === 'browser_ml_smart_tab_perf.js') {
			suite = 'Smart Tab Grouping';
			test = test
				.replace('SMART-TAB-TOPIC-', 'Topic-')
				.replace('SMART-TAB-EMBEDDING-', 'Embedding-');
		}

		out.push({ ...row, suite, test });
	}

	return out;
}

/** Index rows by suite/test/platform, lower-cased, with dates sorted ascending. */
export function indexRows(rows: readonly RawRow[]): MlIndex {
	const index: MlIndex = {};

	for (const row of rows) {
		const suite = row.suite.toLowerCase();
		const test = row.test.toLowerCase();
		const platform = row.platform.toLowerCase();

		const time = Date.parse(row.date);
		if (Number.isNaN(time)) continue;

		((index[suite] ??= {})[test] ??= {})[platform] ??= [];
		index[suite][test][platform].push({ date: new Date(time), value: row.value });
	}

	for (const suite of Object.values(index)) {
		for (const test of Object.values(suite)) {
			for (const points of Object.values(test)) {
				points.sort((a, b) => a.date.getTime() - b.date.getTime());
			}
		}
	}

	return index;
}

export async function fetchMlData(signal?: AbortSignal): Promise<MlIndex> {
	const raw = await fetchJson<RedashResult>(ML_DATA_URL, { signal });
	return indexRows(normalizeRows(raw.query_result?.data?.rows ?? []));
}

export function valuesFor(
	index: MlIndex,
	suite: string,
	test: string,
	platform: string
): MlPoint[] {
	return index[suite.toLowerCase()]?.[test.toLowerCase()]?.[platform.toLowerCase()] ?? [];
}

export function mergeLatencies(first: readonly MlPoint[], second: readonly MlPoint[]): MlPoint[] {
	const byTime = new Map<number, number>();
	for (const point of second) byTime.set(point.date.getTime(), point.value);

	const merged: MlPoint[] = [];
	for (const point of first) {
		const other = byTime.get(point.date.getTime());
		if (other === undefined) continue;
		merged.push({ date: point.date, value: point.value + other });
	}

	return merged;
}
