<script lang="ts">
	import { Chart as ChartJs } from 'chart.js/auto';
	import Chart from '$lib/components/Chart.svelte';
	import type { Probe } from '$lib/memory/config';
	import {
		buildProbeData,
		buildProbeOptions,
		datasetsForProbe,
		versionEndLabels
	} from '$lib/memory/chart';
	import { type MemoryRow, thresholdCrossings } from '$lib/memory/data';

	// Registered once at module scope; Chart.js ignores a repeat registration.
	ChartJs.register(versionEndLabels);

	interface Props {
		probe: Probe;
		processData: Record<string, MemoryRow[]> | undefined;
		versionMode: boolean;
	}

	let { probe, processData, versionMode }: Props = $props();

	const datasets = $derived(datasetsForProbe(probe, processData, versionMode));
	const crossings = $derived(versionMode ? [] : thresholdCrossings(probe, processData));
	const data = $derived(buildProbeData(datasets));
	const options = $derived(buildProbeOptions(probe, versionMode, crossings));

	const hasData = $derived(datasets.some((dataset) => dataset.data.some((p) => p.y !== null)));
</script>

<section class="probe">
	<h3>{probe.title}</h3>
	<div class="chart-wrapper">
		{#if hasData}
			<Chart type="line" {data} {options} ariaLabel="{probe.title} over time" />
		{:else}
			<p class="empty">No data for this process.</p>
		{/if}
	</div>
</section>

<style>
	.probe {
		background: var(--surface-card);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		padding: var(--space-3) var(--space-4) var(--space-4);
	}

	h3 {
		font-size: 15px;
		font-weight: 600;
		margin-bottom: var(--space-2);
	}

	/* Fixed height with maintainAspectRatio false, so the grid rows line up
	   regardless of how many legend entries each chart has. */
	.chart-wrapper {
		height: var(--chart-height-sm);
		position: relative;
	}

	/* Centred by filling the wrapper rather than by a padding-top that has to be
	   kept in sync with its height. */
	.empty {
		color: var(--ink-disabled);
		font-size: 13px;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		text-align: center;
	}
</style>
