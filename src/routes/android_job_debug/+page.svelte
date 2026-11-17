<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Chart from '#lib/components/Chart.svelte';
	import ComparisonTable from '#lib/components/ComparisonTable.svelte';
	import MachineLegend from '#lib/components/MachineLegend.svelte';
	import RangePicker from '#lib/components/RangePicker.svelte';
	import Spinner from '#lib/components/Spinner.svelte';
	import ToggleChip from '#lib/components/ToggleChip.svelte';
	import { fetchTaskRef, taskclusterTaskUrl } from '#lib/api/treeherder.js';
	import { BROWSERS, classify } from '#lib/browsers.js';
	import { resource } from '#lib/resource.svelte.js';
	import { axisLabel, deviceByKey, DEVICES, testByKey, TESTS } from '#lib/android/config.js';
	import {
		loadAndroidMeasurements,
		loadAndroidSignatures,
		rowKeyFor,
		signaturesForTest,
		TABLE_WINDOW_DAYS,
		testsWithData
	} from '#lib/android/data.js';
	import { androidHref, type AndroidState, parseAndroidState } from '#lib/android/state.js';
	import {
		buildMachineChartData,
		buildMachineChartOptions,
		type MachinePoint
	} from '#lib/speedometer/job-debug-chart.js';
	import { groupByMachine, paddedBounds } from '#lib/speedometer/machines.js';
	import { buildComparisonTable, type RowNaming } from '#lib/speedometer/table.js';

	const view = $derived(parseAndroidState(page.url));
	const device = $derived(deviceByKey(view.device));
	const test = $derived(testByKey(view.test));

	const href = (patch: Partial<AndroidState>) => androidHref(page.url, patch);
	const apply = (patch: Partial<AndroidState>) =>
		goto(href(patch), { replace: true, reset: false });

	// One field at a time: `view` is a fresh object per URL change, so reading it
	// inside a resource makes that resource depend on the whole URL. See the
	// comment on the Speedometer route.
	const deviceKey = $derived(view.device);
	const repository = $derived(view.repository);
	const range = $derived(view.range);
	const replicates = $derived(view.replicates);

	const signatures = resource((signal) => loadAndroidSignatures(deviceKey, repository, signal));

	const chartData = resource(async (signal) => {
		const all = signatures.value;
		if (!all) return [];
		return loadAndroidMeasurements(signaturesForTest(all, test), range, replicates, signal);
	});

	const tableData = resource(async (signal) => {
		const all = signatures.value;
		if (!all) return [];
		return loadAndroidMeasurements(all, TABLE_WINDOW_DAYS, false, signal);
	});

	const measurements = $derived(chartData.value ?? []);

	// Browsers with data, for the dropdown.
	const availableBrowsers = $derived(
		BROWSERS.filter((browser) => measurements.some((m) => classify(m)?.key === browser.key))
	);

	// An explicit choice wins; otherwise fall back to the first browser that has
	// data, without writing the fallback into the URL.
	const activeBrowser = $derived(
		availableBrowsers.find((b) => b.key === view.browser) ?? availableBrowsers[0]
	);

	const browserMeasurements = $derived(
		activeBrowser ? measurements.filter((m) => classify(m)?.key === activeBrowser.key) : []
	);

	const groups = $derived(groupByMachine(browserMeasurements));

	// Pinned to the whole browser's extent, so isolating a machine does not
	// rescale the plot.
	const bounds = $derived(paddedBounds(browserMeasurements));

	// Hover dims the other machines; local state rather than a URL parameter.
	let hovered = $state<string | null>(null);

	const chartInputs = $derived({
		groups,
		isolated: view.machine,
		hovered,
		bounds,
		yLabel: axisLabel(test)
	});

	const chartConfig = $derived(buildMachineChartData(chartInputs));
	const chartOptions = $derived(
		buildMachineChartOptions(chartInputs, {
			onPointClick: openTask,
			onHoverMachine: (machine) => (hovered = machine)
		})
	);

	// The performance summary does not carry the Taskcluster task id, so it is
	// resolved for the single job the user clicked rather than for every point.
	let taskError = $state<string | null>(null);

	async function openTask(point: MachinePoint) {
		if (!point.jobId) return;
		taskError = null;
		try {
			const task = await fetchTaskRef(point.repository, point.jobId);
			if (task) window.open(taskclusterTaskUrl(task.taskId), '_blank', 'noopener');
			else taskError = `No Taskcluster task recorded for job ${point.jobId}.`;
		} catch {
			taskError = `Could not look up job ${point.jobId}.`;
		}
	}

	// Rows are catalogue entries, not test names; see the Android route.
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

	const title = $derived(
		`${test.label} — ${activeBrowser?.label ?? 'no data'} by machine on ${device.label} ` +
			`(${test.lowerIsBetter ? 'lower' : 'higher'} is better)`
	);

	const loading = $derived(signatures.loading || chartData.loading);

	const mainDashboardHref = $derived(
		androidHref(new URL(resolve('/android'), page.url.href), {
			device: view.device,
			test: view.test,
			range: view.range,
			repository: view.repository,
			replicates: view.replicates
		})
	);
