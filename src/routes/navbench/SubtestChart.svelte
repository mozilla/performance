<script lang="ts">
	import { annotationsWithinDays } from '$lib/annotations';
	import Chart from '$lib/components/Chart.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import type { PerfSignature } from '$lib/api/treeherder';
	import { annotationsFor, displayName } from '$lib/navbench/config';
	import { loadNavBenchMeasurements, signaturesForTest } from '$lib/navbench/data';
	import { resource } from '$lib/resource.svelte';
	import { buildChartData, buildChartOptions } from '$lib/speedometer/chart';

	interface Props {
		test: string;
		signatures: PerfSignature[];
		days: number;
		/** Link that makes this test the main chart. */
		href: string;
	}

	let { test, signatures, days, href }: Props = $props();

	// One resource per chart, all started at once and paced by the shared
	// concurrency limiter in http.ts -- the same arrangement as Speedometer's
	// subtest charts, and the reason neither page needs hand-rolled batching.
	const data = resource((signal) =>
		loadNavBenchMeasurements(signaturesForTest(signatures, test), days, signal)
	);

	const inputs = $derived({
		measurements: data.value ?? [],
		// Every NavBench test is a score, so the axis direction is fixed; 'score'
		// is what selects higher-is-better in buildChartOptions.
		test: 'score',
		hidden: new Set<string>(),
		replicates: false,
		markers: [],
		annotations: annotationsWithinDays(annotationsFor(test), days),
		reference: null,
		yLabel: 'Score (higher is better)',
		beginAtZero: true
	});

	const chartData = $derived(buildChartData(inputs));
	const chartOptions = $derived(buildChartOptions(inputs));
	const label = $derived(displayName(test));
</script>

<section>
	<h3><a {href}>{label}</a> <span class="direction">(higher is better)</span></h3>

	{#if data.error}
		<p class="error">Could not load {label}.</p>
	{:else if data.loading}
		<Spinner size={30} message="Loading {label}…" />
	{:else if (data.value ?? []).length === 0}
		<p class="empty">No data available.</p>
	{:else}
		<div class="chart-frame">
			<Chart
				type="scatter"
				data={chartData}
				options={chartOptions}
				ariaLabel="{label} over time, by browser"
			/>
		</div>
	{/if}
</section>

<style>
	section {
		margin-bottom: var(--space-6);
	}

	h3 {
		font-family: sans-serif;
		font-size: 1rem;
		text-align: center;
		margin-bottom: var(--space-2);
	}

	h3 a {
		color: inherit;
	}

	.direction {
		font-weight: normal;
		color: var(--ink-muted);
		font-size: 0.85em;
	}

	/* Fixed height so the page does not reflow as each chart's data lands. */
	.chart-frame {
		height: 260px;
	}

	.empty,
	.error {
		font-family: sans-serif;
		font-size: 13px;
		color: var(--ink-disabled);
		text-align: center;
	}
</style>
