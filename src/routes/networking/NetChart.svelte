<script lang="ts">
	import Chart from '$lib/components/Chart.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import { resource } from '$lib/resource.svelte';
	import { ANNOTATIONS, type ChartConfig } from '$lib/networking/config';
	import {
		annotationsFor,
		buildPieChartData,
		buildPieChartOptions,
		buildSeriesChartData,
		buildSeriesChartOptions
	} from '$lib/networking/chart';
	import { loadChart } from '$lib/networking/data';

	interface Props {
		id: string;
		config: ChartConfig;
	}

	let { id, config }: Props = $props();

	const chart = resource((signal) => loadChart(config, signal));
	const annotations = $derived(annotationsFor(ANNOTATIONS, id));

	const isPie = $derived(config.chartType === 'pie');

	const data = $derived.by(() => {
		const value = chart.value;
		if (!value) return null;
		return value.kind === 'pie'
			? buildPieChartData(value.data)
			: buildSeriesChartData(value.data, config);
	});

	const options = $derived.by(() => {
		const value = chart.value;
		if (!value) return null;
		return value.kind === 'pie'
			? buildPieChartOptions()
			: buildSeriesChartOptions(value.data, config, annotations);
	});

	const isEmpty = $derived(
		chart.value?.kind === 'series'
			? chart.value.data.labels.length === 0
			: chart.value?.kind === 'pie'
				? chart.value.data.labels.length === 0
				: false
	);
</script>

<section class="chart-section">
	<h3>{@html config.title}</h3>
	{#if config.description}
		<p class="desc">{@html config.description}</p>
	{/if}

	{#if config.legend}
		<dl class="terms">
			{#each config.legend as entry (entry.term)}
				<dt>{entry.term}</dt>
				<dd>{@html entry.definition}</dd>
			{/each}
		</dl>
	{/if}

	<div class="chart-wrapper">
		{#if chart.error}
			<p class="error">Error: {String(chart.error)}</p>
		{:else if chart.loading}
			<Spinner size={30} message="Loading…" />
		{:else if isEmpty || !data || !options}
			<p class="empty">No data.</p>
		{:else}
			<Chart type={isPie ? 'pie' : 'line'} {data} {options} ariaLabel={config.title} />
		{/if}
	</div>
</section>

<style>
	.chart-section {
		background: var(--surface-card);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		padding: var(--space-4);
		display: flex;
		flex-direction: column;
	}

	h3 {
		font-size: 15px;
		font-weight: 600;
		margin-bottom: var(--space-1);
	}

	.desc {
		font-size: 12px;
		color: var(--ink-secondary);
		margin-bottom: var(--space-2);
	}

	.terms {
		font-size: 11px;
		color: var(--ink-secondary);
		margin-bottom: var(--space-2);
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--space-1) var(--space-2);
	}

	.terms dt {
		font-weight: 600;
	}

	/* Fixed height with maintainAspectRatio false keeps the grid rows aligned
	   whatever each chart's legend does. */
	.chart-wrapper {
		height: var(--chart-height-sm);
		position: relative;
		margin-top: auto;
	}

	/* Centred by filling the wrapper rather than by a padding-top that has to be
	   kept in sync with its height. */
	.empty,
	.error {
		font-size: 13px;
		color: var(--ink-disabled);
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		text-align: center;
	}

	.error {
		color: var(--danger);
	}
</style>
