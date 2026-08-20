<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Chart from '$lib/components/Chart.svelte';
	import ComparisonTable from '$lib/components/ComparisonTable.svelte';
	import RangePicker from '$lib/components/RangePicker.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import ToggleChip from '$lib/components/ToggleChip.svelte';
	import VideoPanel from '$lib/components/VideoPanel.svelte';
	import {
		perfherderGraphsUrl,
		pushlogUrl,
		treeherderJobUrl,
		type Repository
	} from '$lib/api/treeherder';
	import { resource } from '$lib/resource.svelte';
	import { axisLabel, deviceByKey, DEVICES, testByKey, TESTS } from '$lib/android/config';
	import {
		ALERT_WINDOW_DAYS,
		loadAndroidMeasurements,
		loadAndroidSignatures,
		rowKeyFor,
		signaturesForTest,
		TABLE_WINDOW_DAYS,
		testsWithData
	} from '$lib/android/data';
	import {
		androidHref,
		type AndroidState,
		openJobId,
		openReplicateIndex,
		parseAndroidState,
		withVideoClosed
	} from '$lib/android/state';
	import { loadReplicateVideos } from '$lib/android/video';
	import { NoVideoError } from '$lib/replicate-videos';
	import {
		buildAlertMarkers,
		fetchAlertsForTest,
		markersWithinDays,
		mergeAlertData
	} from '$lib/speedometer/alerts';
	import { buildChartData, buildChartOptions, type ChartPoint } from '$lib/speedometer/chart';
	import { nextSelection, type SelectedPoint, selectionIsLive } from '$lib/speedometer/selection';
	import { buildComparisonTable, type RowNaming } from '$lib/speedometer/table';
	import { toggleHidden } from '$lib/speedometer/state';

	const view = $derived(parseAndroidState(page.url));
	const href = (patch: Partial<AndroidState>) => androidHref(page.url, patch);
	const apply = (patch: Partial<AndroidState>) =>
		goto(href(patch), { replaceState: true, noScroll: true, keepFocus: true });

	const device = $derived(deviceByKey(view.device));
	const test = $derived(testByKey(view.test));

	// One field at a time: `view` is a fresh object per URL change, so reading it
	// inside a resource makes that resource depend on the whole URL -- and the
	// table would refetch every signature each time the range changed. See the
	// comment on the Speedometer route.
	const deviceKey = $derived(view.device);
	const repository = $derived(view.repository);
	const range = $derived(view.range);
	const replicates = $derived(view.replicates);
	const showAlerts = $derived(view.alerts);

	const signatures = resource((signal) => loadAndroidSignatures(deviceKey, repository, signal));

	const chartData = resource(async (signal) => {
		const all = signatures.value;
		if (!all) return [];
		return loadAndroidMeasurements(signaturesForTest(all, test), range, replicates, signal);
	});

	// The table is a fixed 30-day window regardless of the chart range, so that
	// changing the range does not silently change what "7 day average" averages.
	const tableData = resource(async (signal) => {
		const all = signatures.value;
		if (!all) return [];
		return loadAndroidMeasurements(all, TABLE_WINDOW_DAYS, false, signal);
	});

	const alertData = resource(async (signal) => {
		if (!showAlerts) return null;
		return fetchAlertsForTest(test.test, device.platform, ALERT_WINDOW_DAYS, signal, {
			suite: test.suite,
			framework: test.framework
		}).catch(() => ({ alerts: [], summaries: new Map() }));
	});

	const markers = $derived(
		alertData.value
			? markersWithinDays(buildAlertMarkers(test.test, alertData.value), view.range)
			: []
	);

	const measurements = $derived(chartData.value ?? []);

	// --- Comparison table -------------------------------------------------

	// Rows are catalogue entries, not test names: two Android tests are both
	// called `applink_startup` and differ only by suite, and the unit and
	// direction vary per row.
	const naming: RowNaming = {
		label: (key) => testByKey(key).label,
		unit: (key) => (testByKey(key).unit ? ` ${testByKey(key).unit}` : ''),
		lowerIsBetter: (key) => testByKey(key).lowerIsBetter
	};

	const table = $derived(
		buildComparisonTable(tableData.value ?? [], testsWithData(tableData.value ?? []), {
			supportsSafari: false,
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
				url: pushlogUrl(view.repository, result.range.from, result.range.to),
				from: result.range.from,
				to: result.range.to
			};
		}

		if (test.hasVideo && point.jobId) apply({ job: String(point.jobId), replicate: '' });
	}

	const chartInputs = $derived({
		measurements,
		test: test.test,
		hidden: view.hide,
		replicates: view.replicates,
		markers,
		reference: selection,
		yLabel: axisLabel(test)
	});

	const chartConfig = $derived(buildChartData(chartInputs));
	const chartOptions = $derived(
		buildChartOptions(chartInputs, {
			onPointClick: clickPoint,
			onLegendClick: (label) => apply({ hide: toggleHidden(view.hide, label) }),
			tooltipFooter: () => (test.hasVideo ? 'Click to play this run’s recordings' : undefined)
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
					framework: test.framework
				});
			}
		}
		return seen.size > 0 ? perfherderGraphsUrl([...seen.values()]) : null;
	});

	// --- Replicate videos --------------------------------------------------

	const openJob = $derived(openJobId(view));

	// `repository` rather than `view.repository`: reading the state object here
	// would make this depend on the whole URL, so picking a different replicate
	// would re-download the job's 25MB archive.
	const videoData = resource(async (signal) => {
		const jobId = openJob;
		if (jobId === null || !test.hasVideo) return null;
		return loadReplicateVideos(repository, jobId, test, signal);
	});

	const videoError = $derived.by(() => {
		const error = videoData.error;
		if (!error) return null;
		return error instanceof NoVideoError
			? error.message
			: `Could not load the recordings for this job: ${String(error)}`;
	});

	const replicateIndex = $derived(openReplicateIndex(view, videoData.value?.videos.length ?? 0));

	// The revision of the clicked point, for the Treeherder job link.
	const openRevision = $derived(measurements.find((m) => m.jobId === openJob)?.revision ?? '');

	const title = $derived(`${test.label} — ${device.label}`);
	const loading = $derived(signatures.loading || chartData.loading);
