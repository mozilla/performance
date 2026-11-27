<script lang="ts">
	import type { ChartData, ChartOptions } from 'chart.js';
	import Chart from '#lib/components/Chart.svelte';
	import { browserByKey } from '#lib/browsers.js';
	import { openTreeherderJob } from '#lib/open-job.js';
	import { formatChange, type PairedPush } from '#lib/navbench/a11y.js';
	import { NAVBENCH_REPOSITORY } from '#lib/navbench/config.js';

	interface Props {
		pairs: PairedPush[];
		ariaLabel: string;
		/** A y range shared with other charts, as fractions. Fits the data if absent. */
		extent?: { min: number; max: number };
		/** Smaller points and axis titles, for the per-site grid. */
		compact?: boolean;
	}

	let { pairs, ariaLabel, extent, compact = false }: Props = $props();

	const COLOR = browserByKey('firefox-a11y')!.color;

	interface Point {
		x: number;
		y: number;
		pair: PairedPush;
	}

	const data = $derived({
		datasets: [
			{
				label: 'Change in display time with accessibility on',
				data: pairs.map((pair): Point => ({ x: pair.date.getTime(), y: pair.change * 100, pair })),
				showLine: true,
				borderColor: COLOR,
				backgroundColor: COLOR,
				borderWidth: compact ? 1.5 : 2,
				pointRadius: compact ? 2.5 : 4,
				pointHoverRadius: compact ? 4 : 6
			}
		]
	} as unknown as ChartData);

	const date = (x: number) =>
		new Date(x).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

	const options = $derived({
		responsive: true,
		maintainAspectRatio: false,
		onClick: (
			_event: unknown,
			elements: Array<{ datasetIndex: number; index: number }>,
			chart: { data: ChartData }
		) => {
			const hit = elements[0];
			if (!hit) return;
			const point = chart.data.datasets[hit.datasetIndex].data[hit.index] as unknown as Point;
			void openTreeherderJob({
				repository: NAVBENCH_REPOSITORY,
				revision: point.pair.revision,
				jobId: point.pair.jobId
			});
		},
		onHover: (event: { native?: Event | null }, elements: unknown[]) => {
			const target = event.native?.target as HTMLElement | undefined;
			if (target) target.style.cursor = elements.length > 0 ? 'pointer' : 'default';
		},
		plugins: {
			legend: { display: false },
			tooltip: {
				callbacks: {
					title: (items: Array<{ raw: unknown }>) => {
						const point = items[0]?.raw as Point | undefined;
						return point ? `${date(point.x)} (${point.pair.revision.slice(0, 12)})` : '';
					},
					label: (item: { raw: unknown }) => {
						const { pair } = item.raw as Point;
						return [
							`Score, accessibility off: ${pair.off.toFixed(2)}`,
							`Score, accessibility on: ${pair.on.toFixed(2)}`,
							`Change in display time: ${formatChange(pair.change)}`
						];
					},
					footer: () => 'Click to open the accessibility-enabled job in Treeherder'
				}
			},
			annotation: {
				annotations: {
					zero: {
						type: 'line',
						yMin: 0,
						yMax: 0,
						borderColor: '#888888',
						borderWidth: 1,
						borderDash: [4, 4]
					}
				}
			}
		},
		scales: {
			x: {
				type: 'time',
				time: { unit: 'day' },
				title: { display: !compact, text: 'Push date' },
				ticks: { maxTicksLimit: compact ? 4 : 12 }
			},
			y: {
				// Suggested rather than fixed, so Chart.js rounds out to clean ticks.
				// Every chart's data lies inside the shared range, so they all round
				// to the same axis and still share a scale.
				...(extent ? { suggestedMin: extent.min * 100, suggestedMax: extent.max * 100 } : {}),
				title: { display: !compact, text: 'Change in display time (%)' },
				ticks: {
					maxTicksLimit: compact ? 5 : 11,
					callback: (value: number | string) => `${value}%`
				}
			}
		}
	} as unknown as ChartOptions<'scatter'>);
</script>

<Chart type="scatter" {data} {options} {ariaLabel} />
