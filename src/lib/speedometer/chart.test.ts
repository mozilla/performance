import { describe, expect, it } from 'vitest';
import { measurement } from '../../tests/factories';
import type { AlertMarker } from './alerts';
import {
	buildAnnotations,
	buildChartData,
	buildChartOptions,
	type ChartInputs,
	type ChartPoint
} from './chart';

const inputs = (overrides: Partial<ChartInputs> = {}): ChartInputs => ({
	measurements: [],
	test: 'score',
	hidden: new Set(),
	replicates: false,
	markers: [],
	reference: null,
	...overrides
});

const pointsOf = (data: ReturnType<typeof buildChartData>, index: number) =>
	data.datasets[index].data as ChartPoint[];

describe('buildChartData', () => {
	it('creates one dataset per browser present', () => {
		const data = buildChartData(
			inputs({
				measurements: [
					measurement({ application: 'firefox' }),
					measurement({ application: 'chrome' })
				]
			})
		);

		expect(data.datasets.map((d) => d.label)).toEqual(['Firefox', 'Chrome']);
	});

	it('creates no dataset for a browser with no data', () => {
		const data = buildChartData(
			inputs({ measurements: [measurement({ application: 'firefox' })] })
		);
		expect(data.datasets).toHaveLength(1);
	});

	// Hidden series are URL state, so the dataset carries the flag rather than
	// the chart's internal meta being poked from two places (bug E2).
	it('marks hidden series from the hidden set', () => {
		const data = buildChartData(
			inputs({
				measurements: [
					measurement({ application: 'firefox' }),
					measurement({ application: 'chrome' })
				],
				hidden: new Set(['Chrome'])
			})
		);

		expect(data.datasets.find((d) => d.label === 'Firefox')?.hidden).toBe(false);
		expect(data.datasets.find((d) => d.label === 'Chrome')?.hidden).toBe(true);
	});

	it('carries revision and job id onto each point for the tooltip and click', () => {
		const data = buildChartData(
			inputs({ measurements: [measurement({ revision: 'deadbeef', jobId: 55 })] })
		);

		expect(pointsOf(data, 0)[0]).toMatchObject({ revision: 'deadbeef', jobId: 55 });
	});

	it('does not offset points when replicates are off', () => {
		const when = new Date('2026-08-01T12:00:00Z');
		const data = buildChartData(inputs({ measurements: [measurement({ date: when })] }));

		expect(pointsOf(data, 0)[0].x).toBe(when.getTime());
	});

	describe('replicate jitter', () => {
		const when = new Date('2026-08-01T12:00:00Z');
		const sixHours = 6 * 60 * 60 * 1000;

		it('offsets points within a six-hour window', () => {
			const data = buildChartData(
				inputs({ measurements: [measurement({ date: when, jobId: 12345 })], replicates: true })
			);

			const offset = pointsOf(data, 0)[0].x - when.getTime();
			expect(offset).toBeGreaterThanOrEqual(0);
			expect(offset).toBeLessThan(sixHours);
		});

		it('gives the same point the same offset every time', () => {
			const build = () =>
				buildChartData(
					inputs({ measurements: [measurement({ date: when, jobId: 12345 })], replicates: true })
				);

			expect(pointsOf(build(), 0)[0].x).toBe(pointsOf(build(), 0)[0].x);
		});

		it('separates points that share a timestamp', () => {
			const data = buildChartData(
				inputs({
					measurements: [
						measurement({ date: when, jobId: 1 }),
						measurement({ date: when, jobId: 2 }),
						measurement({ date: when, jobId: 3 })
					],
					replicates: true
				})
			);

			const xs = pointsOf(data, 0).map((p) => p.x);
			expect(new Set(xs).size).toBe(3);
		});
	});
});

