<script lang="ts">
	import type { ChartData, ChartOptions } from 'chart.js';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Chart from '#lib/components/Chart.svelte';
	import RangePicker from '#lib/components/RangePicker.svelte';
	import Spinner from '#lib/components/Spinner.svelte';
	import { browserByKey } from '#lib/browsers.js';
	import { resource } from '#lib/resource.svelte.js';
	import {
		a11yRows,
		beyondNoise,
		formatChange,
		NOISE_THRESHOLD,
		sharedExtent
	} from '#lib/navbench/a11y.js';
	import { displayName, NAVBENCH_PLATFORMS, OVERALL_TEST } from '#lib/navbench/config.js';
	import { loadNavBenchMeasurements, loadNavBenchSignatures, testsIn } from '#lib/navbench/data.js';
	import { navBenchA11yHref, parseNavBenchA11yState } from '#lib/navbench/state.js';
	import DifferenceChart from './DifferenceChart.svelte';
	import SiteDifferencePlot from './SiteDifferencePlot.svelte';

	const view = $derived(parseNavBenchA11yState(page.url));
	const href = (patch: Parameters<typeof navBenchA11yHref>[1]) => navBenchA11yHref(page.url, patch);

	// One field at a time, as on the main NavBench page: reading `view` inside a
	// resource would make it refetch on every URL change.
	const os = $derived(view.os);
	const range = $derived(view.range);

	// Nightly-as-Release is left out before fetching: it has no accessibility
	// counterpart, so its series would cost requests and pair with nothing.
	const signatures = resource(async (signal) =>
		(await loadNavBenchSignatures(os, signal)).filter(
			(sig) => !sig.machine_platform.includes('nightlyasrelease')
		)
	);

	const tests = $derived(testsIn(signatures.value ?? []));

	// Every view on this page covers the same pushes, so one fetch serves all.
	const data = resource(async (signal) => {
		const all = signatures.value;
		if (!all) return [];
		return loadNavBenchMeasurements(all, range, signal);
	});

	const rows = $derived(a11yRows(data.value ?? [], tests));
	const sites = $derived(rows.filter((row) => row.test !== OVERALL_TEST));
	const extent = $derived(sharedExtent(rows));
	const selected = $derived(rows.find((row) => row.test === view.test) ?? rows[0]);

	const loading = $derived(signatures.loading || data.loading);
	const label = $derived(displayName(selected?.test ?? view.test));
	const testHref = (test: string) => href({ test });

	const OFF_COLOR = browserByKey('firefox')!.color;
	const ON_COLOR = browserByKey('firefox-a11y')!.color;

	const date = (x: number) =>
		new Date(x).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

	// The two scores behind the selected test's differences, on the same pushes.
	const scoresData = $derived({
		datasets: [
			{ label: 'Accessibility off', color: OFF_COLOR, value: 'off' as const },
			{ label: 'Accessibility on', color: ON_COLOR, value: 'on' as const }
		].map(({ label, color, value }) => ({
			label,
			data: (selected?.pairs ?? []).map((pair) => ({ x: pair.date.getTime(), y: pair[value] })),
			showLine: true,
			borderColor: color,
			backgroundColor: color,
			pointRadius: 3
		}))
	} as unknown as ChartData);

	const scoresOptions = {
		responsive: true,
		maintainAspectRatio: false,
		plugins: {
			legend: { display: true, position: 'top' },
			tooltip: {
				callbacks: {
					title: (items: Array<{ raw: { x: number } }>) => (items[0] ? date(items[0].raw.x) : ''),
					label: (item: { raw: { y: number }; dataset: { label?: string } }) =>
						`${item.dataset.label}: ${item.raw.y.toFixed(2)}`
				}
			}
		},
		scales: {
			x: { type: 'time', time: { unit: 'day' }, title: { display: true, text: 'Push date' } },
			y: { beginAtZero: true, title: { display: true, text: 'Score (higher is better)' } }
		}
	} as unknown as ChartOptions<'scatter'>;

	const mainPageHref = $derived(`${resolve('/navbench')}?os=${os}`);
</script>

<svelte:head><title>Navigation Benchmark — Accessibility — {label}</title></svelte:head>

