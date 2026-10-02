<script lang="ts">
	import type { ChartData, ChartOptions } from 'chart.js';
	import Chart from '$lib/components/Chart.svelte';
	import type { MlPoint } from '$lib/ml/data';

	interface Props {
		points: MlPoint[];
		unit: string;
		description: string;
	}

	let { points, unit, description }: Props = $props();

	const data = $derived<ChartData<'line'>>({
		datasets: [
			{
				label: unit,
				data: points.map((point) => ({ x: point.date.getTime(), y: point.value })),
				borderColor: '#4a3aa7',
				backgroundColor: '#4a3aa718',
				borderWidth: 2,
				pointRadius: 1.5,
				pointHitRadius: 8,
				tension: 0.1,
				fill: true,
				spanGaps: true
			}
		]
	} as unknown as ChartData<'line'>);

	const options = $derived<ChartOptions<'line'>>({
		responsive: true,
		maintainAspectRatio: false,
		interaction: { mode: 'nearest', axis: 'x', intersect: false },
		plugins: {
			legend: { display: false },
			tooltip: {
				callbacks: {
					label: (item) => `${Math.round((item.parsed.y ?? 0) * 100) / 100} ${unit}`
				}
			}
		},
		scales: {
			x: { type: 'time', time: { unit: 'week', tooltipFormat: 'MMM dd, yyyy' } },
			y: { beginAtZero: false, title: { display: true, text: unit } }
		}
	});
</script>

<div class="wrapper">
	<p class="description">{description}</p>
	<div class="canvas">
		{#if points.length === 0}
			<p class="empty">No data for this platform.</p>
		{:else}
			<Chart type="line" {data} {options} ariaLabel={description} />
		{/if}
	</div>
</div>

<style>
	.wrapper {
		flex: 1;
		min-width: 0;
	}

	.description {
		font-size: 12px;
		color: var(--ink-secondary);
		margin-bottom: var(--space-2);
	}

	.canvas {
		height: 220px;
		position: relative;
	}

	/* Centred by filling the wrapper rather than by a padding-top that has to be
	   kept in sync with its height. */
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
