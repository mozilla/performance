import { describe, expect, it } from 'vitest';
import type { Annotation, ChartConfig } from './config';
import { annotationsFor, orderedSeries } from './chart';
import type { SeriesData } from './data';

const annotation = (overrides: Partial<Annotation> = {}): Annotation => ({
	date: '2026-05-20',
	label: 'Bug 1',
	...overrides
});

describe('annotationsFor', () => {
	it('keeps an annotation targeting this chart by id', () => {
		const list = [annotation({ chart: 'http-desktop' })];
		expect(annotationsFor(list, 'http-desktop')).toHaveLength(1);
		expect(annotationsFor(list, 'https-desktop')).toHaveLength(0);
	});

	it('matches platform by substring of the chart id', () => {
		const list = [annotation({ platform: 'android' })];
		expect(annotationsFor(list, 'http-android')).toHaveLength(1);
		expect(annotationsFor(list, 'http-desktop')).toHaveLength(0);
	});

	// The channel is encoded in the chart id suffix rather than carried
	// separately, so a nightly annotation must not leak onto a release chart.
	it('keeps nightly annotations off release charts and vice versa', () => {
		const nightly = [annotation({ channel: 'nightly' })];
		expect(annotationsFor(nightly, 'dns-desktop-nightly')).toHaveLength(1);
		expect(annotationsFor(nightly, 'dns-desktop')).toHaveLength(0);

		const release = [annotation({ channel: 'release' })];
		expect(annotationsFor(release, 'dns-desktop')).toHaveLength(1);
		expect(annotationsFor(release, 'dns-desktop-nightly')).toHaveLength(0);
	});

	it('keeps an annotation with no targeting on every chart', () => {
		expect(annotationsFor([annotation()], 'anything')).toHaveLength(1);
	});
});

describe('orderedSeries', () => {
	const data: SeriesData = {
		labels: [1, 2],
		series: { 'HTTP/1.1': [10, 12], 'HTTP/2': [50, 48], 'HTTP/3': [40, 40] }
	};

	const config = (overrides: Partial<ChartConfig> = {}): ChartConfig => ({
		url: 'https://example.org/q.csv',
		title: 'HTTP',
		...overrides
	});

	it('follows the configured series order', () => {
		const series = orderedSeries(data, config({ seriesOrder: ['HTTP/3', 'HTTP/2', 'HTTP/1.1'] }));
		expect(series.map((s) => s.name)).toEqual(['HTTP/3', 'HTTP/2', 'HTTP/1.1']);
	});

	it('skips ordered series that are absent from the data', () => {
		const series = orderedSeries(data, config({ seriesOrder: ['HTTP/2', 'SPDY'] }));
		expect(series.map((s) => s.name)).toEqual(['HTTP/2']);
	});

	it('falls back to the data order when none is configured', () => {
		expect(orderedSeries(data, config()).map((s) => s.name)).toEqual([
			'HTTP/1.1',
			'HTTP/2',
			'HTTP/3'
		]);
	});

	it('applies display labels', () => {
		const series = orderedSeries(
			{ labels: [1], series: { '1': [10] } },
			config({ seriesLabels: { '1': 'HTTP/1.1' } })
		);
		expect(series[0].label).toBe('HTTP/1.1');
	});

	it('reports the latest value per series for the legend', () => {
		expect(orderedSeries(data, config()).map((s) => s.latest)).toEqual([12, 48, 40]);
	});

	it('marks faded series', () => {
		const series = orderedSeries(data, config({ fadedSeries: ['HTTP/1.1'] }));
		expect(series.find((s) => s.name === 'HTTP/1.1')?.faded).toBe(true);
		expect(series.find((s) => s.name === 'HTTP/2')?.faded).toBe(false);
	});
});
