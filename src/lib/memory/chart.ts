/**
 * Chart configuration for the memory probes.
 *
 * Two display modes:
 *   default    -- the pooled 'all' series: P75 and P95, one colour each,
 *                 annotated with a vertical rule on the day each major version
 *                 reached MIN_SHARE_PCT of the population, i.e. when it began
 *                 moving these numbers.
 *   by version -- release only. One colour per major version, solid P75 and
 *                 dashed P95 per version.
 */
import { Chart as ChartJs, type ChartData, type ChartOptions, type Plugin } from 'chart.js';
import {
	ALL,
	INK_SECONDARY,
	MIN_SHARE_PCT,
	PERCENTILES,
	type Probe,
	SURFACE,
	versionColor
} from './config';
import { type Crossing, type MemoryRow, type Point, pointsFor, versionsIn } from './data';

/** A dataset carrying the extra fields the legend and end-labels plugin read. */
export interface MemoryDataset {
	label: string;
	data: Point[];
	versionKey?: string;
	isP95?: boolean;
	borderColor: string;
	backgroundColor: string;
	borderWidth: number;
	borderDash: number[];
	pointRadius: number;
	pointHitRadius: number;
	tension: number;
	fill: boolean;
	spanGaps: boolean;
}

function lineStyle(color: string, dashed: boolean) {
	return {
		borderColor: color,
		backgroundColor: `${color}18`,
		borderWidth: 2,
		borderDash: dashed ? [5, 4] : [],
		pointRadius: 0,
		pointHitRadius: 8,
		tension: 0.1,
		fill: false,
		spanGaps: true
	};
}

export function datasetsForProbe(
	probe: Probe,
	processData: Record<string, MemoryRow[]> | undefined,
	versionMode: boolean
): MemoryDataset[] {
	if (!versionMode) {
		return PERCENTILES.map((percentile) => ({
			label: percentile.label,
			data: pointsFor(processData?.[ALL], probe[percentile.field]),
			...lineStyle(percentile.color, false)
		}));
	}

	// Solid P75 + dashed P95 in one colour per version; the dash is the
	// secondary encoding that separates the pair without spending a hue on it.
	return versionsIn(processData).flatMap((version) =>
		PERCENTILES.map((percentile) => ({
			label: `${version} ${percentile.label}`,
			versionKey: version,
			isP95: percentile.field === 'p95',
			data: pointsFor(processData?.[version], probe[percentile.field]),
			...lineStyle(versionColor(version), percentile.field === 'p95')
		}))
	);
}

/**
 * Release markers: a vertical rule on the day a major version first reached the
 * charting threshold, i.e. when it started materially moving the pooled
 * numbers. That is deliberately earlier than the day it becomes the most-used
 * build -- by then it has been shifting the pooled line for weeks, which is
 * exactly the confusion these markers exist to prevent.
 *
 * Only on the pooled view: in per-version mode each line already starts on its
 * own crossing date. Styled to recede (hairline, muted chrome ink) so it reads
 * as annotation rather than data.
 */
const MARKER = {
	color: '#898781',
	lineWidth: 1,
	lineDash: [4, 4],
	labelFontSize: 9,
	labelPadding: 3,
	/** Markers closer together than this get staggered labels. */
	clusterDays: 14,
	staggerStepPx: 18,
	staggerLevels: 2
};

const DAY_MS = 86_400_000;

export function buildMarkerAnnotations(crossings: readonly Crossing[]): Record<string, object> {
	const annotations: Record<string, object> = {};
	let level = 0;
	let previous: number | null = null;

	for (const crossing of crossings) {
		const time = crossing.date.getTime();
		level =
			previous !== null && time - previous < MARKER.clusterDays * DAY_MS
				? (level + 1) % MARKER.staggerLevels
				: 0;
		previous = time;

		const on = crossing.date.toISOString().slice(0, 10);

		annotations[`release-${crossing.version}`] = {
			type: 'line',
			xMin: time,
			xMax: time,
			borderColor: MARKER.color,
			borderWidth: MARKER.lineWidth,
			borderDash: MARKER.lineDash,
			label: {
				display: true,
				content: crossing.version,
				position: 'start',
				yAdjust: level === 0 ? 0 : -(level * MARKER.staggerStepPx),
				backgroundColor: MARKER.color,
				color: '#fff',
				font: { size: MARKER.labelFontSize },
				padding: MARKER.labelPadding
			},
			enter: (ctx: { chart: { canvas: HTMLCanvasElement } }) => {
				ctx.chart.canvas.title = `Firefox ${crossing.version} reached ${MIN_SHARE_PCT}% of release volume on ${on}`;
			},
			leave: (ctx: { chart: { canvas: HTMLCanvasElement } }) => {
				ctx.chart.canvas.title = '';
			}
		};
	}

	return annotations;
}

/**
 * Direct-labels the version(s) still shipping at the right-hand edge.
 *
 * This is the relief channel the palette requires (three of its eight slots
 * fall below 3:1 against white), so the versions a reader is most likely to be
 * comparing are identified without relying on colour.
 *
 * Deliberately NOT every version: one that has aged out ends mid-plot, and
 * labelling those endpoints scatters numbers across the plot looking like stray
 * marks rather than annotation. Older versions are identified by the legend and
 * tooltip instead.
 */
