<script lang="ts">
	import type { PerfSignature } from '$lib/api/treeherder';
	import type { SpeedometerSuite } from './suite';
	import type { RowNaming } from './table';
	import SubtestChart from './SubtestChart.svelte';

	interface Props {
		suite: SpeedometerSuite;
		naming: RowNaming;
		signatures: PerfSignature[];
		days: number;
		replicates: boolean;
		hidden: ReadonlySet<string>;
		href(test: string): string;
	}

	let { suite, naming, signatures, days, replicates, hidden, href }: Props = $props();

	const tests = $derived(suite.subtests(signatures));
</script>

<div class="subtests">
	{#if tests.length === 0}
		<p class="empty">No subtests available for this platform.</p>
	{/if}

	{#each tests as test (test)}
		<SubtestChart
			{suite}
			{naming}
			{test}
			{signatures}
			{days}
			{replicates}
			{hidden}
			href={href(test)}
		/>
	{/each}
</div>

<style>
	.subtests {
		width: 100%;
		max-width: var(--content-max);
		margin: var(--space-5) auto;
	}

	.empty {
		font-family: sans-serif;
		color: var(--ink-disabled);
	}
</style>
