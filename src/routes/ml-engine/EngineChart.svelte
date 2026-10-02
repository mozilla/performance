<script lang="ts">
	import type { ChartData, ChartOptions } from 'chart.js';
	import Chart from '$lib/components/Chart.svelte';
	import type { EnginePoint } from '$lib/ml/engine';

	interface Props {
		points: EnginePoint[];
		label: string;
	}

	let { points, label }: Props = $props();

	/** Whether either series has a value; see the empty case in the markup. */
	const plottable = $derived(
		points.some((point) => point.engineCreationP50 !== null || point.inferenceP50 !== null)
	);

	const data = $derived<ChartData<'line'>>({
		datasets: [
			{
				label: 'Engine creation p50',
				data: points.map((point) => ({ x: point.date.getTime(), y: point.engineCreationP50 })),
				borderColor: '#4a3aa7',
				backgroundColor: '#4a3aa718',
				borderWidth: 2,
				pointRadius: 2.5,
				pointHitRadius: 8,
				tension: 0.1,
				fill: true
			},
			{
				label: 'Inference p50',
				data: points.map((point) => ({ x: point.date.getTime(), y: point.inferenceP50 })),
				borderColor: '#c9407a',
				backgroundColor: '#c9407a18',
				borderWidth: 2,
				pointRadius: 2.5,
				pointHitRadius: 8,
				tension: 0.1,
				fill: true
			}
		]
		// Deliberately no `spanGaps`: a null percentile means the engine had no
		// successful run that day, and bridging it would draw a line through a
		// day on which nothing happened.
	} as unknown as ChartData<'line'>);

	const options = $derived<ChartOptions<'line'>>({
		responsive: true,
		maintainAspectRatio: false,
		interaction: { mode: 'index', axis: 'x', intersect: false },
		plugins: {
			// Shown, unlike the other ML charts: there are two series here and
			// nothing else says which is which.
			legend: { display: true, position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
			tooltip: {
				callbacks: {
					label: (item) =>
						`${item.dataset.label}: ${Math.round((item.parsed.y ?? 0) * 100) / 100} ms`
				}
			}
		},
		scales: {
			x: { type: 'time', time: { unit: 'day', tooltipFormat: 'MMM d, yyyy' } },

			y: { type: 'logarithmic', title: { display: true, text: 'ms (log scale)' } }
		}
	});
</script>

<div class="canvas">
	{#if points.length === 0}
		<p class="empty">No telemetry for this engine.</p>
	{:else if !plottable}
		<!--
			Not the same as having no points. An engine can appear in the dataset
			on the strength of its failures alone -- the query FULL JOINs the two
			sides, so a row with no successful run has counts and null
			percentiles -- and there is then nothing to plot. Rendering the chart
			anyway gives Chart.js an all-null dataset, which draws axes over an
			empty grid and reads as a chart that failed to load rather than as an
			engine that never succeeded. `about-inference-benchmark` is like this
			in the live data.
		-->
		<p class="empty">
			No successful runs in this window, so there is no latency to plot. The counts alongside are
			the whole story.
		</p>
	{:else}
		<Chart type="line" {data} {options} ariaLabel={`${label} latency percentiles`} />
	{/if}
</div>

<style>
	.canvas {
		height: 280px;
		position: relative;
	}

	.empty {
		font-size: 13px;
		color: var(--ink-disabled);
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		text-align: center;
	}
</style>
