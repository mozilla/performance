<script lang="ts">
	import { goto } from '$app/navigation';
	import { annotationsWithinDays } from '$lib/annotations';
	import { page } from '$app/state';
	import Chart from '$lib/components/Chart.svelte';
	import ComparisonTable from '$lib/components/ComparisonTable.svelte';
	import RangePicker from '$lib/components/RangePicker.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import VideoPanel from '$lib/components/VideoPanel.svelte';
	import { perfherderGraphsUrl, pushlogUrl, treeherderJobUrl } from '$lib/api/treeherder';
	import { resource } from '$lib/resource.svelte';
	import {
		annotationsFor,
		displayName,
		NAVBENCH_FRAMEWORK,
		NAVBENCH_PLATFORMS,
		NAVBENCH_REPOSITORY,
		OVERALL_TEST
	} from '$lib/navbench/config';
	import {
		loadNavBenchMeasurements,
		loadNavBenchSignatures,
		rowKeyFor,
		signaturesForTest,
		TABLE_WINDOW_DAYS,
		testsIn
	} from '$lib/navbench/data';
	import {
		navBenchHref,
		type NavBenchState,
		openJobId,
		openReplicateIndex,
		parseNavBenchState,
		withVideoClosed
	} from '$lib/navbench/state';
	import { defaultGroup, loadNavBenchVideos } from '$lib/navbench/video';
	import SubtestCharts from './SubtestCharts.svelte';
	import { NoVideoError } from '$lib/replicate-videos';
	import { buildChartData, buildChartOptions, type ChartPoint } from '$lib/speedometer/chart';
	import { nextSelection, type SelectedPoint, selectionIsLive } from '$lib/speedometer/selection';
	import { buildComparisonTable, type RowNaming } from '$lib/speedometer/table';

	const view = $derived(parseNavBenchState(page.url));
	const href = (patch: Partial<NavBenchState>) => navBenchHref(page.url, patch);
	const apply = (patch: Partial<NavBenchState>) =>
		goto(href(patch), { replaceState: true, noScroll: true, keepFocus: true });

	// One field at a time: `view` is a fresh object per URL change, so reading it
	// inside a resource makes that resource depend on the whole URL -- opening a
	// recording would refetch the whole table. See the Speedometer route.
	const os = $derived(view.os);
	const selectedTest = $derived(view.test);
	const range = $derived(view.range);

	const signatures = resource((signal) => loadNavBenchSignatures(os, signal));

	const tests = $derived(testsIn(signatures.value ?? []));

	const chartData = resource(async (signal) => {
		const all = signatures.value;
		if (!all) return [];
		return loadNavBenchMeasurements(signaturesForTest(all, selectedTest), range, signal);
	});

	const tableData = resource(async (signal) => {
		const all = signatures.value;
		if (!all) return [];
		return loadNavBenchMeasurements(all, TABLE_WINDOW_DAYS, signal);
	});

	const measurements = $derived(chartData.value ?? []);

	// Every test in this suite is a score, and higher is better.
	const naming: RowNaming = {
		label: displayName,
		unit: () => '',
		lowerIsBetter: () => false
	};

	const table = $derived(
		buildComparisonTable(tableData.value ?? [], tests, {
			supportsSafari: false,
			browsers: ['firefox', 'firefox-nar'],
			rowKey: rowKeyFor,
			naming
		})
	);

	// --- Chart ------------------------------------------------------------

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

	function clickPoint(point: ChartPoint) {
		const result = nextSelection(selection, {
			revision: point.revision,
			value: point.y,
			time: point.x
		});
		selection = result.selection;
		if (result.range) {
			pushlog = {
				url: pushlogUrl(NAVBENCH_REPOSITORY, result.range.from, result.range.to),
				from: result.range.from,
				to: result.range.to
			};
		}

		if (point.jobId) apply({ job: String(point.jobId), group: '', replicate: '' });
	}

	const chartInputs = $derived({
		measurements,
		// Higher-is-better everywhere here; SCORE_TEST is what selects that axis
		// direction, and yLabel spells it out.
		test: 'score',
		hidden: new Set<string>(),
		replicates: false,
		markers: [],
		annotations: annotationsWithinDays(annotationsFor(selectedTest), range),
		reference: selection,
		yLabel: 'Score (higher is better)'
	});

	const chartConfig = $derived(buildChartData(chartInputs));
	const chartOptions = $derived(
		buildChartOptions(chartInputs, {
			onPointClick: clickPoint,
			tooltipFooter: () => 'Click to play this run’s recordings'
		})
	);

	const perfherderUrl = $derived.by(() => {
		const seen = new Map<
			number,
			{ repository: typeof NAVBENCH_REPOSITORY; signatureId: number; framework: number }
		>();
		for (const m of measurements) {
			if (!seen.has(m.signatureId)) {
				seen.set(m.signatureId, {
					repository: NAVBENCH_REPOSITORY,
					signatureId: m.signatureId,
					framework: NAVBENCH_FRAMEWORK
				});
			}
		}
		return seen.size > 0 ? perfherderGraphsUrl([...seen.values()]) : null;
	});

	// --- Recordings --------------------------------------------------------

	const openJob = $derived(openJobId(view));

	const videoData = resource(async (signal) => {
		const jobId = openJob;
		if (jobId === null) return null;
		return loadNavBenchVideos(jobId, signal);
	});

	const videoError = $derived.by(() => {
		const error = videoData.error;
		if (!error) return null;
		return error instanceof NoVideoError
			? error.message
			: `Could not load the recordings for this job: ${String(error)}`;
	});

	// An explicit choice wins; otherwise open the site whose chart was clicked.
	const activeGroup = $derived.by(() => {
		const groups = videoData.value?.groups;
		if (!groups?.length) return '';
		if (view.group && groups.some((group) => group.key === view.group)) return view.group;
		return defaultGroup(groups, view.test);
	});

	const replicateIndex = $derived(
		openReplicateIndex(
			view,
			videoData.value?.groups.find((group) => group.key === activeGroup)?.videos.length ?? 0
		)
	);

	const openRevision = $derived(measurements.find((m) => m.jobId === openJob)?.revision ?? '');

	const title = $derived(`${displayName(view.test)} (higher is better)`);
	const loading = $derived(signatures.loading || chartData.loading);
