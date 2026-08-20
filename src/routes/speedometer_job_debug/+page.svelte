<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { page } from '$app/state';
	import Chart from '$lib/components/Chart.svelte';
	import PlatformPicker from '$lib/components/PlatformPicker.svelte';
	import RangePicker from '$lib/components/RangePicker.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import ToggleChip from '$lib/components/ToggleChip.svelte';
	import MachineLegend from './MachineLegend.svelte';
	import { fetchTaskRef, taskclusterTaskUrl } from '$lib/api/treeherder';
	import { BROWSERS, classify } from '$lib/browsers';
	import { resource } from '$lib/resource.svelte';
	import { ALL_TESTS, displayName, lowerIsBetter, platformByKey } from '$lib/speedometer/config';
	import {
		chartSignatures,
		loadMeasurements,
		loadSignatures,
		TABLE_WINDOW_DAYS,
		tableSignatures
	} from '$lib/speedometer/data';
	import {
		buildMachineChartData,
		buildMachineChartOptions,
		type MachinePoint
	} from '$lib/speedometer/job-debug-chart';
	import { groupByMachine, paddedBounds } from '$lib/speedometer/machines';
	import { parseSpeedometerState, speedometerHref } from '$lib/speedometer/state';
	import { buildComparisonTable } from '$lib/speedometer/table';
	import ComparisonTable from '$lib/components/ComparisonTable.svelte';

	const view = $derived(parseSpeedometerState(page.url));
	const platform = $derived(platformByKey(view.os));

	const href = (patch: Parameters<typeof speedometerHref>[1]) => speedometerHref(page.url, patch);
	const apply = (patch: Parameters<typeof speedometerHref>[1]) =>
		goto(href(patch), { replaceState: true, noScroll: true, keepFocus: true });

	// One field at a time: `view` is a fresh object per URL change, so reading it
	// inside a resource makes that resource depend on the whole URL. See the
	// comment on the main Speedometer route.
	const os = $derived(view.os);
	const repository = $derived(view.repository);
	const subtest = $derived(view.subtest);
	const range = $derived(view.range);
	const replicates = $derived(view.replicates);

	const safariPlatform = $derived(platform.safariPlatform);
	const signatures = resource((signal) =>
		loadSignatures(os, repository, signal, { safariPlatform })
	);

	const chartData = resource(async (signal) => {
		const all = signatures.value;
		if (!all) return [];
		return loadMeasurements(chartSignatures(all, subtest), range, replicates, signal);
	});

	const tableData = resource(async (signal) => {
		const all = signatures.value;
		if (!all) return [];
		return loadMeasurements(tableSignatures(all), TABLE_WINDOW_DAYS, replicates, signal);
	});

	const measurements = $derived(chartData.value ?? []);

	// Browsers with data, for the dropdown.
	const availableBrowsers = $derived(
		BROWSERS.filter((browser) => measurements.some((m) => classify(m)?.key === browser.key))
	);

	// An explicit choice wins; otherwise fall back to the first browser that has
	// data. Deriving the fallback rather than writing it into state means the
	// URL stays free of a value the user did not pick.
	const activeBrowser = $derived(
		availableBrowsers.find((b) => b.key === view.browser) ?? availableBrowsers[0]
	);

	const browserMeasurements = $derived(
		activeBrowser ? measurements.filter((m) => classify(m)?.key === activeBrowser.key) : []
	);

	const groups = $derived(groupByMachine(browserMeasurements));

	// Pinned to the whole browser's extent, so isolating a machine does not
	// rescale the plot -- comparing machines is the point of this view.
	const bounds = $derived(paddedBounds(browserMeasurements));

	// Hover dims the other machines. Purely visual and per-pointer-position, so
	// it is local state rather than a URL parameter.
	let hovered = $state<string | null>(null);

	const chartInputs = $derived({
		groups,
		isolated: view.machine,
		hovered,
		bounds,
		test: view.subtest
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

	const table = $derived(
		buildComparisonTable(tableData.value ?? [], ALL_TESTS, {
			supportsSafari: platform.supportsSafari,
			safariPlatform
		})
	);

	const title = $derived(
		`${displayName(view.subtest)} — ${activeBrowser?.label ?? 'no data'} by machine ` +
			`(${lowerIsBetter(view.subtest) ? 'lower' : 'higher'} is better)`
	);

	const loading = $derived(signatures.loading || chartData.loading);

	const mainDashboardHref = $derived(
		speedometerHref(new URL(`${base}/speedometer/`, page.url), view)
	);
</script>

<svelte:head><title>Speedometer 3 Job Debug</title></svelte:head>

<div class="page">
	<div class="explainer">
		<strong>Job Debug View</strong> &mdash; Investigate which physical machines produced each data point.
		Select a platform and subtest, then choose a single browser. Points are coloured by machine name so
		you can spot machine-specific noise or outliers. Click any point to open its Taskcluster task. Hover
		a machine in the legend to highlight its points, or click it to show only that machine.
	</div>

	<PlatformPicker selected={view.os} href={(os) => href({ os })} />

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
		{#if loading}
			<Spinner overlay message="Loading chart data…" />
		{/if}
		<div class="chart-frame" class:dimmed={loading}>
			<Chart type="scatter" data={chartConfig} options={chartOptions} ariaLabel={title} />
		</div>
		<RangePicker selected={view.range} href={(range) => href({ range })} />
	</div>

	<!--
		Below the chart, and below the range picker, on purpose.

		The legend is derived from the data, so its height is not fixed: a
		different range, browser or platform yields a different set of machines
		and the chips wrap onto a different number of rows. With the legend above
		the chart, every one of those changes moved the chart -- and the range
		picker, and the table -- by a row or two, which reads as the page having
		scrolled under you. Nothing above it moves now, and putting it after the
		range picker rather than before means changing range cannot shift the
		range buttons out from under the cursor that just clicked one.
	-->
	<MachineLegend
		{groups}
		isolated={view.machine}
		href={(machine) => href({ machine })}
		onhover={(machine) => (hovered = machine)}
	/>

	{#if taskError}
		<p class="error">{taskError}</p>
	{/if}

	<h3>Breakdown: Speedometer 3 Subtests</h3>
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

	.error {
		font-family: sans-serif;
		color: var(--danger);
		font-size: 13px;
	}
</style>
