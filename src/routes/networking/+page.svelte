<script lang="ts">
	import { page } from '$app/state';
	import NetChart from './NetChart.svelte';
	import {
		CHANNELS,
		CHARTS,
		type Channel,
		layoutFor,
		type Platform,
		PLATFORMS
	} from '$lib/networking/config';
	import { parseState, patchUrl, str } from '$lib/url-state';

	const schema = {
		platform: str('desktop', PLATFORMS),
		channel: str('release', CHANNELS)
	};

	const view = $derived(parseState(schema, page.url));
	const href = (patch: Partial<typeof view>) => patchUrl(schema, page.url, patch);

	const groups = $derived(layoutFor(view.platform as Platform, view.channel as Channel));

	const platformLabel: Record<string, string> = { desktop: 'Desktop', android: 'Android' };
</script>

<svelte:head><title>Firefox Networking</title></svelte:head>

<div class="page">
	<h1>Firefox Networking - {platformLabel[view.platform]}</h1>
	<p class="lede">Networking telemetry from the pageload event, last 365 days unless noted.</p>

	<div class="controls" data-sveltekit-noscroll>
		<div class="control-group">
			<span class="control-label">Platform</span>
			<div class="pills">
				{#each PLATFORMS as platform (platform)}
					<a href={href({ platform })} class:active={view.platform === platform}>
						{platformLabel[platform]}
					</a>
				{/each}
			</div>
		</div>
		<div class="control-group">
			<span class="control-label">Channel</span>
			<div class="pills">
				{#each CHANNELS as channel (channel)}
					<a href={href({ channel })} class:active={view.channel === channel}>
						{channel.charAt(0).toUpperCase() + channel.slice(1)}
					</a>
				{/each}
			</div>
		</div>
	</div>

	{#each groups as group (group.title)}
		<div class="group">
			<h2>{group.title}</h2>
			<p class="group-desc">Top Level Document Requests</p>
			<div class="charts-grid">
				{#each group.charts as id (id)}
					{#if CHARTS[id]}
						<NetChart {id} config={CHARTS[id]} />
					{/if}
				{/each}
			</div>
		</div>
	{/each}
</div>

<style>
	.page {
		width: 100%;
		max-width: 1400px;
	}

	h1 {
		font-family: 'Zilla Slab', serif;
		margin-bottom: var(--space-2);
	}

	.lede {
		color: var(--ink-secondary);
		margin-bottom: var(--space-5);
	}

	.controls {
		display: flex;
		gap: var(--space-7);
		align-items: center;
		flex-wrap: wrap;
		margin-bottom: var(--space-6);
	}

	.control-group {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.control-label {
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--ink-secondary);
	}

	.pills {
		display: inline-flex;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		overflow: hidden;
		background: var(--surface-card);
	}

	.pills a {
		padding: var(--space-2) var(--space-4);
		font-size: 13px;
		text-decoration: none;
		color: var(--ink-primary);
		border-right: 1px solid var(--border-subtle);
	}

	.pills a:last-child {
		border-right: none;
	}

	.pills a:hover {
		background: var(--surface-control);
	}

	.pills a.active {
		background: var(--accent);
		color: var(--ink-inverse);
	}

	.group {
		margin-bottom: var(--space-7);
	}

	h2 {
		font-size: 17px;
		margin-bottom: var(--space-1);
		padding-bottom: var(--space-1);
		border-bottom: 1px solid var(--border-subtle);
	}

	.group-desc {
		font-size: 12px;
		color: var(--ink-secondary);
		margin-bottom: var(--space-3);
	}

	.charts-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
		gap: var(--space-4);
	}
</style>
