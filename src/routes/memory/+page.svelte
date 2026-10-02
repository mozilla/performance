<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Spinner from '$lib/components/Spinner.svelte';
	import ProbeChart from './ProbeChart.svelte';
	import { resource } from '$lib/resource.svelte';
	import {
		type Channel,
		CHANNELS,
		DEFAULT_PROCESS,
		MIN_SHARE_PCT,
		PROCESS_LABELS,
		PROCESSES,
		SECTIONS,
		VERSION_CHANNEL
	} from '$lib/memory/config';
	import { fetchMemoryData, versionsIn } from '$lib/memory/data';
	import { bool, parseState, patchUrl, str } from '$lib/url-state';

	const schema = {
		process: str(DEFAULT_PROCESS, PROCESSES),
		channel: str('release', CHANNELS),
		byVersion: bool(false)
	};

	const view = $derived(parseState(schema, page.url));
	const href = (patch: Partial<typeof view>) => patchUrl(schema, page.url, patch);
	const apply = (patch: Partial<typeof view>) =>
		goto(href(patch), { replaceState: true, noScroll: true, keepFocus: true });

	// `channel` on its own, not `view.channel`: `view` is a fresh object on every
	// URL change, so reading it here would make the fetch depend on the whole
	// URL and re-download and re-parse the CSV -- 20 columns × 6 months × four
	// processes -- every time the process or the version toggle changed. A
	// $derived of a primitive only notifies when the value differs.
	const channel = $derived(view.channel as Channel);

	const data = resource((signal) => fetchMemoryData(channel, signal));

	const processData = $derived(data.value?.[view.process]);

	// Per-version display is release-only. The preference is kept in the URL
	// either way, so switching back to release restores it.
	const versionMode = $derived(view.byVersion && view.channel === VERSION_CHANNEL);
	const hasVersions = $derived(versionsIn(processData).length > 0);

	const channelLabel = $derived(view.channel.charAt(0).toUpperCase() + view.channel.slice(1));

	const caption = $derived.by(() => {
		const encoding = versionMode
			? `one colour per major version — solid P75, dashed P95 (each version while it held at least ${MIN_SHARE_PCT}% of the day's volume)`
			: 'P75 and P95 of the daily distribution';

		let text = `${PROCESS_LABELS[view.process] ?? view.process} process — ${channelLabel} — ${encoding}`;

		// Only mention the markers once we know this channel ships per-version rows.
		if (!versionMode && hasVersions) {
			text += `. Dashed rules mark when a major version reached ${MIN_SHARE_PCT}% of the population`;
		}

		return text;
	});
</script>

<svelte:head><title>Firefox Memory — Desktop</title></svelte:head>

<div class="page">
	<h1>Firefox Memory - Desktop</h1>
	<p class="lede">
		Per-process memory usage, last 6 months. Distributions are aggregated daily and summarized as
		percentiles.
	</p>

	<div class="controls" data-sveltekit-noscroll>
		<div class="control-group">
			<span class="control-label">Process</span>
			<div class="pills">
				{#each PROCESSES as process (process)}
					<a href={href({ process })} class:active={view.process === process}>
						{PROCESS_LABELS[process]}
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

		<!-- Release only: the nightly query has no version column. -->
		{#if view.channel === VERSION_CHANNEL}
			<div class="control-group">
				<label class="checkbox">
					<input
						type="checkbox"
						checked={view.byVersion}
						onchange={(event) => apply({ byVersion: event.currentTarget.checked })}
					/>
					By major version
				</label>
			</div>
		{/if}
	</div>

	<p class="caption">{caption}</p>

	{#if data.error}
		<p class="error">Could not load memory data: {String(data.error)}</p>
	{:else if data.loading}
		<Spinner message="Loading memory data…" />
	{:else}
		{#each SECTIONS as section (section.title)}
			<div class="group">
				<h2>{section.title}</h2>
				<div class="charts-grid">
					{#each section.probes as probe (probe.key)}
						<ProbeChart {probe} {processData} {versionMode} />
					{/each}
				</div>
			</div>
		{/each}
	{/if}
</div>

<style>
	.page {
		/* Memory uses the version palette's blue as its accent. */
		--accent: #2a78d6;
		width: 100%;
		max-width: 1200px;
	}

	h1 {
		font-family: 'Zilla Slab', serif;
		margin-bottom: var(--space-2);
	}

	.lede {
		color: var(--ink-secondary);
		margin-bottom: var(--space-5);
		max-width: 70ch;
	}

	.controls {
		display: flex;
		gap: var(--space-7);
		align-items: center;
		flex-wrap: wrap;
		margin-bottom: var(--space-3);
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

	.checkbox {
		font-size: 13px;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		cursor: pointer;
	}

	.caption {
		font-size: 13px;
		color: var(--ink-secondary);
		margin-bottom: var(--space-5);
		max-width: 90ch;
	}

	.group {
		margin-bottom: var(--space-7);
	}

	h2 {
		font-size: 16px;
		margin-bottom: var(--space-3);
		padding-bottom: var(--space-1);
		border-bottom: 1px solid var(--border-subtle);
	}

	.charts-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
		gap: var(--space-4);
	}

	.error {
		color: var(--danger);
		padding: var(--space-8) 0;
	}
</style>
