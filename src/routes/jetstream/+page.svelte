<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Chart from '$lib/components/Chart.svelte';
	import ComparisonTable from '$lib/components/ComparisonTable.svelte';
	import RangePicker from '$lib/components/RangePicker.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import ToggleChip from '$lib/components/ToggleChip.svelte';
	import { perfherderGraphsUrl, pushlogUrl, type Repository } from '$lib/api/treeherder';
	import { resource } from '$lib/resource.svelte';
	import {
		buildAlertMarkers,
		fetchAlertsForTest,
		markersWithinDays,
		mergeAlertData
	} from '$lib/speedometer/alerts';
	import { buildChartData, buildChartOptions, type ChartPoint } from '$lib/speedometer/chart';
	import { nextSelection, type SelectedPoint, selectionIsLive } from '$lib/speedometer/selection';
	import { buildComparisonTable } from '$lib/speedometer/table';
	import { chartSignatures, ALERT_WINDOW_DAYS } from '$lib/speedometer/data';
	import {
		displayName,
		JETSTREAM_FRAMEWORK,
		JETSTREAM_SUITE,
		PLATFORMS,
		platformByKey,
		SCORE_TEST
	} from '$lib/jetstream/config';
	import {
		fetchJetStreamSnapshot,
		loadJetStreamSeries,
		loadJetStreamSignatures,
		testsIn,
		toMeasurements
	} from '$lib/jetstream/data';
	import { FILTER_PRESETS, filterTests } from '$lib/jetstream/filter';
	import { jetStreamHref, type JetStreamState, parseJetStreamState } from '$lib/jetstream/state';
	import { toggleHidden } from '$lib/speedometer/state';

	const view = $derived(parseJetStreamState(page.url));
	const href = (patch: Partial<JetStreamState>) => jetStreamHref(page.url, patch);
	const apply = (patch: Partial<JetStreamState>) =>
		goto(href(patch), { replaceState: true, noScroll: true, keepFocus: true });

	const platform = $derived(platformByKey(view.os));

	// The table reads the pre-aggregated snapshot: one request covering every
	// test and browser. The chart reads Treeherder for the selected test only.
	const snapshot = resource((signal) => fetchJetStreamSnapshot(signal));

	const tableMeasurements = $derived(
		snapshot.value
			? toMeasurements(snapshot.value, platform.platforms, platform.safariPlatform)
			: []
	);

	const tests = $derived(testsIn(tableMeasurements));

	// Filtering the test list rather than the built table: the table's columns
	// are derived from which browsers have data for the tests in it, so hiding
	// rows afterwards could leave a column header with nothing under it.
	const visibleTests = $derived(filterTests(tests, view.filter));

	const table = $derived(
		buildComparisonTable(tableMeasurements, visibleTests, { supportsSafari: true })
	);

	// One field at a time: `view` is a fresh object per URL change, so reading it
	// inside a resource makes that resource depend on the whole URL. See the
	// comment on the Speedometer route.
	const os = $derived(view.os);
	const repository = $derived(view.repository);
	const selectedTest = $derived(view.test);
	const range = $derived(view.range);
	const showAlerts = $derived(view.alerts);
	// Only widens the search on the score chart; on a subtest the alerts for
	// every other subtest would be noise attributed to the wrong series.
	const showAllAlerts = $derived(view.allAlerts && view.test === SCORE_TEST);

	const signatures = resource((signal) => loadJetStreamSignatures(os, repository, signal));

	const chartData = resource(async (signal) => {
		const all = signatures.value;
		if (!all) return [];
		return loadJetStreamSeries(chartSignatures(all, selectedTest), range, signal);
	});

	const alertData = resource(async (signal) => {
		if (!showAlerts) return null;
		const parts = await Promise.all(
			platform.platforms.map((each) =>
				fetchAlertsForTest(selectedTest, each, ALERT_WINDOW_DAYS, signal, {
					suite: JETSTREAM_SUITE,
					framework: JETSTREAM_FRAMEWORK,
					allTests: showAllAlerts
				}).catch(() => ({ alerts: [], summaries: new Map() }))
			)
		);
		return mergeAlertData(parts);
	});

	const markers = $derived(
		alertData.value
			? markersWithinDays(buildAlertMarkers(view.test, alertData.value), view.range)
			: []
	);

	const measurements = $derived(chartData.value ?? []);

	let selection = $state<SelectedPoint | null>(null);
	let pushlog = $state<{ url: string; from: string; to: string } | null>(null);

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
		if (result.range) {
			pushlog = {
				url: pushlogUrl(view.repository, result.range.from, result.range.to),
				from: result.range.from,
				to: result.range.to
			};
		}
	}

	const chartInputs = $derived({
		measurements,
		// JetStream reports a score everywhere, so the axis is always
		// higher-is-better; SCORE_TEST makes buildChartOptions pick that.
		test: SCORE_TEST,
		hidden: view.hide,
		replicates: false,
		markers,
		reference: selection
	});

	const chartConfig = $derived(buildChartData(chartInputs));
	const chartOptions = $derived(
		buildChartOptions(chartInputs, {
			onPointClick: selectPoint,
			onLegendClick: (label) => apply({ hide: toggleHidden(view.hide, label) })
		})
	);

	const perfherderUrl = $derived.by(() => {
		const seen = new Map<
			number,
			{ repository: Repository; signatureId: number; framework: number }
		>();
		for (const m of measurements) {
			if (!seen.has(m.signatureId)) {
				seen.set(m.signatureId, {
					repository: m.repository,
					signatureId: m.signatureId,
					framework: JETSTREAM_FRAMEWORK
				});
			}
		}
		return seen.size > 0 ? perfherderGraphsUrl([...seen.values()]) : null;
	});

	const title = $derived(`${displayName(view.test)} (higher is better)`);
	const loading = $derived(signatures.loading || chartData.loading);
