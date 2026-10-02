<script lang="ts">
	import '../app.css';
	import Sidebar from '$lib/components/Sidebar.svelte';

	let { children } = $props();
</script>

<div class="top">
	<a
		href="https://firefox-source-docs.mozilla.org/performance/reporting_a_performance_problem.html"
		class="btn report-btn"
		title="Report a Performance Bug"
	>
		<i class="fa-solid fa-bug"></i> Report Performance Issue
	</a>
	<div class="top-title">
		<b>moz://a</b> performance portal
	</div>
</div>

<div class="main-content">
	<aside class="main-sidebar">
		<Sidebar />
	</aside>
	<main class="content">
		{@render children()}
	</main>
</div>

<style>
	.top {
		height: 60px;
		width: 100%;
		border-bottom: 1px solid var(--border-default);
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		padding: 0 var(--space-4);
		flex-shrink: 0;
		background: var(--surface-page);
		position: sticky;
		top: 0;
		z-index: 200;
	}

	/* Both items are pinned to row 1. Without this the bar holds two rows: the
	   button comes first in source order and is placed in column 3, so
	   auto-placement has already passed column 2 by the time it reaches the
	   title, which lands in an implicit second row. `align-items: center` then
	   centres each item in its own row rather than in the bar, which put the
	   button against the top edge and pushed the title out of the bottom. */
	.top-title {
		grid-row: 1;
		grid-column: 2;
		font-size: 35px;
		font-family: 'Zilla Slab', serif;
		text-align: center;
		white-space: nowrap;
	}

	.report-btn {
		grid-row: 1;
		grid-column: 3;
		justify-self: end;
	}

	.main-content {
		display: flex;
		flex-grow: 1;
		align-items: stretch;
	}

	.main-sidebar {
		flex: 0 0 14rem;
		border-right: 1px solid var(--border-default);
	}

	.content {
		flex: 1;
		min-width: 0;
		padding: var(--space-5);
	}

	/*
	 * Two steps down rather than an icon rail. Collapsing to icons would drop
	 * the Job Debug submenu (reachable from nowhere else) and reduce the link
	 * text to a tooltip, so the labels stay and the column just gets tighter,
	 * then moves above the content.
	 */
	@media (max-width: 64rem) {
		.main-sidebar {
			flex-basis: 11rem;
		}
	}

	@media (max-width: 44rem) {
		.main-content {
			flex-direction: column;
		}

		.main-sidebar {
			flex-basis: auto;
			border-right: none;
			border-bottom: 1px solid var(--border-default);
		}

		.top-title {
			font-size: 24px;
		}
	}
</style>
