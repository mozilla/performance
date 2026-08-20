import { describe, expect, it } from 'vitest';
import { parseCsv } from '$lib/api/csv';
import type { ChartConfig } from './config';
import { latestValue, reshape, reshapePie } from './data';

const config = (overrides: Partial<ChartConfig> = {}): ChartConfig => ({
	url: 'https://example.org/q.csv',
	title: 'Test',
	...overrides
});

const rows = (text: string) => parseCsv(text);

describe('reshape, wide format', () => {
	it('turns one column per series into series arrays', () => {
		const data = reshape(
			rows('date,DoH,os_resolver\n2026-08-01,60,40\n2026-08-02,61,39'),
			config()
		);

		expect(data.labels).toEqual([Date.parse('2026-08-01'), Date.parse('2026-08-02')]);
		expect(data.series).toEqual({ DoH: [60, 61], os_resolver: [40, 39] });
	});

	it('keeps a blank cell as null rather than zero', () => {
		const data = reshape(rows('date,DoH\n2026-08-01,\n2026-08-02,61'), config());
		expect(data.series.DoH).toEqual([null, 61]);
	});

	it('skips rows with an unparseable date', () => {
		const data = reshape(rows('date,DoH\nnope,1\n2026-08-01,2'), config());
		expect(data.labels).toHaveLength(1);
	});
});

describe('reshape, long format', () => {
	const csv = [
		'date,protocol,ma_7day',
		'2026-08-01,HTTP/2,50',
		'2026-08-01,HTTP/3,50',
		'2026-08-02,HTTP/2,45',
		'2026-08-02,HTTP/3,55'
	].join('\n');

	it('pivots category rows into series', () => {
		const data = reshape(rows(csv), config({ format: 'long', valueColumn: 'ma_7day' }));

		expect(data.labels).toHaveLength(2);
		expect(data.series['HTTP/2']).toEqual([50, 45]);
		expect(data.series['HTTP/3']).toEqual([50, 55]);
	});

	it('detects long format from a non-numeric second column', () => {
		const data = reshape(rows(csv), config({ valueColumn: 'ma_7day' }));
		expect(Object.keys(data.series).sort()).toEqual(['HTTP/2', 'HTTP/3']);
	});

	it('fills a missing category on a date with null', () => {
		const sparse = ['date,protocol,v', '2026-08-01,a,1', '2026-08-02,a,2', '2026-08-02,b,3'].join(
			'\n'
		);
		const data = reshape(rows(sparse), config({ format: 'long' }));

		expect(data.series.a).toEqual([1, 2]);
		expect(data.series.b).toEqual([null, 3]);
	});

	it('orders labels chronologically regardless of file order', () => {
		const shuffled = ['date,c,v', '2026-08-03,a,3', '2026-08-01,a,1', '2026-08-02,a,2'].join('\n');
		const data = reshape(rows(shuffled), config({ format: 'long' }));

		expect(data.series.a).toEqual([1, 2, 3]);
	});

	it('falls back to the third column when the named value column is absent', () => {
		const data = reshape(rows(csv), config({ format: 'long', valueColumn: 'missing' }));
		expect(data.series['HTTP/2']).toEqual([50, 45]);
	});
});

describe('reshapePie', () => {
	it('reads label and value columns', () => {
		const data = reshapePie(
			rows('metric_key,percentage\nhttps,95\nhttp,5'),
			config({ chartType: 'pie', labelColumn: 'metric_key', valueColumn: 'percentage' })
		);

		expect(data).toEqual({ labels: ['https', 'http'], values: [95, 5] });
	});

	it('skips rows with no numeric value', () => {
		const data = reshapePie(
			rows('metric_key,percentage\nhttps,95\nhttp,'),
			config({ chartType: 'pie', labelColumn: 'metric_key', valueColumn: 'percentage' })
		);

		expect(data.labels).toEqual(['https']);
	});
});

describe('latestValue', () => {
	it('returns the last non-null value', () => {
		expect(latestValue([1, 2, null])).toBe(2);
	});

	it('returns null when every value is missing', () => {
		expect(latestValue([null, null])).toBeNull();
	});

	it('returns null for an empty series', () => {
		expect(latestValue([])).toBeNull();
	});
});

describe('empty input', () => {
	it('reshapes to empty series', () => {
		expect(reshape([], config())).toEqual({ labels: [], series: {} });
	});

	it('reshapes to an empty pie', () => {
		expect(reshapePie([], config())).toEqual({ labels: [], values: [] });
	});
});
