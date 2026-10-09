/**
 * Chart configuration for the networking charts.
 */
import type { ChartData, ChartOptions } from 'chart.js';
import {
	annotationTooltipLines,
	type AnnotationStyle,
	buildAnnotationLines
} from '$lib/annotations';
import type { Annotation, ChartConfig } from './config';
import { latestValue, type PieData, type SeriesData } from './data';

const COLORS = [
	'#3366ff',
	'#ff6384',
	'#36a2eb',
	'#ffce56',
	'#4bc0c0',
	'#9966ff',
	'#ff9f40',
	'#c9cbcf'
];

/** Where networking.html's annotation styling differed from the shared default. */
const ANNOTATION_STYLE: Partial<AnnotationStyle> = {
	labelFontSize: 8,
	labelPosition: 'start',
	clusterWindowDays: 60
};

export function annotationsFor(annotations: readonly Annotation[], chartId: string): Annotation[] {
	return annotations.filter((annotation) => {
		if (annotation.chart && annotation.chart !== chartId) return false;
		if (annotation.platform && !chartId.includes(annotation.platform)) return false;
		if (annotation.channel === 'nightly' && !chartId.endsWith('-nightly')) return false;
		if (annotation.channel === 'release' && chartId.endsWith('-nightly')) return false;
		return true;
	});
}

/** Series to draw, in order, with their display labels and latest values. */
export function orderedSeries(data: SeriesData, config: ChartConfig) {
	const order = config.seriesOrder ?? Object.keys(data.series);
	return order
		.filter((name) => data.series[name])
		.map((name, index) => ({
			name,
			label: config.seriesLabels?.[name] ?? name,
			values: data.series[name],
			latest: latestValue(data.series[name]),
			color: COLORS[index % COLORS.length],
			faded: config.fadedSeries?.includes(name) ?? false
		}));
}

export function buildSeriesChartData(data: SeriesData, config: ChartConfig): ChartData<'line'> {
	const series = orderedSeries(data, config);

	return {
		labels: data.labels,
		datasets: series.map((entry) => ({
			label: entry.label,
			data: entry.values,
			backgroundColor: `${entry.color}CC`,
			borderColor: entry.color,
			borderWidth: entry.faded ? 1 : 2,
			borderDash: entry.faded ? [4, 3] : [],
			pointRadius: 0,
			pointHitRadius: 6,
			tension: 0.1,
			// Stacked-area charts fill; line charts (times, not shares) do not.
			fill: config.chartType === 'stackedArea',
			spanGaps: true
		}))
	} as unknown as ChartData<'line'>;
}

export function buildSeriesChartOptions(
	data: SeriesData,
	config: ChartConfig,
	annotations: readonly Annotation[]
): ChartOptions<'line'> {
	const series = orderedSeries(data, config);
	const stacked = config.chartType === 'stackedArea';
	const unit = config.unit ?? (stacked ? '%' : '');
	const lines = buildAnnotationLines(annotations, ANNOTATION_STYLE);

	// Whole milliseconds; keep a decimal for percentages so small shares survive.
	const precision = unit === 'ms' ? 1 : 10;
	const format = (value: number | null) =>
		value === null ? 'N/A' : `${Math.round(value * precision) / precision}${unit}`;

	return {
		responsive: true,
		maintainAspectRatio: false,
		interaction: { intersect: false, mode: 'index' },
		scales: {
			x: {
				type: 'time',
				time: {
					unit: 'day',
					displayFormats: { day: 'MMM d, yyyy' },
					tooltipFormat: 'MMM d, yyyy'
				}
			},
			y: {
				stacked,
				min: stacked ? 0 : config.yMin,
				max: stacked ? 100 : undefined,
				ticks: stacked ? { callback: (value: unknown) => `${value}%` } : undefined
			}
		},
		plugins: {
			legend: {
				position: 'top',
				labels: {
					// The legend doubles as a readout of the latest value per series.
					generateLabels: (chart) =>
						chart.data.datasets.map((dataset, index) => ({
							text: `${dataset.label}: ${format(series[index]?.latest ?? null)}`,
							fillStyle: dataset.backgroundColor as string,
							strokeStyle: dataset.borderColor as string,
							lineWidth: 1,
							hidden: !chart.isDatasetVisible(index),
							datasetIndex: index
						}))
				}
			},
			tooltip: {
				callbacks: {
					label: (item) => `${item.dataset.label}: ${format(item.parsed.y)}`,
					afterBody: (items) => {
						const time = items[0]?.parsed.x;
						if (time === undefined || time === null) return '';
						return annotationTooltipLines(annotations, time, ANNOTATION_STYLE).map(
							(line) => `\n${line}`
						);
					}
				}
			},
			annotation: {
				// intersect: a click dispatches only to the annotation whose
				// line/label is actually under the pointer (the default matches by
				// row/column and misdelivers clicks among stacked labels).
				interaction: { intersect: true },
				annotations: lines
			}
		}
	} as ChartOptions<'line'>;
}

export function buildPieChartData(data: PieData): ChartData<'pie'> {
	return {
		labels: data.labels,
		datasets: [
			{
				data: data.values,
				backgroundColor: data.labels.map((_, i) => COLORS[i % COLORS.length])
			}
		]
	};
}

export function buildPieChartOptions(): ChartOptions<'pie'> {
	return {
		responsive: true,
		maintainAspectRatio: false,
		plugins: {
			legend: { position: 'right', labels: { boxWidth: 16, font: { size: 12 } } },
			tooltip: {
				callbacks: {
					label: (item) => `${item.label}: ${Math.round(Number(item.parsed) * 10) / 10}%`
				}
			}
		}
	};
}
