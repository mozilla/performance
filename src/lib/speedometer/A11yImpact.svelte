<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Chart from '#lib/components/Chart.svelte';
	import ComparisonTable from '#lib/components/ComparisonTable.svelte';
	import PlatformPicker from '#lib/components/PlatformPicker.svelte';
	import RangePicker from '#lib/components/RangePicker.svelte';
	import Spinner from '#lib/components/Spinner.svelte';
	import { perfherderGraphsUrl, pushlogUrl } from '#lib/api/treeherder.js';
	import { resource } from '#lib/resource.svelte.js';
	import {
		A11Y_PLATFORMS,
		A11Y_SUITE,
		A11Y_TESTS,
		a11ySchema,
		buildImpactTable,
		type ImpactPoint,
		impactTooltip,
		pairImpacts
	} from '#lib/speedometer/a11y.js';
	import { buildChartData, buildChartOptions, type ChartPoint } from '#lib/speedometer/chart.js';
	import {
		displayName,
		platformByKey,
		SPEEDOMETER_FRAMEWORK,
		SPEEDOMETER_SUITE
	} from '#lib/speedometer/config.js';
	import { loadMeasurements, loadSignatures, TABLE_WINDOW_DAYS } from '#lib/speedometer/data.js';
	import {
		nextSelection,
		type SelectedPoint,
		selectionIsLive
	} from '#lib/speedometer/selection.js';
	import {
		parseSpeedometerState,
		type SpeedometerState,
		speedometerHref,
		toggleHidden
	} from '#lib/speedometer/state.js';

	const view = $derived(parseSpeedometerState(page.url, a11ySchema));

	const href = (patch: Partial<SpeedometerState>) => speedometerHref(page.url, patch, a11ySchema);
	const apply = (patch: Partial<SpeedometerState>) =>
		goto(href(patch), { replace: true, reset: false });

	// Pulled out one at a time so each resource re-runs only when what it reads
	// changes; see Dashboard.svelte.
	const os = $derived(view.os);
	const subtest = $derived(view.subtest);
	const range = $derived(view.range);

	const signatures = resource((signal) =>
		loadSignatures(os, 'mozilla-central', signal, {
			platforms: platformByKey(os).platforms,
			include: (sig) =>
				(sig.suite === SPEEDOMETER_SUITE || sig.suite === A11Y_SUITE) &&
				A11Y_TESTS.includes(sig.test ?? '')
		})
	);

	const tableData = resource(async (signal) => {
		const all = signatures.value;
		if (!all) return [];
		return loadMeasurements(all, TABLE_WINDOW_DAYS, false, signal);
	});

	const chartData = resource(async (signal) => {
		const all = signatures.value;
		if (!all) return [];
		const charted = all.filter((sig) => sig.test === subtest);
		return loadMeasurements(charted, range, false, signal);
	});

	const table = $derived(buildImpactTable(pairImpacts(tableData.value ?? [])));
	const points = $derived(pairImpacts(chartData.value ?? []));

	const pointKey = (signatureId: number, revision: string) => `${signatureId}|${revision}`;
	const pointsByKey = $derived(
		new Map(points.map((point) => [pointKey(point.signatureId, point.revision), point]))
	);

	// Charted in percent, so the axis reads 30 rather than 0.3.
	const charted = $derived(points.map((point) => ({ ...point, value: point.value * 100 })));

	let selection = $state<SelectedPoint | null>(null);
	let pushlog = $state<{ url: string; from: string; to: string } | null>(null);

	$effect(() => {
		if (
			selection &&
			!selectionIsLive(
				selection,
				points.map((point) => point.revision)
			)
		) {
			selection = null;
			pushlog = null;
		}
	});

	function selectPoint(point: ChartPoint) {
		const result = nextSelection(selection, {
			revision: point.revision,
			value: point.y,
			time: point.x
		});
		selection = result.selection;
		pushlog = result.range
			? {
					url: pushlogUrl('mozilla-central', result.range.from, result.range.to),
					from: result.range.from,
					to: result.range.to
				}
			: pushlog;
	}

	const chartInputs = $derived({
		measurements: charted,
		test: view.subtest,
		hidden: view.hide,
		replicates: false,
		markers: [],
		reference: selection,
		yLabel: 'Slowdown with accessibility (%)',
		beginAtZero: true
	});

	const chartConfig = $derived(buildChartData(chartInputs));
	const chartOptions = $derived(
		buildChartOptions(chartInputs, {
			onPointClick: selectPoint,
			onLegendClick: (label) => apply({ hide: toggleHidden(view.hide, label) }),
			tooltipLabel: (point, series) => {
				const impact: ImpactPoint | undefined = pointsByKey.get(
					pointKey(point.signatureId, point.revision)
				);
				return impact ? impactTooltip(series, impact) : undefined;
			}
		})
	);

	// Both suites' series behind the chart, so Perfherder shows the raw scores.
	const perfherderUrl = $derived.by(() => {
		const ids = new Set(points.flatMap((point) => [point.signatureId, point.baselineSignatureId]));
		if (ids.size === 0) return null;
		return perfherderGraphsUrl(
			[...ids].map((signatureId) => ({
				repository: 'mozilla-central' as const,
				signatureId,
				framework: SPEEDOMETER_FRAMEWORK
			}))
		);
	});

	const title = $derived(`Accessibility slowdown: ${displayName(view.subtest)} (lower is better)`);

	const loading = $derived(signatures.loading || chartData.loading);
	const failure = $derived(signatures.error ?? chartData.error);