<div class="page">
	<div class="explainer">
		<strong>Navigation Benchmark with accessibility on and off.</strong> With accessibility (a11y)
		on, Firefox builds and keeps up to date the accessibility tree that screen readers and other
		assistive technologies use to present each page. The
		<a href={mainPageHref}>Navigation Benchmark</a> runs both ways on the same autoland pushes, and
		this page compares them push by push, which keeps the benchmark's own variation between pushes
		out of the comparison.
		<p>
			<strong>Change in display time</strong> is how much longer, or shorter, a page takes to
			display with accessibility on: the relative change in SpeedIndex, from the scores as
			<code>off / on − 1</code>. The benchmark varies by a few percent between pushes on its own, so
			differences under {formatChange(NOISE_THRESHOLD).slice(1)} are shown muted.
		</p>
		<p class="links">
			<a
				href="https://bugzilla.mozilla.org/show_bug.cgi?id=2093693"
				target="_blank"
				rel="noreferrer">Bug 2093693</a
			>
			<a
				href="https://firefox-source-docs.mozilla.org/testing/perfdocs/raptor.html#nav-bench-a11y"
				target="_blank"
				rel="noreferrer">Documentation</a
			>
		</p>
	</div>

	<nav class="platforms" aria-label="Platform" data-sveltekit-reset="false">
		{#each NAVBENCH_PLATFORMS as entry (entry.key)}
			<a href={href({ os: entry.key })} class:active={view.os === entry.key}>
				{entry.label}
			</a>
		{/each}
	</nav>

	<RangePicker selected={view.range} href={(days) => href({ range: days })} />
	<p class="source">Data source: <strong>autoland</strong>, shippable builds</p>

	{#if signatures.error || data.error}
		<p class="error">Could not load data: {String(signatures.error ?? data.error)}</p>
	{:else if loading}
		<Spinner message="Loading…" />
	{:else if rows.length === 0}
		<p class="note">
			No pushes on this platform ran with accessibility both on and off in this range.
		</p>
	{:else}
		<section>
			<h3>Change in display time with accessibility on, by site</h3>
			<SiteDifferencePlot {rows} {extent} selected={selected.test} href={testHref} />
		</section>

		<section>
			<h3>{label}, push by push</h3>
			<div class="chart-frame">
				<DifferenceChart
					pairs={selected.pairs}
					ariaLabel="{label}: change in display time with accessibility on, per push"
				/>
			</div>
			<h4>Scores on the same pushes</h4>
			<div class="chart-frame small">
				<Chart
					type="scatter"
					data={scoresData}
					options={scoresOptions}
					ariaLabel="{label}: score with accessibility off and on, per push"
				/>
			</div>
		</section>

		{#if sites.length > 0}
			<section>
				<h3>Every site, push by push</h3>
				<p class="note">On one shared scale, so the sites compare at a glance.</p>
				<div class="grid">
					{#each sites as site (site.test)}
						<div class="cell" class:selected={site.test === selected.test}>
							<h5>
								<a href={testHref(site.test)} data-sveltekit-reset="false"
									>{displayName(site.test)}</a
								>
								<span class:notable={beyondNoise(site.change)}>{formatChange(site.change)}</span>
							</h5>
							<div class="chart-frame tiny">
								<DifferenceChart
									pairs={site.pairs}
									{extent}
									compact
									ariaLabel="{displayName(
										site.test
									)}: change in display time with accessibility on, per push"
								/>
							</div>
						</div>
					{/each}
				</div>
			</section>
		{/if}

		<section>
			<h3>By test</h3>
			<table>
				<thead>
					<tr>
						<th class="name">Test</th>
						<th>Score, a11y off</th>
						<th>Score, a11y on</th>
						<th>Change in display time</th>
						<th>Per-push range</th>
						<th>Pushes</th>
					</tr>
				</thead>
				<tbody>
					{#each rows as row (row.test)}
						<tr class:selected={row.test === selected.test}>
							<td class="name">
								<a href={testHref(row.test)} data-sveltekit-reset="false">
									{displayName(row.test)}
								</a>
							</td>
							<td>{row.off.toFixed(2)}</td>
							<td>{row.on.toFixed(2)}</td>
							<td class="change" class:notable={beyondNoise(row.change)}
								>{formatChange(row.change)}</td
							>
							<td class="range">{formatChange(row.min)} to {formatChange(row.max)}</td>
							<td>{row.pushes}</td>
						</tr>
					{/each}
				</tbody>
			</table>
			<p class="note">
				Scores are means over the paired pushes; higher is better. Click a point on any chart to
				open that push's accessibility-enabled job in Treeherder.
			</p>
		</section>
	{/if}
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 100%;
	}

	section {
		width: 100%;
		max-width: var(--content-max);
		margin-top: var(--space-7);
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	h3,
	h4,
	h5 {
		font-family: sans-serif;
		text-align: center;
	}

	h3 {
		margin: 0 0 var(--space-4);
	}

	h4 {
		margin: var(--space-5) 0 var(--space-2);
		font-size: 0.95rem;
	}

	h5 {
		margin: 0 0 var(--space-1);
		font-size: 13px;
		display: flex;
		justify-content: space-between;
		gap: var(--space-2);
	}

	h5 a {
		color: inherit;
	}

	h5 span {
		font-weight: normal;
		color: var(--ink-secondary);
		font-variant-numeric: tabular-nums;
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

	.explainer p {
		margin: var(--space-2) 0 0;
	}

	.links {
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

	.source {
		margin: var(--space-2) 0 0;
		font-family: sans-serif;
		font-size: 13px;
		color: var(--ink-secondary);
	}

	.chart-frame {
		width: 100%;
		height: var(--chart-height);
		position: relative;
	}

	.chart-frame.small {
		height: var(--chart-height-sm);
	}

	.chart-frame.tiny {
		height: 150px;
	}

	.grid {
		width: 100%;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: var(--space-4);
	}

	.cell {
		background: var(--surface-card);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		padding: var(--space-2) var(--space-3);
	}

	.cell.selected {
		border-color: var(--accent);
	}

	table {
		border-collapse: collapse;
		font-family: sans-serif;
		font-size: 14px;
		background: var(--surface-card);
		max-width: 100%;
		display: block;
		overflow-x: auto;
	}

	th {
		background: var(--accent);
		color: var(--ink-inverse);
		padding: var(--space-3) var(--space-4);
		text-align: right;
	}

	td {
		padding: var(--space-2) var(--space-4);
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	th.name,
	td.name {
		text-align: left;
	}

	tbody tr:nth-child(odd) {
		background: var(--surface-row-odd);
	}

	tbody tr:nth-child(even) {
		background: var(--surface-row-even);
	}

	tbody tr:hover {
		background: var(--surface-row-hover);
	}

	tr.selected {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}

	td.name a {
		color: inherit;
	}

	.change,
	.range {
		color: var(--ink-secondary);
	}

	.notable,
	h5 span.notable {
		color: var(--ink-primary);
		font-weight: bold;
	}

	.note {
		max-width: var(--content-max);
		margin: 0 0 var(--space-3);
		font-family: sans-serif;
		font-size: 13px;
		color: var(--ink-muted);
		text-align: center;
	}

	.error {
		font-family: sans-serif;
		color: var(--danger);
		padding: var(--space-5) 0;
	}
</style>
