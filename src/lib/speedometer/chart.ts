import type { ChartData, ChartOptions } from 'chart.js';
import {
	annotationTooltipLines,
	buildAnnotationLines,
	type ChartAnnotation
} from '$lib/annotations';
import type { Measurement } from '$lib/api/treeherder';
import { groupByBrowser } from '$lib/browsers';
import type { AlertMarker } from './alerts';
import { lowerIsBetter } from './config';
import type { RowNaming } from './table';

/** A point as Chart.js sees it, with the fields the tooltip and click need. */
export interface ChartPoint {
	x: number;
	y: number;
	revision: string;
	jobId: number;
	signatureId: number;
	machineName?: string;
}

/** The user's pushlog anchor, identified by push rather than array index. */
export interface ReferencePoint {
	revision: string;
	value: number;
}

export interface ChartInputs {
	measurements: readonly Measurement[];
	test: string;
	/** Series labels the user has hidden, from the URL. */
	hidden: ReadonlySet<string>;
	replicates: boolean;
	markers: readonly AlertMarker[];
	/** Dashed event markers, e.g. NavBench's benchmark changes. */
	annotations?: readonly ChartAnnotation[];
	reference: ReferencePoint | null;
	/**
	 * Y-axis label. Defaults to what `test` implies, which is either ms or a
	 * score; Android also charts mWh, so it supplies its own.
	 */
	yLabel?: string;
	/** Anchor the y axis at zero rather than fitting it to the data. */
	beginAtZero?: boolean;
}

function stableJitter(seed: number): number {
	let x = seed | 0;
	x ^= x << 13;
	x ^= x >>> 17;
	x ^= x << 5;
	return ((x >>> 0) % 100_000) / 100_000;
}

const JITTER_WINDOW_MS = 6 * 60 * 60 * 1000;

function toPoint(measurement: Measurement, replicates: boolean): ChartPoint {
	const offset = replicates ? stableJitter(measurement.jobId) * JITTER_WINDOW_MS : 0;
	return {
		x: measurement.date.getTime() + offset,
		y: measurement.value,
		revision: measurement.revision,
		jobId: measurement.jobId,
		signatureId: measurement.signatureId,
		machineName: measurement.machineName
	};
}

function round(value: number, decimals: number): number {
	const factor = 10 ** decimals;
	return Math.round(value * factor) / factor;
}

export function buildChartData(inputs: ChartInputs): ChartData<'scatter', ChartPoint[]> {
	const { measurements, hidden, replicates, reference } = inputs;

	// Smaller, more transparent, unbordered points when replicates are shown,
	// so density stays readable through the overlap.
	const radius = replicates ? 1.5 : 3;
	const borderWidth = replicates ? 0 : 0.5;
	const alpha = replicates ? 'aa' : 'ff';

	const datasets = groupByBrowser(measurements).map(({ browser, measurements: points }) => {
		const data = points.map((m) => toPoint(m, replicates));

		const isReference = (point: ChartPoint) =>
			reference !== null && point.revision === reference.revision && point.y === reference.value;

		return {
			label: browser.label,
			data,
			hidden: hidden.has(browser.label),
			pointBackgroundColor: browser.color + alpha,
			pointRadius: (ctx: { raw?: unknown }) => (isReference(ctx.raw as ChartPoint) ? 8 : radius),
			pointBorderColor: (ctx: { raw?: unknown }) =>
				isReference(ctx.raw as ChartPoint) ? '#FFFFFF' : '#000000',
			pointBorderWidth: (ctx: { raw?: unknown }) =>
				isReference(ctx.raw as ChartPoint) ? 3 : borderWidth
		};
	});

	return { datasets };
}

/** Chart.js annotation objects for the alert markers. */
export function buildAnnotations(markers: readonly AlertMarker[]): Record<string, object> {
	const annotations: Record<string, object> = {};

	markers.forEach((marker, index) => {
		const stroke = marker.isRegression ? 'rgba(255, 0, 0, 0.6)' : 'rgba(0, 200, 0, 0.6)';
		const fill = marker.isRegression ? 'rgba(255, 200, 200, 0.98)' : 'rgba(200, 255, 200, 0.98)';
		const border = marker.isRegression ? 'rgba(255, 0, 0, 0.8)' : 'rgba(0, 200, 0, 0.8)';

		annotations[`alert-${marker.summaryId}`] = {
			type: 'line',
			xMin: marker.date.getTime(),
			xMax: marker.date.getTime(),
			borderColor: stroke,
			borderWidth: 2,
			drawTime: 'beforeDatasetsDraw',
			label: {
				// Unlabelled markers (the aggregate view) reveal their detail on
				// hover; labelled ones show the headline percentage always.
				display: marker.label !== null,
				content: marker.label ?? marker.detail,
				position: 'end',
				// Stagger consecutive labels so neighbouring alerts do not overlap.
				yAdjust: 10 + (index % 3) * 30,
				drawTime: 'afterDatasetsDraw',
				backgroundColor: fill,
				borderColor: border,
				borderWidth: 1,
				borderRadius: 4,
				color: 'black',
				font: { size: 11, weight: 'bold' },
				padding: 6
			},
			enter(ctx: { element: { label: { options: { display: boolean; content: unknown } } } }) {
				ctx.element.label.options.content = marker.detail;
				ctx.element.label.options.display = true;
				return true;
			},
			leave(ctx: { element: { label: { options: { display: boolean; content: unknown } } } }) {
				ctx.element.label.options.content = marker.label ?? marker.detail;
				ctx.element.label.options.display = marker.label !== null;
				return true;
			},
			click() {
				window.open(marker.url, '_blank', 'noopener');
			}
		};
	});

	return annotations;
}

