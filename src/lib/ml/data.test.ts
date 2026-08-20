import { describe, expect, it } from 'vitest';
import { indexRows, mergeLatencies, type MlPoint, normalizeRows, valuesFor } from './data';

const row = (overrides: Partial<Parameters<typeof normalizeRows>[0][number]> = {}) => ({
	date: '2026-08-01T00:00:00Z',
	test: 'some-test',
	suite: 'browser_ml_engine_perf.js',
	platform: 'windows11-64-24h2-shippable',
	repository: 'mozilla-central',
	value: 100,
	...overrides
});

describe('normalizeRows', () => {
	it('renames total-memory-usage to residual-memory-usage', () => {
		expect(normalizeRows([row({ test: 'FOO-total-memory-usage' })])[0].test).toBe(
			'FOO-residual-memory-usage'
		);
	});

	it.each([
		['browser_ml_engine_perf.js', 'Basic ML Perf'],
		['browser_ml_autofill_perf.js', 'Autofill'],
		['browser_ml_summarizer_perf.js', 'Summarizer'],
		['browser_ml_smart_tab_perf.js', 'Smart Tab Grouping']
	])('renames suite %s to %s', (raw, expected) => {
		expect(normalizeRows([row({ suite: raw })])[0].suite).toBe(expected);
	});

	it('strips the feature prefix from smart tab test names', () => {
		const [topic] = normalizeRows([
			row({ suite: 'browser_ml_smart_tab_perf.js', test: 'SMART-TAB-TOPIC-model-run-latency' })
		]);
		expect(topic.test).toBe('Topic-model-run-latency');

		const [embedding] = normalizeRows([
			row({ suite: 'browser_ml_smart_tab_perf.js', test: 'SMART-TAB-EMBEDDING-peak-memory-usage' })
		]);
		expect(embedding.test).toBe('Embedding-peak-memory-usage');
	});

	it('strips the model prefix from multi-engine test names', () => {
		expect(
			normalizeRows([
				row({ suite: 'browser_ml_engine_multi_perf.js', test: 'qwen-model-run-latency' })
			])[0].test
		).toBe('model-run-latency');
	});

	it('drops multi-engine rows that belong to the Suggest dashboard', () => {
		expect(
			normalizeRows([
				row({ suite: 'browser_ml_engine_multi_perf.js', test: 'intent-model-run-latency' }),
				row({ suite: 'browser_ml_engine_multi_perf.js', test: 'suggest-model-run-latency' })
			])
		).toEqual([]);
	});

	it('keeps SUGGEST rows and INTENT rows that are not model-run-latency', () => {
		const kept = normalizeRows([
			row({ suite: 'browser_ml_suggest_feature_perf.js', test: 'SUGGEST-latency' }),
			row({ suite: 'browser_ml_suggest_feature_perf.js', test: 'INTENT-peak-memory-usage' })
		]);

		expect(kept.map((r) => [r.suite, r.test])).toEqual([
			['Suggest', 'latency'],
			['Suggest', 'peak-memory-usage']
		]);
	});

	it('drops INTENT model-run-latency rows', () => {
		expect(
			normalizeRows([
				row({ suite: 'browser_ml_suggest_feature_perf.js', test: 'INTENT-model-run-latency' })
			])
		).toEqual([]);
	});

	it('leaves an unrecognised suite alone', () => {
		expect(normalizeRows([row({ suite: 'browser_ml_future_perf.js' })])[0].suite).toBe(
			'browser_ml_future_perf.js'
		);
	});
});

describe('indexRows', () => {
	it('indexes by lower-cased suite, test and platform', () => {
		const index = indexRows([row({ suite: 'Autofill', test: 'Form-Fill', platform: 'Win' })]);
		expect(index.autofill['form-fill'].win).toHaveLength(1);
	});

	it('sorts points by date', () => {
		const index = indexRows([
			row({ date: '2026-08-03T00:00:00Z', value: 3 }),
			row({ date: '2026-08-01T00:00:00Z', value: 1 }),
			row({ date: '2026-08-02T00:00:00Z', value: 2 })
		]);

		const points = index['browser_ml_engine_perf.js']['some-test']['windows11-64-24h2-shippable'];
		expect(points.map((p) => p.value)).toEqual([1, 2, 3]);
	});

	it('skips rows with an unparseable date', () => {
		expect(indexRows([row({ date: 'whenever' })])).toEqual({});
	});
});

describe('valuesFor', () => {
	const index = indexRows([row({ suite: 'Autofill', test: 'Form-Fill' })]);

	it('looks up case-insensitively', () => {
		expect(valuesFor(index, 'AUTOFILL', 'FORM-FILL', 'WINDOWS11-64-24H2-SHIPPABLE')).toHaveLength(
			1
		);
	});

	it('returns an empty array for a missing series', () => {
		expect(valuesFor(index, 'nope', 'nope', 'nope')).toEqual([]);
	});
});

describe('mergeLatencies', () => {
	const at = (iso: string, value: number): MlPoint => ({ date: new Date(iso), value });

	it('adds the two measurements of the same run', () => {
		const merged = mergeLatencies(
			[at('2026-08-01', 10), at('2026-08-02', 20)],
			[at('2026-08-01', 1), at('2026-08-02', 2)]
		);

		expect(merged.map((p) => p.value)).toEqual([11, 22]);
	});

	it('pairs by timestamp, not by position', () => {
		const merged = mergeLatencies(
			[at('2026-08-01', 10), at('2026-08-02', 20), at('2026-08-03', 30)],
			[at('2026-08-01', 1), at('2026-08-03', 3)]
		);

		expect(merged.map((p) => [p.date.toISOString().slice(0, 10), p.value])).toEqual([
			['2026-08-01', 11],
			['2026-08-03', 33]
		]);
	});

	it('drops a run present in only one series rather than charting a partial sum', () => {
		const merged = mergeLatencies(
			[at('2026-08-01', 10), at('2026-08-02', 20)],
			[at('2026-08-01', 1)]
		);
		expect(merged).toHaveLength(1);
	});

	it('returns nothing when the series do not overlap', () => {
		expect(mergeLatencies([at('2026-08-01', 10)], [at('2026-09-01', 1)])).toEqual([]);
	});

	it('handles empty inputs', () => {
		expect(mergeLatencies([], [])).toEqual([]);
	});
});
