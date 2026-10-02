import { describe, expect, it } from 'vitest';
import {
	annotationsWithinDays,
	annotationTooltipLines,
	buildAnnotationLines,
	type ChartAnnotation
} from './annotations';

const annotation = (overrides: Partial<ChartAnnotation> = {}): ChartAnnotation => ({
	date: '2026-05-20',
	label: 'Bug 1',
	...overrides
});

describe('buildAnnotationLines', () => {
	it('creates one line per annotation, placed at its date', () => {
		const lines = buildAnnotationLines([annotation({ date: '2026-05-20' })]);
		const line = Object.values(lines)[0] as { xMin: number; xMax: number };

		expect(Object.keys(lines)).toHaveLength(1);
		expect(line.xMin).toBe(Date.parse('2026-05-20'));
		expect(line.xMax).toBe(line.xMin);
	});

	// Labels sitting on top of each other are unreadable, so nearby ones are
	// pushed to different heights.
	it('staggers labels of annotations closer than the cluster window', () => {
		const lines = buildAnnotationLines([
			annotation({ date: '2026-05-01', label: 'a' }),
			annotation({ date: '2026-05-10', label: 'b' }),
			annotation({ date: '2026-05-20', label: 'c' })
		]);

		const adjusts = Object.values(lines).map(
			(line) => (line as { label: { yAdjust: number } }).label.yAdjust
		);
		expect(new Set(adjusts).size).toBe(3);
	});

	it('resets the stagger for annotations far apart', () => {
		const lines = buildAnnotationLines([
			annotation({ date: '2026-01-01', label: 'a' }),
			annotation({ date: '2026-12-01', label: 'b' })
		]);

		const adjusts = Object.values(lines).map(
			(line) => (line as { label: { yAdjust: number } }).label.yAdjust
		);
		expect(adjusts).toEqual([0, 0]);
	});

	it('sorts by date regardless of input order', () => {
		const lines = buildAnnotationLines([
			annotation({ date: '2026-12-01', label: 'later' }),
			annotation({ date: '2026-01-01', label: 'earlier' })
		]);

		const contents = Object.values(lines).map(
			(line) => (line as { label: { content: string } }).label.content
		);
		expect(contents).toEqual(['earlier', 'later']);
	});

	it('drops annotations with an unparseable date', () => {
		expect(buildAnnotationLines([annotation({ date: 'whenever' })])).toEqual({});
	});

	// Labels anchored to the bottom stagger upwards and labels anchored to the
	// top stagger downwards, so a staggered label never leaves the chart area.
	it('staggers away from the edge the label is anchored to', () => {
		const pair = [
			annotation({ date: '2026-05-01', label: 'a' }),
			annotation({ date: '2026-05-02', label: 'b' })
		];
		const second = (lines: Record<string, object>) =>
			(Object.values(lines)[1] as { label: { yAdjust: number } }).label.yAdjust;

		expect(second(buildAnnotationLines(pair, { labelPosition: 'end' }))).toBeGreaterThan(0);
		expect(second(buildAnnotationLines(pair, { labelPosition: 'start' }))).toBeLessThan(0);
	});

	it('uses the cluster window it is given', () => {
		const pair = [
			annotation({ date: '2026-05-01', label: 'a' }),
			annotation({ date: '2026-06-01', label: 'b' })
		];
		const adjusts = (lines: Record<string, object>) =>
			Object.values(lines).map((line) => (line as { label: { yAdjust: number } }).label.yAdjust);

		expect(adjusts(buildAnnotationLines(pair))).toEqual([0, 0]);
		expect(adjusts(buildAnnotationLines(pair, { clusterWindowDays: 60 }))[1]).not.toBe(0);
	});
});

describe('annotationTooltipLines', () => {
	const list = [
		annotation({ date: '2026-05-20T12:00:00Z', label: 'Bug 1', description: 'Landed' })
	];

	it('lists annotations within a day of the hovered point', () => {
		expect(annotationTooltipLines(list, Date.parse('2026-05-20T20:00:00Z'))).toEqual([
			'Bug 1: Landed'
		]);
	});

	it('leaves out annotations further away', () => {
		expect(annotationTooltipLines(list, Date.parse('2026-05-22T12:00:00Z'))).toEqual([]);
	});
});

describe('annotationsWithinDays', () => {
	const now = Date.parse('2026-10-01T00:00:00Z');
	const list = [
		annotation({ date: '2026-09-03T00:00:00Z', label: 'old' }),
		annotation({ date: '2026-09-28T00:00:00Z', label: 'recent' })
	];

	it('keeps only annotations inside the window', () => {
		expect(annotationsWithinDays(list, 7, now).map((a) => a.label)).toEqual(['recent']);
		expect(annotationsWithinDays(list, 30, now).map((a) => a.label)).toEqual(['old', 'recent']);
	});
});