</script>

<svelte:head><title>Navigation Benchmark — {displayName(view.test)}</title></svelte:head>

<div class="page">
	<div class="explainer">
		<strong>Navigation Benchmark</strong> tests Firefox navigation performance across real websites:
		Amazon, BBC, DuckDuckGo, Facebook, Google, Google Docs, Reddit, Wikipedia and Yahoo. Sites are
		tested across a mix of page load, sub-navigation and warm-load scenarios, scored using
		SpeedIndex. Per-site and overall scores are geometric means; higher is better. Click a point to
		play the screen recordings that run made. Dashed markers on the charts flag benchmark changes;
		hover for details, or click the label to open the bug.
		<p class="links">
			<a
				href="https://firefox-source-docs.mozilla.org/testing/perfdocs/raptor.html#nav-bench"
				target="_blank"
				rel="noreferrer">Documentation</a
			>
			<a
				href="https://bugzilla.mozilla.org/show_bug.cgi?id=2057233"
				target="_blank"
				rel="noreferrer">Meta bug 2057233</a
			>
		</p>
	</div>

	<nav class="platforms" aria-label="Platform" data-sveltekit-noscroll>
		{#each NAVBENCH_PLATFORMS as entry (entry.key)}
			<a href={href(withVideoClosed({ os: entry.key }))} class:active={view.os === entry.key}>
				{entry.label}
			</a>
		{/each}
	</nav>

	<h3 class="chart-title">
		{#if perfherderUrl}
			<a href={perfherderUrl} target="_blank" rel="noreferrer">{title}</a>
		{:else}
			{title}
		{/if}
	</h3>

	<!-- Stated rather than offered as a toggle: the benchmark only runs on
	     autoland, so there is no mozilla-central data to switch to. -->
	<p class="source">Data source: <strong>autoland</strong></p>

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
		<RangePicker selected={view.range} href={(range) => href(withVideoClosed({ range }))} />
	</div>

	<p class="pushlog">
		{#if pushlog}
			<a href={pushlog.url} target="_blank" rel="noreferrer">
				Pushlog: {pushlog.from.slice(0, 12)} &rarr; {pushlog.to.slice(0, 12)}
			</a>
		{:else}
			<span class="hint">Click a point to play its recordings; click two for a pushlog</span>
		{/if}
	</p>

	<!-- Below the chart for the same reason as Android's and Job Debug's
	     legend: it appears on a click, and above the chart it would scroll the
	     point out from under the cursor that opened it. -->
	{#if openJob !== null}
		<div class="video-slot">
			{#if videoData.loading}
				<Spinner message="Downloading the recordings for this job…" />
			{:else if videoError}
				<p class="error">{videoError}</p>
			{:else if videoData.value}
				<VideoPanel
					groups={videoData.value.groups}
					selectedGroup={activeGroup}
					selectedReplicate={replicateIndex}
					unit=""
					task={videoData.value.task}
					jobUrl={treeherderJobUrl(NAVBENCH_REPOSITORY, openRevision, videoData.value.task)}
					onselectGroup={(group) => apply({ group, replicate: '' })}
					onselectReplicate={(replicate) => apply({ replicate: String(replicate) })}
					onclose={() => apply(withVideoClosed({}))}
				/>
			{/if}
		</div>
	{/if}

	<div class="subtest-toggle">
		<a class="button" href={href({ subtestCharts: !view.subtestCharts })}>
			{view.subtestCharts ? 'Hide' : 'Load'} All Subtest Charts
		</a>
	</div>

	{#if view.subtestCharts}
		<SubtestCharts
			signatures={signatures.value ?? []}
			days={view.range}
			href={(test) => href(withVideoClosed({ test }))}
		/>
	{/if}

	<h3>Breakdown: Nav Bench subtests</h3>

	{#if signatures.error}
		<p class="error">Could not load signatures: {String(signatures.error)}</p>
	{:else if tableData.loading}
		<Spinner message="Loading breakdown…" />
	{:else if tests.length <= 1 && table.rows.length === 0}
		<p class="note">No Nav Bench data on this platform. The benchmark may not have run here yet.</p>
	{:else}
		<ComparisonTable
			{table}
			selected={view.test === OVERALL_TEST ? OVERALL_TEST : view.test}
			href={(test) => href(withVideoClosed({ test }))}
			sort={view.sort}
			dir={view.dir}
			sortHref={(sort, dir) => href({ sort, dir })}
		/>
	{/if}
</div>

<style>
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
		border-color: var(--accent);
	}

	.page {
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 100%;
	}

	h3 {
		font-family: sans-serif;
	}

	.explainer {
		max-width: var(--content-max);
		margin: var(--space-3) auto var(--space-5);
		padding: var(--space-4) var(--space-5);
		background: var(--surface-note);
		border: 1px solid var(--border-note);
		border-radius: var(--radius-md);
		text-align: left;
		font-family: sans-serif;
		font-size: 14px;
		line-height: 1.5;
	}

	.links {
		margin-top: var(--space-2);
		display: flex;
		gap: var(--space-5);
	}

	.platforms {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
		justify-content: center;
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
		margin: var(--space-5) 0 var(--space-2);
	}

	.chart-title a {
		text-decoration: none;
		color: inherit;
	}

	.source {
		width: 100%;
		max-width: var(--content-max);
		margin-bottom: var(--space-1);
		font-family: sans-serif;
		font-size: 13px;
		color: var(--ink-secondary);
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
		margin: var(--space-2) 0 var(--space-4);
		font-family: sans-serif;
		font-size: 13px;
	}

	.hint {
		color: var(--ink-disabled);
	}

	.video-slot {
		width: 100%;
		max-width: var(--content-max);
	}

	.note {
		font-family: sans-serif;
		font-size: 13px;
		color: var(--ink-muted);
	}

	.error {
		font-family: sans-serif;
		color: var(--danger);
		padding: var(--space-5) 0;
	}
</style>
