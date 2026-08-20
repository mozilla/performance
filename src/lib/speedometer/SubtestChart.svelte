<script lang="ts">
	import { annotationsWithinDays } from '$lib/annotations';
	import Chart from '$lib/components/Chart.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import type { PerfSignature } from '$lib/api/treeherder';
	import { resource } from '$lib/resource.svelte';
	import { axisLabel, buildChartData, buildChartOptions } from './chart';
	import { loadMeasurements } from './data';
	import { signaturesForTests, type SpeedometerSuite } from './suite';
	import type { RowNaming } from './table';

	interface Props {
		suite: SpeedometerSuite;
		naming: RowNaming;
		test: string;
		signatures: PerfSignature[];
		days: number;
		replicates: boolean;
		hidden: ReadonlySet<string>;
		/** Link to make this subtest the main chart. */
		href: string;
	}

	let { suite, naming, test, signatures, days, replicates, hidden, href }: Props = $props();

	const data = resource((signal) =>
		loadMeasurements(signaturesForTests(suite, signatures, [test]), days, replicates, signal)
	);

	const inputs = $derived({
		measurements: data.value ?? [],
		test,
		hidden,
		replicates,
		markers: [],
		annotations: annotationsWithinDays(suite.annotations ?? [], days),
		reference: null,
		yLabel: axisLabel(naming, test)
	});

	const chartData = $derived(buildChartData(inputs));
	const chartOptions = $derived(buildChartOptions(inputs));
	const label = $derived(naming.label(test));
	const direction = $derived(naming.lowerIsBetter(test) ? 'lower' : 'higher');
</script>

<section>
	<h3><a {href}>{label}</a> <span class="direction">({direction} is better)</span></h3>

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
		margin-bottom: var(--space-7);
	}

	.chart-frame {
		height: var(--chart-height-sm);
		position: relative;
	}

	h3 {
		font-family: sans-serif;
		margin-bottom: var(--space-1);
		font-size: 1.1em;
	}

	h3 a {
		color: inherit;
		text-decoration: none;
	}

	h3 a:hover {
		text-decoration: underline;
	}

	.direction {
		font-weight: normal;
		color: var(--ink-muted);
		font-size: 0.85em;
	}

	.empty,
	.error {
		font-family: sans-serif;
		font-size: 13px;
		color: var(--ink-disabled);
		padding: var(--space-5) 0;
	}
</style>
