<script lang="ts">
	import type { ChartData, ChartOptions, Plugin } from 'chart.js';
	import Chart from './Chart.svelte';
	import type { Slice } from '$lib/bugs/stats';

	interface Props {
		slices: Slice[];
		/** Where clicking a slice or legend entry goes. */
		linkFor(slice: Slice): string;
		legendPosition?: 'right' | 'bottom';
		fontSize?: number;
		/** Fixed colours; omit to let Chart.js assign them. */
		colors?: string[];
		title: string;
	}

	let { slices, linkFor, legendPosition = 'right', fontSize = 14, colors, title }: Props = $props();

	const background: Plugin = {
		id: 'backgroundColor',
		beforeDraw: (chart) => {
			const { ctx, width, height } = chart;
			ctx.save();
			ctx.fillStyle = '#ececec';
			ctx.fillRect(0, 0, width, height);
			ctx.restore();
		}
	};

	const data = $derived<ChartData<'pie'>>({
		labels: slices.map((slice) => slice.label),
		datasets: [
			{
				data: slices.map((slice) => slice.count),
				...(colors ? { backgroundColor: colors, hoverBackgroundColor: colors } : {})
			}
		]
	});

	function open(index: number) {
		const slice = slices[index];
		if (slice) window.open(linkFor(slice), '_blank', 'noopener');
	}

	const options = $derived<ChartOptions<'pie'>>({
		responsive: true,
		onClick: (_event, elements) => {
			if (elements.length > 0) open(elements[0].index);
		},
		plugins: {
			legend: {
				position: legendPosition,
				onClick: (_event, item) => {
					if (item.index !== undefined) open(item.index);
				},
				labels: { boxWidth: 20, font: { size: fontSize } }
			}
		}
	});
</script>

<Chart type="pie" {data} {options} plugins={[background]} ariaLabel={title} />