describe('buildAnnotations', () => {
	const marker = (overrides: Partial<AlertMarker> = {}): AlertMarker => ({
		summaryId: 100,
		date: new Date('2026-08-01T00:00:00Z'),
		isRegression: true,
		label: '5.0%',
		detail: ['#100: 5.0%'],
		url: 'https://treeherder.mozilla.org/perfherder/alerts?id=100',
		...overrides
	});

	it('creates one annotation per marker, keyed by summary id', () => {
		const annotations = buildAnnotations([marker({ summaryId: 1 }), marker({ summaryId: 2 })]);
		expect(Object.keys(annotations)).toEqual(['alert-1', 'alert-2']);
	});

	it('places the line at the marker timestamp', () => {
		const at = new Date('2026-08-01T00:00:00Z');
		const annotation = buildAnnotations([marker({ date: at })])['alert-100'] as {
			xMin: number;
			xMax: number;
		};

		expect(annotation.xMin).toBe(at.getTime());
		expect(annotation.xMax).toBe(at.getTime());
	});

	// Which red and which green is a styling choice; that the two directions are
	// told apart at all is not. Asserting the channel values would fail on a
	// palette tweak that broke nothing.
	it('distinguishes regressions from improvements by colour', () => {
		type Styled = {
			borderColor: string;
			label: { backgroundColor: string; borderColor: string };
		};
		const regression = buildAnnotations([marker({ isRegression: true })])['alert-100'] as Styled;
		const improvement = buildAnnotations([marker({ isRegression: false })])['alert-100'] as Styled;

		expect(regression.borderColor).not.toBe(improvement.borderColor);
		expect(regression.label.backgroundColor).not.toBe(improvement.label.backgroundColor);
		expect(regression.label.borderColor).not.toBe(improvement.label.borderColor);
	});

	it('shows a label up front only when the marker has one', () => {
		const labelled = buildAnnotations([marker({ label: '5.0%' })])['alert-100'] as {
			label: { display: boolean };
		};
		const unlabelled = buildAnnotations([marker({ label: null })])['alert-100'] as {
			label: { display: boolean };
		};

		expect(labelled.label.display).toBe(true);
		expect(unlabelled.label.display).toBe(false);
	});

	it('returns nothing for no markers', () => {
		expect(buildAnnotations([])).toEqual({});
	});
});

describe('buildChartOptions annotations', () => {
	type AnnotationOptions = { interaction?: object; annotations: Record<string, object> };
	type AfterBody = (items: { raw: ChartPoint }[]) => string[];

	const annotationOptions = (overrides: Partial<ChartInputs>) =>
		(buildChartOptions(inputs(overrides)).plugins as { annotation: AnnotationOptions }).annotation;

	const event = { date: '2026-09-03T16:54:43Z', label: 'Bug 1', description: 'Changed' };
	const alert: AlertMarker = {
		summaryId: 7,
		date: new Date('2026-08-01T00:00:00Z'),
		isRegression: true,
		label: null,
		detail: ['#7'],
		url: 'https://example.org'
	};

	it('draws event markers alongside alert markers', () => {
		const { annotations } = annotationOptions({ markers: [alert], annotations: [event] });
		expect(Object.keys(annotations)).toEqual(['alert-7', 'annotation-0']);
	});

	// The intersect interaction is what keeps a click on one label from
	// opening its neighbour's bug; Speedometer's alert markers predate it and
	// are left on the plugin default.
	it('changes the plugin interaction only when there are event markers', () => {
		expect(annotationOptions({ markers: [alert] }).interaction).toBeUndefined();
		expect(annotationOptions({ annotations: [event] }).interaction).toBeDefined();
	});

	it('names a nearby event in the point tooltip', () => {
		const options = buildChartOptions(inputs({ annotations: [event] }));
		const afterBody = (options.plugins!.tooltip!.callbacks as { afterBody: AfterBody }).afterBody;
		const point = (time: string) => ({ raw: { x: Date.parse(time) } as ChartPoint });

		expect(afterBody([point('2026-09-03T20:00:00Z')])).toEqual(['Bug 1: Changed']);
		expect(afterBody([point('2026-09-10T00:00:00Z')])).toEqual([]);
	});
});
