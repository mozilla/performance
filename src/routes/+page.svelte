<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import PieChart from '$lib/components/PieChart.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import { resource } from '$lib/resource.svelte';
	import { fetchBugzillaData } from '$lib/bugs/api';
	import * as links from '$lib/bugs/links';
	import {
		allRatedBugs,
		byComponent,
		byOperatingSystem,
		byPerfKeyword,
		daysSinceUpdate,
		filterBySummary,
		impactCounts,
		isoDate,
		triageCounts,
		type Slice
	} from '$lib/bugs/stats';
	import { nextSort, sortRows, type ColumnType, type SortState } from '$lib/sort';
	import { parseState, patchUrl, str } from '$lib/url-state';

	const schema = {
		q: str(''),
		sort: str('created'),
		dir: str('desc', ['asc', 'desc'] as const)
	};

	const view = $derived(parseState(schema, page.url));
	const href = (patch: Partial<typeof view>) => patchUrl(schema, page.url, patch);
	const apply = (patch: Partial<typeof view>) =>
		goto(href(patch), { replaceState: true, noScroll: true, keepFocus: true });

	const bugs = resource((signal) => fetchBugzillaData(signal));

	const rated = $derived(bugs.value ? allRatedBugs(bugs.value) : []);
	const impact = $derived(bugs.value ? impactCounts(bugs.value) : null);
	const triage = $derived(bugs.value ? triageCounts(bugs.value) : null);

	const osSlices = $derived(byOperatingSystem(rated));
	const componentSlices = $derived(byComponent(rated));
	const keywordSlices = $derived(byPerfKeyword(rated));
	const highImpactSlices = $derived(byComponent(bugs.value?.high.bugs ?? []));

	const impactSlices = $derived<Slice[]>(
		impact
			? [
					{ key: 'high', label: `High (${impact.high})`, count: impact.high, percentage: 0 },
					{
						key: 'medium',
						label: `Medium (${impact.medium})`,
						count: impact.medium,
						percentage: 0
					},
					{ key: 'low', label: `Low (${impact.low})`, count: impact.low, percentage: 0 },
					{
						key: 'untriaged',
						label: `Untriaged (${impact.untriaged})`,
						count: impact.untriaged,
						percentage: 0
					},
					{
						key: 'needinfo',
						label: `Pending Needinfo (${impact.needinfo})`,
						count: impact.needinfo,
						percentage: 0
					}
				]
			: []
	);

	const IMPACT_COLORS = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#4D5360'];

	function impactLink(slice: Slice): string {
		if (slice.key === 'untriaged') return links.UNTRIAGED_QUERY;
		if (slice.key === 'needinfo') return links.byImpact('pending-needinfo');
		return links.byImpact(slice.key as 'high' | 'medium' | 'low');
	}

	// --- Regression table ---------------------------------------------------

	const regressions = $derived(bugs.value?.regressions.bugs ?? []);
	const filtered = $derived(filterBySummary(regressions, view.q));

	interface Column {
		key: string;
		label: string;
		type: ColumnType;
		value(bug: (typeof regressions)[number]): unknown;
	}

	const COLUMNS: Column[] = [
		{ key: 'id', label: 'ID', type: 'number', value: (bug) => bug.id },
		{ key: 'severity', label: 'Severity', type: 'text', value: (bug) => bug.severity },
		{ key: 'priority', label: 'Priority', type: 'text', value: (bug) => bug.priority },
		{ key: 'component', label: 'Component', type: 'text', value: (bug) => bug.component },
		{ key: 'summary', label: 'Summary', type: 'text', value: (bug) => bug.summary },
		{ key: 'created', label: 'Creation Date', type: 'date', value: (bug) => bug.creation_time },
		{
			key: 'updated',
			label: 'Last Update (days)',
			type: 'number',
			value: (bug) => daysSinceUpdate(bug)
		}
	];

	const sortState = $derived<SortState>({
		column: view.sort,
		direction: view.dir as 'asc' | 'desc'
	});

	const activeColumn = $derived(COLUMNS.find((c) => c.key === view.sort) ?? COLUMNS[5]);

	const sorted = $derived(
		sortRows(filtered, activeColumn.value, activeColumn.type, sortState.direction)
	);

	function sortHref(column: Column): string {
		const next = nextSort(sortState, column.key, column.type);
		return href({ sort: next.column, dir: next.direction });
	}
</script>

<svelte:head><title>Performance Bugs</title></svelte:head>

