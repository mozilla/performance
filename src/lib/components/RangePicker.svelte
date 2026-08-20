<script lang="ts">
	import { RANGES } from '$lib/speedometer/config';

	interface Props {
		selected: number;
		href(days: number): string;
	}

	let { selected, href }: Props = $props();
</script>

<nav class="ranges" aria-label="Time range" data-sveltekit-noscroll>
	{#each RANGES as range (range.days)}
		<a
			href={href(range.days)}
			class:selected={range.days === selected}
			aria-current={range.days === selected ? 'true' : undefined}
		>
			{range.label}
		</a>
	{/each}
</nav>

<style>
	.ranges {
		display: flex;
		gap: var(--space-2);
		justify-content: center;
		margin-top: var(--space-3);
	}

	a {
		padding: var(--space-2) var(--space-5);
		border-radius: var(--radius-sm);
		text-decoration: none;
		color: var(--ink-primary);
		font-family: sans-serif;
		font-size: 15px;
		border: 1px solid transparent;
	}

	a:hover {
		background-color: var(--surface-control-hover);
	}

	a.selected {
		background-color: var(--surface-accent-soft);
		border-color: var(--accent);
		font-weight: bold;
	}
</style>