</script>

<svelte:head
	><title>Speedometer 3 Accessibility &mdash; {displayName(view.subtest)}</title></svelte:head
>

<div class="page">
	<p class="description">
		How much slower each browser runs Speedometer 3 with accessibility enabled.
	</p>

	<PlatformPicker platforms={A11Y_PLATFORMS} selected={view.os} href={(os) => href({ os })} />

	<h3 class="chart-title">
		{#if perfherderUrl}
			<a href={perfherderUrl} target="_blank" rel="noreferrer">{title}</a>
		{:else}
			{title}
		{/if}
	</h3>

	<div class="chart-container">
		{#if failure}
			<p class="error">Could not load data: {String(failure)}</p>
		{:else}
			{#if loading}
				<Spinner overlay message="Loading chart data…" />
			{/if}
			<div class="chart-frame" class:dimmed={loading}>
				<Chart
					type="scatter"
					data={chartConfig}
					options={chartOptions}
					ariaLabel="{title} over time, by browser"
				/>
			</div>
		{/if}
		<RangePicker selected={view.range} href={(range) => href({ range })} />
	</div>

	<div class="pushlog">
		{#if pushlog}
			<a href={pushlog.url} target="_blank" rel="noreferrer">
				Pushlog: {pushlog.from.slice(0, 12)} &rarr; {pushlog.to.slice(0, 12)}
			</a>
		{:else}
			<span class="hint">Select two points to generate a pushlog link</span>
		{/if}
	</div>

	<h3>Breakdown: Accessibility Slowdown by Subtest</h3>

	{#if tableData.loading}
		<Spinner message="Loading breakdown…" />
	{:else}
		<ComparisonTable
			{table}
			selected={view.subtest}
			href={(subtest) => href({ subtest })}
			sort={view.sort}
			dir={view.dir}
			sortHref={(sort, dir) => href({ sort, dir })}
			valueHeading="Slowdown with accessibility"
			diffHeading="Nightly's extra slowdown vs"
		/>
	{/if}
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 100%;
	}

	h3 {
		font-family: sans-serif;
	}

	.description {
		font-family: sans-serif;
		color: var(--ink-muted);
		max-width: var(--content-max);
		text-align: center;
		margin: 0 0 var(--space-5);
	}

	.chart-title {
		margin: var(--space-7) 0 var(--space-5);
	}

	.chart-title a {
		text-decoration: none;
		color: inherit;
	}

	.chart-title a:hover {
		text-decoration: underline;
	}

	.chart-container {
		width: 100%;
		max-width: var(--content-max);
		position: relative;
	}

	.chart-frame {
		height: var(--chart-height);
		position: relative;
	}

	.dimmed {
		opacity: 0.3;
	}

	.pushlog {
		margin: var(--space-2) 0 var(--space-5);
		font-family: sans-serif;
		font-size: 13px;
		text-align: center;
	}

	.pushlog a {
		color: var(--accent);
	}

	.hint {
		color: var(--ink-disabled);
		font-family: sans-serif;
		font-size: 13px;
	}

	.error {
		font-family: sans-serif;
		color: var(--danger);
		padding: var(--space-8) 0;
	}
</style>