<div class="page">
	{#if bugs.error}
		<p class="error">Could not load Bugzilla data: {String(bugs.error)}</p>
	{:else if bugs.loading}
		<Spinner message="Loading Bugzilla data…" />
	{:else}
		<section class="row">
			<h2>Untriaged Bugs</h2>
			<div class="metrics">
				{#each [['General', triage?.general, 'Performance: General', 'General Performance Triage'], ['Memory', triage?.memory, 'Performance: Memory', 'Memory Performance Triage'], ['Navigation', triage?.navigation, 'Performance: Navigation', undefined], ['Responsiveness', triage?.responsiveness, 'Performance: Responsiveness', 'Responsiveness Performance Triage'], ['Startup', triage?.startup, 'Performance: Startup', 'Startup Performance Triage']] as [label, count, component, queryName] (label)}
					<a
						class="metric"
						href={links.triageQueue(component as string, queryName as string | undefined)}
						target="_blank"
						rel="noreferrer"
					>
						<span class="metric-title">{label}</span>
						<span class="metric-number">{count ?? 0}</span>
					</a>
				{/each}
			</div>
		</section>

		<section class="row">
			<h2>Open Perf-Alert Regressions</h2>

			<div class="search">
				<input
					type="search"
					placeholder="Search by summary (comma-separated terms)"
					value={view.q}
					oninput={(event) => apply({ q: event.currentTarget.value })}
					aria-label="Search regressions by summary"
				/>
			</div>

			<p class="count">Results found: {sorted.length}</p>

			<div class="table-scroll">
				<table data-sveltekit-noscroll>
					<thead>
						<tr>
							{#each COLUMNS as column (column.key)}
								<th
									scope="col"
									aria-sort={view.sort === column.key
										? view.dir === 'asc'
											? 'ascending'
											: 'descending'
										: 'none'}
								>
									<a href={sortHref(column)}>
										{column.label}
										{#if view.sort === column.key}
											<span aria-hidden="true">{view.dir === 'asc' ? '▲' : '▼'}</span>
										{/if}
									</a>
								</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each sorted as bug (bug.id)}
							<tr>
								<td class="nowrap">
									<a href={links.bugUrl(bug.id)} target="_blank" rel="noreferrer">{bug.id}</a>
								</td>
								<td>{bug.severity}</td>
								<td>{bug.priority}</td>
								<td>{bug.component}</td>
								<td class="summary">{bug.summary}</td>
								<td class="nowrap">{isoDate(bug.creation_time)}</td>
								<td class="nowrap">{daysSinceUpdate(bug)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>

		<section class="row charts">
			<div class="chart-card">
				<h2>Performance Impact Distribution</h2>
				<PieChart
					slices={impactSlices}
					linkFor={impactLink}
					colors={IMPACT_COLORS}
					title="Bugs by performance impact"
				/>
			</div>
			<div class="chart-card">
				<h2>High Impact Distribution</h2>
				<PieChart
					slices={highImpactSlices}
					linkFor={(slice) => links.highImpactByComponent(slice.key)}
					fontSize={12}
					title="High impact bugs by component"
				/>
			</div>
		</section>

		<section class="row charts">
			<div class="chart-card">
				<h2>OS Distribution</h2>
				<PieChart
					slices={osSlices}
					linkFor={(slice) => links.ratedByOperatingSystem(slice.key)}
					title="Bugs by operating system"
				/>
			</div>
			<div class="chart-card">
				<h2>Performance Type Distribution</h2>
				<PieChart
					slices={keywordSlices}
					linkFor={(slice) => links.byPerfKeyword(slice.key)}
					title="Bugs by perf keyword"
				/>
			</div>
		</section>

		<section class="row">
			<h2>Component Distribution</h2>
			<div class="table-scroll">
				<table>
					<thead>
						<tr>
							<th scope="col">Component</th>
							<th scope="col">Number of Bugs</th>
							<th scope="col">Percentage of Bugs</th>
						</tr>
					</thead>
					<tbody>
						{#each componentSlices as slice (slice.key)}
							<tr>
								<td>
									<a href={links.ratedByComponent(slice.key)} target="_blank" rel="noreferrer">
										{slice.key}
									</a>
								</td>
								<td>{slice.count}</td>
								<td>{slice.percentage}%</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	{/if}
</div>

<style>
	.page {
		width: 100%;
		max-width: 1200px;
	}

	.row {
		margin-bottom: var(--space-7);
	}

	h2 {
		font-size: 20px;
		margin-bottom: var(--space-3);
		border-bottom: 3px double var(--ink-primary);
		padding-bottom: var(--space-1);
		text-align: center;
	}

	.metrics {
		display: flex;
		gap: var(--space-5);
	}

	.metric {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		background-color: var(--surface-control-hover);
		border-radius: var(--radius-lg);
		padding: var(--space-5);
		flex: 1;
		text-decoration: none;
		color: inherit;
	}

	.metric:hover {
		background-color: var(--surface-control-hover);
	}

	.metric-title {
		font-size: 20px;
		margin-bottom: var(--space-3);
	}

	.metric-number {
		font-size: 50px;
	}

	.search {
		display: flex;
		justify-content: center;
		margin-bottom: var(--space-3);
	}

	.search input {
		width: 50%;
		padding: var(--space-3);
		border-radius: var(--radius-sm);
		border: 1px solid var(--border-default);
	}

	.count {
		font-size: 14px;
		margin-bottom: var(--space-2);
	}

	.table-scroll {
		max-height: 500px;
		overflow-y: auto;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		background: var(--surface-card);
	}

	table {
		width: 100%;
		border-collapse: collapse;
	}

	th,
	td {
		padding: var(--space-3);
		text-align: left;
		border-bottom: 1px solid var(--border-subtle);
		font-size: 14px;
	}

	/* Only the summary wraps; without this the numeric id column broke mid-number. */
	td.summary {
		overflow-wrap: anywhere;
		min-width: 24em;
	}

	td.nowrap {
		white-space: nowrap;
	}

	th {
		background-color: var(--surface-control);
		position: sticky;
		top: 0;
		padding: 0;
	}

	th a {
		display: block;
		padding: var(--space-3);
		color: inherit;
		text-decoration: none;
		white-space: nowrap;
	}

	th a:hover {
		background: var(--surface-control-hover);
	}

	tbody tr:hover {
		background-color: var(--surface-control);
	}

	.charts {
		display: flex;
		gap: var(--space-5);
		align-items: flex-start;
	}

	.chart-card {
		flex: 1;
		min-width: 0;
	}

	.error {
		color: var(--danger);
		padding: var(--space-8) 0;
	}
</style>
