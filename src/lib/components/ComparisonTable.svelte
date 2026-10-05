<script lang="ts">
	import { nextSort, type SortDirection } from '$lib/sort';
	import {
		type ComparisonTable,
		comparisonColumnType,
		diffColumnKey,
		sortComparisonRows,
		TEST_COLUMN,
		valueColumnKey
	} from '$lib/speedometer/table';

	interface Props {
		table: ComparisonTable;
		selected: string;
		href(test: string): string;
		/** Active sort column key, or '' for the table's configured order. */
		sort: string;
		dir: SortDirection;
		/** Link that applies the sort a click on `column` would produce. */
		sortHref(column: string, direction: SortDirection): string;
	}

	let { table, selected, href, sort, dir, sortHref }: Props = $props();

	const rows = $derived(sortComparisonRows(table.rows, sort, dir));

	/** Where clicking this header goes: same column flips, a new one starts fresh. */
	function nextHref(column: string): string {
		const next = nextSort({ column: sort, direction: dir }, column, comparisonColumnType(column));
		return sortHref(next.column, next.direction);
	}

	const ariaSort = (column: string): 'ascending' | 'descending' | 'none' => {
		if (sort !== column) return 'none';
		return dir === 'asc' ? 'ascending' : 'descending';
	};
</script>

<table class="styled-table">
	<!-- Sorting reorders the rows in place, so keep the scroll position. Row
	     links still scroll to the top, where the selected test's chart is. -->
	<thead data-sveltekit-noscroll>
		<tr>
			<th rowspan="2" class="name-header" aria-sort={ariaSort(TEST_COLUMN)}>
				<a href={nextHref(TEST_COLUMN)} class:sorted={sort === TEST_COLUMN}>
					Test Name<span class="arrow" aria-hidden="true"
						>{sort === TEST_COLUMN ? (dir === 'asc' ? '▲' : '▼') : ''}</span
					>
				</a>
			</th>
			<th colspan={table.valueColumns.length} scope="colgroup">Value<br />7 day average</th>
			<!-- Firefox-only pages have nothing to compare against, and a group
			     header spanning zero columns renders as a stray empty cell. -->
			{#if table.diffColumns.length > 0}
				<th colspan={table.diffColumns.length} scope="colgroup">Difference vs Firefox</th>
			{/if}
		</tr>
		<tr class="browser-row">
			{#each table.valueColumns as column (column.key)}
				{@const key = valueColumnKey(column.key)}
				<th scope="col" aria-sort={ariaSort(key)}>
					<a href={nextHref(key)} class:sorted={sort === key}>
						{column.browser.label}<span class="arrow" aria-hidden="true"
							>{sort === key ? (dir === 'asc' ? '▲' : '▼') : ''}</span
						>
					</a>
				</th>
			{/each}
			{#each table.diffColumns as column (`diff-${column.key}`)}
				{@const key = diffColumnKey(column.key)}
				<th scope="col" aria-sort={ariaSort(key)}>
					<a href={nextHref(key)} class:sorted={sort === key}>
						{column.browser.label}<span class="arrow" aria-hidden="true"
							>{sort === key ? (dir === 'asc' ? '▲' : '▼') : ''}</span
						>
					</a>
				</th>
			{/each}
		</tr>
	</thead>
	<tbody>
		{#each rows as row (row.test)}
			<tr class:selected={row.test === selected}>
				<th scope="row" class="test-name">
					<a href={href(row.test)}>{row.label}</a>
				</th>
				{#each table.valueColumns as column (column.key)}
					<td>{row.values[column.key].formatted}</td>
				{/each}
				{#each table.diffColumns as column (`diff-${column.key}`)}
					<td style:color={row.diffs[column.key].color}>{row.diffs[column.key].formatted}</td>
				{/each}
			</tr>
		{/each}
	</tbody>
</table>

{#if table.rows.length === 0}
	<p class="empty">No data for this platform.</p>
{/if}

<style>
	.styled-table {
		border-collapse: collapse;
		margin: var(--space-6) 0;
		font-size: 0.9em;
		font-family: sans-serif;
		min-width: 400px;
		max-width: 1200px;
		box-shadow: 0 0 20px rgba(0, 0, 0, 0.15);
		background: var(--surface-card);
	}

	thead th {
		background-color: var(--accent);
		color: var(--ink-inverse);
		text-align: center;
		padding: var(--space-3) var(--space-5);
	}

	thead th:has(a) {
		padding: 0;
	}

	thead th a {
		display: block;
		padding: var(--space-3) var(--space-5);
		color: inherit;
		text-decoration: none;
		white-space: nowrap;
	}

	/* The browser-name row is the table's widest part, so it gets tighter padding. */
	.browser-row a {
		padding: 5px;
	}

	thead th a:hover {
		text-decoration: underline;
	}

	.name-header {
		text-align: left;
	}

	/* Reserves the arrow's width at all times so the header does not resize when
	   the sort moves to it, which would shift the columns under the pointer --
	   the same reasoning as the machine chips in MachineLegend. */
	.arrow {
		display: inline-block;
		width: 1em;
		text-align: left;
		font-size: 0.75em;
	}

	td {
		text-align: right;
		padding: var(--space-3) var(--space-2);
		white-space: nowrap;
	}

	tbody tr {
		border-bottom: 1px solid var(--border-subtle);
	}

	tbody tr:nth-of-type(odd) {
		background-color: var(--surface-row-odd);
	}

	tbody tr:nth-of-type(even) {
		background-color: var(--surface-row-even);
	}

	tbody tr:hover {
		background-color: var(--surface-row-hover);
	}

	tbody tr.selected {
		background-color: var(--surface-accent-soft);
		box-shadow: inset 3px 0 0 var(--accent);
	}

	.test-name {
		text-align: left;
		padding: 0;
		font-weight: normal;
	}

	.test-name a {
		display: block;
		padding: var(--space-3) var(--space-5);
		color: inherit;
		text-decoration: none;
	}

	.test-name a:hover {
		text-decoration: underline;
	}

	.empty {
		font-family: sans-serif;
		color: var(--ink-muted);
	}
</style>