export const versionEndLabels: Plugin<'line'> = {
	id: 'versionEndLabels',
	afterDatasetsDraw(chart) {
		const options = (chart.options.plugins as Record<string, { enabled?: boolean } | undefined>)
			?.versionEndLabels;
		if (!options?.enabled) return;

		const { ctx, chartArea } = chart;

		// Last real point of each visible version's P75 (solid) line.
		const ends: Array<{ text: string; color: string; at: number; x: number; y: number }> = [];

		chart.data.datasets.forEach((dataset, index) => {
			const meta = dataset as unknown as MemoryDataset;
			if (meta.isP95 || !chart.isDatasetVisible(index) || !meta.versionKey) return;

			const points = chart.getDatasetMeta(index).data;
			for (let k = points.length - 1; k >= 0; k--) {
				const point = meta.data[k];
				if (point && point.y != null) {
					ends.push({
						text: meta.versionKey,
						color: meta.borderColor,
						at: point.x,
						x: points[k].x,
						y: points[k].y
					});
					break;
				}
			}
		});

		if (ends.length === 0) return;

		// Keep only lines reaching the end of the window. The few days' slack
		// covers a version whose final partial day lands short of the others.
		const latest = Math.max(...ends.map((end) => end.at));
		const LIVE_SLACK_MS = 3 * DAY_MS;
		const labels = ends.filter((end) => end.at >= latest - LIVE_SLACK_MS);

		// Nudge overlapping labels downward so co-located line ends stay legible.
		labels.sort((a, b) => a.y - b.y);
		const MIN_GAP = 13;
		for (let i = 1; i < labels.length; i++) {
			if (labels[i].y - labels[i - 1].y < MIN_GAP) labels[i].y = labels[i - 1].y + MIN_GAP;
		}

		ctx.save();
		ctx.font = '600 11px system-ui, -apple-system, "Segoe UI", sans-serif';
		ctx.textBaseline = 'middle';

		for (const label of labels) {
			const x = Math.min(label.x + 6, chartArea.right - 4);
			const y = Math.max(chartArea.top + 6, Math.min(label.y, chartArea.bottom - 6));

			// A surface-coloured halo keeps the text readable where it crosses a line.
			ctx.lineWidth = 3;
			ctx.strokeStyle = SURFACE;
			ctx.strokeText(label.text, x + 10, y);
			ctx.fillStyle = INK_SECONDARY;
			ctx.fillText(label.text, x + 10, y);

			// Short dash in the series colour: the swatch carries identity, not the text.
			ctx.lineWidth = 2;
			ctx.strokeStyle = label.color;
			ctx.beginPath();
			ctx.moveTo(x, y);
			ctx.lineTo(x + 8, y);
			ctx.stroke();
		}

		ctx.restore();
	}
};

export function buildProbeOptions(
	probe: Probe,
	versionMode: boolean,
	crossings: readonly Crossing[]
): ChartOptions<'line'> {
	return {
		responsive: true,
		maintainAspectRatio: false,
		interaction: { mode: 'nearest', axis: 'x', intersect: false },
		plugins: {
			legend: {
				display: true,
				position: 'bottom',
				// One legend entry per version rather than per line. The entry
				// stands for both of that version's lines, so it is labelled with
				// just the version number -- calling it "153 P75" would be wrong,
				// since clicking it also toggles the dashed P95 line. Solid vs
				// dashed is explained in the caption instead.
				labels: versionMode
					? {
							boxWidth: 20,
							generateLabels: (chart) =>
								ChartJs.defaults.plugins.legend.labels
									.generateLabels(chart)
									.filter((item) => {
										const index = item.datasetIndex;
										return index === undefined
											? true
											: !(chart.data.datasets[index] as unknown as MemoryDataset).isP95;
									})
									.map((item) => {
										const index = item.datasetIndex;
										const key =
											index === undefined
												? undefined
												: (chart.data.datasets[index] as unknown as MemoryDataset).versionKey;
										return key ? { ...item, text: key } : item;
									})
						}
					: { boxWidth: 20 },
				...(versionMode
					? {
							onClick: (_event, item, legend) => {
								const chart = legend.chart;
								const index = item.datasetIndex;
								if (index === undefined) return;
								const key = (chart.data.datasets[index] as unknown as MemoryDataset).versionKey;
								const show = !chart.isDatasetVisible(index);
								chart.data.datasets.forEach((dataset, i) => {
									if ((dataset as unknown as MemoryDataset).versionKey === key) {
										chart.setDatasetVisibility(i, show);
									}
								});
								chart.update();
							}
						}
					: {})
			},
			tooltip: {
				callbacks: {
					label: (item) => {
						const value = item.parsed.y;
						return value === null
							? `${item.dataset.label}: no data`
							: `${item.dataset.label}: ${Math.round(value * 100) / 100} ${probe.unit}`;
					}
				}
			},
			// Markers only make sense on the pooled view.
			annotation: { annotations: versionMode ? {} : buildMarkerAnnotations(crossings) },
			versionEndLabels: { enabled: versionMode }
		} as ChartOptions<'line'>['plugins'],
		scales: {
			x: {
				type: 'time',
				time: { unit: 'week', tooltipFormat: 'MMM dd, yyyy' },
				title: { display: false }
			},
			y: {
				beginAtZero: false,
				title: { display: true, text: probe.axis }
			}
		}
	} as ChartOptions<'line'>;
}

export function buildProbeData(datasets: MemoryDataset[]): ChartData<'line'> {
	return { datasets } as unknown as ChartData<'line'>;
}