</script>

<svelte:head><title>Android — {test.label} ({device.label})</title></svelte:head>

<div class="page">
	<nav class="devices" aria-label="Device" data-sveltekit-noscroll>
		{#each DEVICES as entry (entry.key)}
			<a
				href={href(withVideoClosed({ device: entry.key }))}
				class:active={view.device === entry.key}
				title={entry.description}
			>
				{entry.label}
			</a>
		{/each}
	</nav>
	<p class="device-note">{device.description}</p>

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
			onchange={(on) => apply(withVideoClosed({ repository: on ? 'autoland' : 'mozilla-central' }))}
		/>
		<ToggleChip
			label="Show replicates"
			checked={view.replicates}
			onchange={(on) => apply(withVideoClosed({ replicates: on }))}
		/>
		<ToggleChip
			label="Show alerts"
			checked={view.alerts}
			onchange={(on) => apply({ alerts: on })}
		/>
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
		<RangePicker selected={view.range} href={(range) => href(withVideoClosed({ range }))} />
	</div>

	<p class="pushlog">
		{#if pushlog}
			<a href={pushlog.url} target="_blank" rel="noreferrer">
				Pushlog: {pushlog.from.slice(0, 12)} &rarr; {pushlog.to.slice(0, 12)}
			</a>
		{:else if test.hasVideo}
			<span class="hint"
				>Click a point to play its replicate recordings; click two for a pushlog</span
			>
		{:else}
			<span class="hint">Select two points to generate a pushlog link</span>
		{/if}
	</p>

	{#if openJob !== null && test.hasVideo}
		<div class="video-slot">
			{#if videoData.loading}
				<Spinner message="Downloading the recordings for this job…" />
			{:else if videoError}
				<p class="error">{videoError}</p>
			{:else if videoData.value}
				<VideoPanel
					groups={[{ key: test.key, label: test.label, videos: videoData.value.videos }]}
					selectedGroup={test.key}
					selectedReplicate={replicateIndex}
					unit={test.unit}
					task={videoData.value.task}
					jobUrl={treeherderJobUrl(view.repository, openRevision, videoData.value.task)}
					onselectGroup={() => {}}
					onselectReplicate={(replicate) => apply({ replicate: String(replicate) })}
					onclose={() => apply({ job: '', replicate: '' })}
				/>
			{/if}
		</div>
	{/if}

	<h3>Breakdown: Android tests on {device.label}</h3>

	{#if tableData.error}
		<p class="error">Could not load the breakdown: {String(tableData.error)}</p>
	{:else if tableData.loading}
		<Spinner message="Loading breakdown…" />
	{:else}
		<ComparisonTable
			{table}
			selected={view.test}
			href={(key) => href(withVideoClosed({ test: key }))}
			sort={view.sort}
			dir={view.dir}
			sortHref={(sort, dir) => href({ sort, dir })}
		/>
	{/if}

	{#if !tableData.loading && table.rows.length < TESTS.length}
		<p class="note">
			Only tests with data on {device.label} in the last {TABLE_WINDOW_DAYS} days are listed.
		</p>
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

	.devices {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
		justify-content: center;
	}

	.devices a {
		padding: var(--space-3) var(--space-6);
		border-radius: var(--radius-sm);
		text-decoration: none;
		color: var(--ink-primary);
		font-family: sans-serif;
		border: 1px solid transparent;
	}

	.devices a:hover {
		background-color: var(--surface-control-hover);
	}

	.devices a.active {
		background-color: var(--surface-accent-soft);
		border-color: var(--accent);
		font-weight: bold;
	}

	.device-note {
		margin-top: var(--space-2);
		font-family: sans-serif;
		font-size: 13px;
		color: var(--ink-secondary);
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
		max-width: var(--content-max);
	}

	.error {
		font-family: sans-serif;
		color: var(--danger);
		padding: var(--space-5) 0;
	}
</style>
