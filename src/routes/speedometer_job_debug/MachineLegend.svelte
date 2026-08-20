<script lang="ts">
	import type { MachineGroup } from '$lib/speedometer/machines';

	interface Props {
		groups: MachineGroup[];
		/** Currently isolated machine, or '' for all. */
		isolated: string;
		href(machine: string): string;
		onhover(machine: string | null): void;
	}

	let { groups, isolated, href, onhover }: Props = $props();
</script>

<div
	class="legend"
	onmouseleave={() => onhover(null)}
	role="group"
	aria-label="Machines"
	data-sveltekit-noscroll
>
	<span class="heading">Machines:</span>
	{#each groups as group (group.name)}
		{@const selected = isolated === group.name}
		{@const dimmed = isolated !== '' && !selected}
		<a
			class="chip"
			class:selected
			class:dimmed
			href={href(selected ? '' : group.name)}
			title={selected ? 'Show all machines' : `Show only ${group.name}`}
			onmouseenter={() => onhover(group.name)}
		>
			<span class="swatch" style:color={dimmed ? undefined : group.style.color}>
				{group.style.symbol}
			</span>
			<span class="name">{group.name}</span>
		</a>
	{/each}
</div>

<style>
	.legend {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		text-align: left;
		width: 100%;
		max-width: var(--content-max);
		margin: var(--space-2) auto;
		font-family: sans-serif;
		font-size: 12px;
	}

	.heading {
		font-weight: bold;
		padding: var(--space-1) var(--space-2) var(--space-1) 0;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--border-default);
		background: var(--surface-card);
		color: inherit;
		text-decoration: none;
		user-select: none;
		/* Pull each chip onto its neighbour so adjacent borders share a line. */
		margin: -1px 0 0 -1px;
	}

	.chip:hover {
		background: var(--surface-note);
		border-color: var(--accent);
		position: relative;
		z-index: 1;
	}

	/* Deliberately no bold or size change: the chip must not resize when
	   selected, or the chips after it shift out from under the cursor. */
	.chip.selected {
		background: var(--surface-accent-soft);
		border-color: var(--accent);
		box-shadow: inset 0 0 0 1px var(--accent);
		position: relative;
		z-index: 2;
	}

	.chip.dimmed {
		background: var(--surface-row-odd);
		color: var(--ink-disabled);
	}

	.chip.dimmed .name {
		text-decoration: line-through;
	}

	.swatch {
		font-size: 14px;
		line-height: 1;
	}
</style>
