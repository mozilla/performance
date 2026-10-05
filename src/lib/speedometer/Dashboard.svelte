<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Chart from '$lib/components/Chart.svelte';
	import ComparisonTable from '$lib/components/ComparisonTable.svelte';
	import PlatformPicker from '$lib/components/PlatformPicker.svelte';
	import RangePicker from '$lib/components/RangePicker.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import ToggleChip from '$lib/components/ToggleChip.svelte';
	import SubtestCharts from './SubtestCharts.svelte';
	import { annotationsWithinDays } from '$lib/annotations';
	import { pushlogUrl } from '$lib/api/treeherder';
	import { resource } from '$lib/resource.svelte';
	import { buildAlertMarkers, markersWithinDays } from '$lib/speedometer/alerts';
	import {
		axisLabel,
		buildChartData,
		buildChartOptions,
		type ChartPoint
	} from '$lib/speedometer/chart';
	import { nextSelection, type SelectedPoint, selectionIsLive } from '$lib/speedometer/selection';
	import { platformByKey } from '$lib/speedometer/config';
	import {
		loadAlerts,
		loadMeasurements,
		loadSignatures,
		TABLE_WINDOW_DAYS
	} from '$lib/speedometer/data';
	import {
		parseSpeedometerState,
		type SpeedometerState,
		speedometerHref,
		toggleHidden
	} from '$lib/speedometer/state';
	import { signaturesForTests, type SpeedometerSuite } from '$lib/speedometer/suite';
	import { buildComparisonTable } from '$lib/speedometer/table';

	interface Props {
		suite: SpeedometerSuite;
	}

	let { suite }: Props = $props();

	// Everything the user chose comes from the URL, so there is no local copy to
	// keep in sync and no way for one control to clobber another's setting.
	const view = $derived(parseSpeedometerState(page.url, suite.schema));
	const platform = $derived(platformByKey(view.os));

	const href = (patch: Partial<SpeedometerState>) => speedometerHref(page.url, patch, suite.schema);
	const apply = (patch: Partial<SpeedometerState>) =>
		goto(href(patch), { replaceState: true, noScroll: true, keepFocus: true });

	// --- Data -------------------------------------------------------------
	// Each resource re-runs when the state it reads changes, aborting the
	// previous request. A response that arrives after its own abort is dropped,
	// so the chart always reflects the current URL rather than whichever fetch
	// happened to finish last.
	//
	// The fields are pulled out one at a time on purpose. `view` is a fresh
	// object on every URL change, so a resource that reads `view.replicates`
	// depends on the whole URL and re-runs when anything in it changes -- which
	// made picking a range refetch all 21 signatures behind the breakdown table
	// and blank it for a second. A $derived of a primitive only notifies when
	// the value actually differs, so each resource depends on what it reads.
	const os = $derived(view.os);
	const repository = $derived(view.repository);
	const subtest = $derived(view.subtest);
	const range = $derived(view.range);
	const replicates = $derived(view.replicates);
	const showAlerts = $derived(suite.alerts && view.alerts);

	// Experimental's suite has no Safari, so there is no point asking for it.
	const safariPlatform = $derived(
		!suite.browsers || suite.browsers.includes('safari') ? platform.safariPlatform : undefined
	);

	const signatures = resource((signal) =>
		loadSignatures(os, repository, signal, { suite: suite.suite, safariPlatform })
	);

	// Which tests there are, and how each is named, can depend on the
	// signatures: Speedometer Experimental discovers both.
	const tests = $derived(suite.tests(signatures.value ?? []));
	const naming = $derived(suite.naming(signatures.value ?? []));

	const tableData = resource(async (signal) => {
		const all = signatures.value;
		if (!all) return [];
		const rows = signaturesForTests(suite, all, suite.tests(all));
		return loadMeasurements(rows, TABLE_WINDOW_DAYS, replicates, signal);
	});

	const chartData = resource(async (signal) => {
		const all = signatures.value;
		if (!all) return [];
		return loadMeasurements(signaturesForTests(suite, all, [subtest]), range, replicates, signal);
	});

	const alertData = resource(async (signal) => {
		if (!showAlerts) return null;
		return loadAlerts(os, subtest, signal);
	});

	// --- Derived views ------------------------------------------------------

	const table = $derived(
		buildComparisonTable(tableData.value ?? [], tests, {
			supportsSafari: platform.supportsSafari,
			safariPlatform,
			browsers: suite.browsers,
			rowKey: (measurement) => suite.testKey(measurement.test),
			naming
		})
	);

	// Clipped to the charted window so an old alert cannot stretch the x axis
	// past the range the user selected.
	const markers = $derived(
		alertData.value
			? markersWithinDays(buildAlertMarkers(view.subtest, alertData.value), view.range)
			: []
	);

	// The pushlog anchor is identified by push, not by array index -- see
	// lib/speedometer/selection.ts for why (bug A4).
	let selection = $state<SelectedPoint | null>(null);
	let pushlog = $state<{ url: string; from: string; to: string } | null>(null);

	const measurements = $derived(chartData.value ?? []);

	// Drop an anchor that is not present in the series currently on screen,
	// rather than clearing it from each control's handler and inevitably
	// missing one.
	$effect(() => {
		if (
			selection &&
			!selectionIsLive(
				selection,
				measurements.map((m) => m.revision)
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
					url: pushlogUrl(view.repository, result.range.from, result.range.to),
					from: result.range.from,
					to: result.range.to
				}
			: pushlog;
	}

	const chartInputs = $derived({
		measurements,
		test: view.subtest,
		hidden: view.hide,
		replicates: view.replicates,
		markers,
		annotations: annotationsWithinDays(suite.annotations ?? [], view.range),
		reference: selection,
		yLabel: axisLabel(naming, view.subtest)
	});

	const chartConfig = $derived(buildChartData(chartInputs));
	const chartOptions = $derived(
		buildChartOptions(chartInputs, {
			onPointClick: selectPoint,
			onLegendClick: (label) => apply({ hide: toggleHidden(view.hide, label) })
		})
	);

	const perfherderUrl = $derived.by(() => {
		const measurements = chartData.value ?? [];
		const seen = new Map<number, { repository: typeof view.repository; signatureId: number }>();
		for (const m of measurements) {
			if (!seen.has(m.signatureId)) {
				seen.set(m.signatureId, { repository: m.repository, signatureId: m.signatureId });
			}
		}
		return seen.size > 0 ? suite.perfherderUrl([...seen.values()]) : null;
	});

	const title = $derived(
		`${naming.label(view.subtest)} (${naming.lowerIsBetter(view.subtest) ? 'lower' : 'higher'} is better)`
	);

	const loading = $derived(signatures.loading || chartData.loading);
	const failure = $derived(signatures.error ?? chartData.error);
</script>

<svelte:head><title>{suite.name} &mdash; {naming.label(view.subtest)}</title></svelte:head>

<div class="page">
	{#if suite.description}
		<p class="description">{suite.description}</p>
	{/if}

	<PlatformPicker platforms={suite.platforms} selected={view.os} href={(os) => href({ os })} />

	<h3 class="chart-title">
		{#if perfherderUrl}
			<a href={perfherderUrl} target="_blank" rel="noreferrer">{title}</a>
		{:else}
			{title}
		{/if}
	</h3>

	<div class="controls">
		<div class="control-group">
			<ToggleChip
				label="Use autoland data"
				checked={view.repository === 'autoland'}
				onchange={(on) => apply({ repository: on ? 'autoland' : 'mozilla-central' })}
			/>
			<ToggleChip
				label="Show replicates"
				checked={view.replicates}
				onchange={(on) => apply({ replicates: on })}
			/>
		</div>
		{#if suite.alerts}
			<ToggleChip
				label="Show alerts"
				checked={view.alerts}
				onchange={(on) => apply({ alerts: on })}
				title="Perfherder alerts from autoland"
			/>
		{/if}
	</div>

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

	{#if showAlerts && alertData.loading}
		<p class="hint">Loading alerts…</p>
	{/if}

	<div class="subtest-toggle" data-sveltekit-noscroll>
		<a class="button" href={href({ subtestCharts: !view.subtestCharts })}>
			{view.subtestCharts ? 'Hide' : 'Load'} All Subtest Charts
		</a>
	</div>

	{#if view.subtestCharts}
		<SubtestCharts
			{suite}
			{naming}
			signatures={signatures.value ?? []}
			days={view.range}
			replicates={view.replicates}
			hidden={view.hide}
			href={(subtest) => href({ subtest })}
		/>
	{/if}

	<h3>{suite.breakdownTitle}</h3>

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

	.controls {
		display: flex;
		justify-content: space-between;
		gap: var(--space-2);
		width: 100%;
		max-width: var(--content-max);
		margin-bottom: var(--space-1);
	}

	.control-group {
		display: flex;
		gap: var(--space-2);
	}

	.chart-container {
		width: 100%;
		max-width: var(--content-max);
		position: relative;
	}

	/* maintainAspectRatio is false, so Chart.js fills this box; the height has
	   to come from CSS. */
	.chart-frame {
		height: var(--chart-height);
		position: relative;
	}

	.dimmed {
		opacity: 0.3;
	}

	.pushlog {
		margin: var(--space-2) 0 0;
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

	.subtest-toggle {
		margin: var(--space-5) 0;
	}

	.button {
		display: inline-block;
		padding: var(--space-3) var(--space-5);
		font-size: 16px;
		font-family: sans-serif;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		background-color: var(--surface-control);
		color: var(--ink-primary);
		text-decoration: none;
	}

	.button:hover {
		background-color: var(--surface-control-hover);
	}
</style>
