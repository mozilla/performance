<script lang="ts">
	import type { PerfSignature } from '$lib/api/treeherder';
	import { OVERALL_TEST } from '$lib/navbench/config';
	import { testsIn } from '$lib/navbench/data';
	import SubtestChart from './SubtestChart.svelte';

	interface Props {
		signatures: PerfSignature[];
		days: number;
		href(test: string): string;
	}

	let { signatures, days, href }: Props = $props();

	// The per-site tests only. The overall score is already the chart at the top
	// of the page, so repeating it here would be a duplicate rather than a
	// breakdown. Discovered from the signature list, like everything else on this
	// page, so a site added to the benchmark appears without an edit.
	const tests = $derived(testsIn(signatures).filter((test) => test !== OVERALL_TEST));
</script>

<div class="subtests">
	{#if tests.length === 0}
		<p class="empty">No per-site tests available for this platform.</p>
	{/if}

	{#each tests as test (test)}
		<SubtestChart {test} {signatures} {days} href={href(test)} />
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
		color: var(--ink-muted);
		text-align: center;
	}
</style>