</script>

<svelte:head><title>JetStream 3 — {displayName(view.test)}</title></svelte:head>

<div class="page">
	<nav class="platforms" aria-label="Platform" data-sveltekit-noscroll>
		{#each PLATFORMS as entry (entry.key)}
			<a href={href({ os: entry.key })} class:active={view.os === entry.key}>{entry.label}</a>
		{/each}
	</nav>

	<h3 class="chart-title">
		{#if perfherderUrl}
			<a href={perfherderUrl} target="_blank" rel="noreferrer">{title}</a>
		{:else}
			{title}
		{/if}
	</h3>

	<div class="controls">
		<ToggleChip
			label="Use autoland data"
			checked={view.repository === 'autoland'}
			onchange={(on) => apply({ repository: on ? 'autoland' : 'mozilla-central' })}
		/>
		<ToggleChip
			label="Show alerts"
			checked={view.alerts}
			onchange={(on) => apply({ alerts: on })}
		/>

		{#if view.test === SCORE_TEST}
			<ToggleChip
				label="Show all subtest alerts"
				checked={view.allAlerts}
				onchange={(on) => apply({ allAlerts: on })}
			/>
		{/if}
	</div>

	<div class="chart-container">
		{#if chartData.error}
			<p class="error">Could not load chart data: {String(chartData.error)}</p>
		{:else}
			{#if loading}
				<Spinner overlay message="Loading chart data…" />
			{/if}
			<div class="chart-frame" class:dimmed={loading}>
				<Chart type="scatter" data={chartConfig} options={chartOptions} ariaLabel={title} />
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

	<h3>Breakdown: JetStream 3 Subtests</h3>

	{#if snapshot.error}
		<p class="error">Could not load the JetStream snapshot: {String(snapshot.error)}</p>
	{:else if snapshot.loading}
		<Spinner message="Loading breakdown…" />
	{:else}
		<div class="filter">
			<label for="test-filter">Filter tests:</label>
			<!--
				`oninput` with replaceState, like every other control here: typing
				should not push a history entry per keystroke. The value comes from
				the URL rather than being bound, so the presets below and the back
				button both drive the box.
			-->
			<input
				id="test-filter"
				type="search"
				placeholder="e.g. wasm, crypto, -wasm"
				title="Comma-separated terms. A term must appear in the test name; prefix with '-' to exclude."
				value={view.filter}
				oninput={(event) => apply({ filter: event.currentTarget.value })}
			/>
			<span class="presets">
				<strong>Presets:</strong>
				{#each FILTER_PRESETS as preset (preset.label)}
					<a href={href({ filter: preset.value })} class:active={view.filter === preset.value}>
						{preset.label}
					</a>
				{/each}
			</span>
			<span class="count" aria-live="polite">
				{table.rows.length}
				{table.rows.length === 1 ? 'test' : 'tests'}
			</span>
		</div>

		<ComparisonTable
			{table}
			selected={view.test}
			href={(test) => href({ test })}
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

	.filter {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		max-width: var(--content-max);
		margin: 0 auto;
		font-family: sans-serif;
		font-size: 13px;
	}

	.filter input {
		flex: 0 1 18rem;
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		font: inherit;
	}

	.presets {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.presets a {
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		background: var(--surface-card);
		color: inherit;
		text-decoration: none;
	}

	.presets a:hover {
		border-color: var(--accent);
	}

	.presets a.active {
		background: var(--surface-accent-soft);
		border-color: var(--accent);
	}

	/* Pushed to the far end so it does not move as the presets wrap. */
	.count {
		margin-left: auto;
		color: var(--ink-muted);
	}

	h3 {
		font-family: sans-serif;
	}

	.platforms {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
		justify-content: center;
		margin-bottom: var(--space-3);
	}

	.platforms a {
		padding: var(--space-3) var(--space-6);
		border-radius: var(--radius-sm);
		text-decoration: none;
		color: var(--ink-primary);
		font-family: sans-serif;
		border: 1px solid transparent;
	}

	.platforms a:hover {
		background-color: var(--surface-control-hover);
	}

	.platforms a.active {
		background-color: var(--surface-accent-soft);
		border-color: var(--accent);
		font-weight: bold;
	}

	.chart-title {
		margin: var(--space-5) 0;
	}

	.chart-title a {
		text-decoration: none;
		color: inherit;
	}

	.controls {
		display: flex;
		gap: var(--space-2);
		width: 100%;
		max-width: var(--content-max);
		margin-bottom: var(--space-1);
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
		margin-top: var(--space-2);
		font-family: sans-serif;
		font-size: 13px;
	}

	.hint {
		color: var(--ink-disabled);
	}

	.error {
		font-family: sans-serif;
		color: var(--danger);
		padding: var(--space-8) 0;
	}
</style>