</script>

<svelte:head><title>Android Job Debug</title></svelte:head>

<div class="page">
	<div class="explainer">
		<strong>Job Debug View</strong> &mdash; Investigate which physical devices produced each data point.
		Select a device and test, then choose a single browser. Points are coloured by machine name so you
		can spot machine-specific noise or outliers. Click any point to open its Taskcluster task, or shift-click
		to open it in Treeherder. Hover a machine in the legend to highlight its points, or click it to show
		only that machine.
	</div>

	<nav class="devices" aria-label="Device" data-sveltekit-reset="false">
		{#each DEVICES as entry (entry.key)}
			<a
				href={href({ device: entry.key, machine: '' })}
				class:active={view.device === entry.key}
				title={entry.description}
			>
				{entry.label}
			</a>
		{/each}
	</nav>

	<h3 class="chart-title">{title}</h3>

	<div class="controls">
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
		<div class="chip">
			<label>
				<span>Browser:</span>
				<select
					value={activeBrowser?.key ?? ''}
					onchange={(event) => apply({ browser: event.currentTarget.value, machine: '' })}
					disabled={availableBrowsers.length === 0}
				>
					{#each availableBrowsers as browser (browser.key)}
						<option value={browser.key}>{browser.label}</option>
					{/each}
				</select>
			</label>
		</div>
		<a class="chip link" href={mainDashboardHref}>&larr; Main dashboard</a>
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

	<!-- Below the chart and range picker, so the legend's data-dependent height
	     cannot move them; see the Speedometer Job Debug route. -->
	<MachineLegend
		{groups}
		isolated={view.machine}
		href={(machine) => href({ machine })}
		onhover={(machine) => (hovered = machine)}
	/>

	{#if taskError}
		<p class="error">{taskError}</p>
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
			href={(key) => href({ test: key, machine: '' })}
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

	.chart-title {
		margin: var(--space-5) 0;
	}

	.controls {
		display: flex;
		gap: var(--space-2);
		align-items: center;
		flex-wrap: wrap;
		width: 100%;
		max-width: var(--content-max);
	}

	.chip {
		background: var(--surface-control);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-sm);
		border: 1px solid var(--border-default);
		font-family: sans-serif;
		font-size: 13px;
	}

	.chip label {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.chip.link {
		margin-left: auto;
		text-decoration: none;
		color: var(--ink-primary);
	}

	.chip.link:hover {
		background: var(--surface-control-hover);
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

	.note {
		font-family: sans-serif;
		font-size: 13px;
		color: var(--ink-muted);
		max-width: var(--content-max);
	}

	.error {
		font-family: sans-serif;
		color: var(--danger);
		font-size: 13px;
		padding: var(--space-5) 0;
	}
</style>