/**
 * The y-axis title for a test: Speedometer 3's two labels, and the unit
 * spelled out for anything that is neither a time nor a score, such as
 * Speedometer Experimental's power figures in uWh.
 */
export function axisLabel(naming: RowNaming, test: string): string {
	if (!naming.lowerIsBetter(test)) return 'Score (Higher is better)';
	const unit = naming.unit(test).trim();
	if (unit === 'ms') return 'Time (ms)';
	return unit ? `Value (${unit})` : 'Value';
}

export interface ChartHandlers {
	onPointClick?(point: ChartPoint): void;
	onLegendClick?(label: string): void;
	/** Extra tooltip line, e.g. Android's "Click to play the replicate videos". */
	tooltipFooter?(): string | undefined;
}

export function buildChartOptions(
	inputs: ChartInputs,
	handlers: ChartHandlers = {}
): ChartOptions<'scatter'> {
	const { test, reference, markers } = inputs;
	const annotations = inputs.annotations ?? [];
	const yLabel = inputs.yLabel ?? (lowerIsBetter(test) ? 'Time (ms)' : 'Score (Higher is better)');

	return {
		responsive: true,
		// Height comes from the container (--chart-height) rather than from an
		// aspect ratio. With a fluid-width column, a fixed 1.5 ratio makes the
		// chart taller as the window widens -- at 1400px it would be 933px
		// tall, which is worse than the 900px cap it replaced.
		maintainAspectRatio: false,
		onClick: (_event, elements, chart) => {
			const hit = elements[0];
			if (!hit) return;
			const point = chart.data.datasets[hit.datasetIndex].data[hit.index] as unknown as ChartPoint;
			handlers.onPointClick?.(point);
		},
		onHover: (event, elements) => {
			const target = event.native?.target as HTMLElement | undefined;
			if (target) target.style.cursor = elements.length > 0 ? 'pointer' : 'default';
		},
		plugins: {
			legend: {
				display: true,
				position: 'top',
				// Visibility is URL state where a page tracks it, so the legend
				// patches the URL rather than toggling Chart.js's internal meta
				// directly. Where a page does not -- NavBench has no hidden-series
				// parameter -- leave Chart.js's own handler in place rather than
				// overriding it with a no-op, which would make the legend look
				// clickable and do nothing.
				...(handlers.onLegendClick
					? {
							onClick: (_event: unknown, item: { text: string }) =>
								handlers.onLegendClick!(item.text)
						}
					: {})
			},
			tooltip: {
				callbacks: {
					title: (items) => {
						// Read the x from the point rather than from `parsed`, whose
						// members Chart.js types as possibly null.
						const point = items[0]?.raw as ChartPoint | undefined;
						if (!point) return '';
						return new Date(point.x).toLocaleDateString('en-US', {
							month: 'short',
							day: 'numeric',
							year: 'numeric'
						});
					},
					label: (item) => {
						const point = item.raw as ChartPoint;
						const revision = point.revision ? ` (${point.revision.slice(0, 6)})` : '';
						let label = `${item.dataset.label}: ${round(point.y, 2)}${revision}`;

						if (reference && reference.value > 0) {
							const delta = (point.y / reference.value - 1) * 100;
							label += ` ${delta > 0 ? '+' : ''}${round(delta, 1)}%`;
						}

						return label;
					},
					afterBody: (items) => {
						const point = items[0]?.raw as ChartPoint | undefined;
						return point ? annotationTooltipLines(annotations, point.x) : [];
					},
					footer: () => handlers.tooltipFooter?.() ?? ''
				}
			},
			annotation: {
				// Only with event markers, whose link opens from a click on the
				// label: intersect makes the click go to the label under the
				// pointer. Alert markers keep the plugin's default.
				...(annotations.length > 0 ? { interaction: { mode: 'point', intersect: true } } : {}),
				annotations: { ...buildAnnotations(markers), ...buildAnnotationLines(annotations) }
			}
		},
		scales: {
			x: {
				type: 'time',
				time: { unit: 'day', tooltipFormat: 'MMM dd, yyyy' },
				title: { display: true, text: 'Date' }
			},
			y: {
				beginAtZero: inputs.beginAtZero ?? false,
				title: { display: true, text: yLabel }
			}
		}
	} as ChartOptions<'scatter'>;
}
