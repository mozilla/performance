<script lang="ts">
	import { type PlatformConfig, PLATFORMS } from '$lib/speedometer/config';

	interface Props {
		/** Defaults to every platform; Speedometer Experimental runs on four. */
		platforms?: readonly PlatformConfig[];
		selected: string;
		/** URL for selecting a platform, from the page's state patcher. */
		href(key: string): string;
	}

	let { platforms = PLATFORMS, selected, href }: Props = $props();

	const desktop = $derived(platforms.filter((p) => p.group === 'desktop'));
	const mobile = $derived(platforms.filter((p) => p.group === 'mobile'));
</script>

<nav class="platforms" aria-label="Platform" data-sveltekit-noscroll>
	<div class="group">
		{#each desktop as platform (platform.key)}
			<a
				href={href(platform.key)}
				class:selected={platform.key === selected}
				aria-current={platform.key === selected ? 'page' : undefined}
			>
				{platform.label}
			</a>
		{/each}
	</div>
	{#if mobile.length > 0}
		<div class="group">
			{#each mobile as platform (platform.key)}
				<a
					href={href(platform.key)}
					class:selected={platform.key === selected}
					aria-current={platform.key === selected ? 'page' : undefined}
				>
					{platform.label}
				</a>
			{/each}
		</div>
	{/if}
</nav>

<style>
	.platforms {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		align-items: center;
		margin-bottom: var(--space-5);
	}

	.group {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
		justify-content: center;
	}

	a {
		padding: var(--space-3) var(--space-6);
		border-radius: var(--radius-sm);
		text-decoration: none;
		color: var(--ink-primary);
		font-family: sans-serif;
		font-size: 16px;
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
