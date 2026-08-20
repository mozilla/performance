<script lang="ts">
	import { page } from '$app/state';
	import MlChart from './MlChart.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import { resource } from '$lib/resource.svelte';
	import {
		DEFAULT_PLATFORM,
		fetchMlData,
		mergeLatencies,
		PLATFORM_DESCRIPTIONS,
		PLATFORM_KEYS,
		PLATFORM_LABELS,
		PLATFORMS,
		type PlatformKey,
		valuesFor
	} from '$lib/ml/data';
	import { parseState, patchUrl, str } from '$lib/url-state';

	const schema = { platform: str(DEFAULT_PLATFORM, PLATFORM_KEYS) };

	const view = $derived(parseState(schema, page.url));
	const href = (patch: Partial<typeof view>) => patchUrl(schema, page.url, patch);

	const platformKey = $derived(view.platform as PlatformKey);
	const platform = $derived(PLATFORMS[platformKey]);

	const data = resource((signal) => fetchMlData(signal));

	/**
	 * The two Smart Tab features. Each shows cold-start latency (initialization
	 * plus model run) and peak memory.
	 */
	const FEATURES = [
		{
			title: 'Smart Tab Grouping - Suggest',
			description: 'Suggests similar tabs with ~10 tabs in the window.',
			suite: 'smart tab grouping',
			init: 'embedding-cold-start-initialization-latency',
			run: 'embedding-model-run-latency',
			memory: 'embedding-peak-memory-usage'
		},
		{
			title: 'Smart Tab Grouping - Topic',
			description: 'Generates a group label for ~5 tabs.',
			suite: 'smart tab grouping',
			init: 'topic-cold-start-initialization-latency',
			run: 'topic-model-run-latency',
			memory: 'topic-peak-memory-usage'
		}
	];

	const features = $derived.by(() => {
		const index = data.value;
		if (!index) return [];

		return FEATURES.map((feature) => ({
			...feature,
			latency: mergeLatencies(
				valuesFor(index, feature.suite, feature.init, platform),
				valuesFor(index, feature.suite, feature.run, platform)
			),
			peakMemory: valuesFor(index, feature.suite, feature.memory, platform)
		}));
	});
</script>

<svelte:head><title>Firefox AI Runtime</title></svelte:head>

<div class="page">
	<h1>Firefox AI Runtime</h1>

	<nav class="platforms" aria-label="Platform" data-sveltekit-noscroll>
		{#each PLATFORM_KEYS as key (key)}
			<a href={href({ platform: key })} class:active={platformKey === key}>
				{PLATFORM_LABELS[key]}
			</a>
		{/each}
	</nav>

	<p class="hardware">{PLATFORM_DESCRIPTIONS[platformKey]}</p>

	{#if data.error}
		<p class="error">Could not load ML data: {String(data.error)}</p>
	{:else if data.loading}
		<Spinner message="Loading ML data…" />
	{:else}
		<div class="features">
			{#each features as feature (feature.title)}
				<section class="feature">
					<h2>{feature.title}</h2>
					<p class="feature-desc">{feature.description}</p>
					<div class="charts">
						<MlChart points={feature.latency} unit="ms" description="Latency in ms (cold start)" />
						<MlChart points={feature.peakMemory} unit="MiB" description="Peak RAM usage in MiB" />
					</div>
				</section>
			{/each}
		</div>
	{/if}

	<p class="more-info">
		<a href="https://wiki.mozilla.org/Performance/Platforms" target="_blank" rel="noreferrer">
			More info on CI hardware
		</a>
		|
		<a
			href="https://firefox-source-docs.mozilla.org/toolkit/components/ml/index.html"
			target="_blank"
			rel="noreferrer">Runtime Documentation</a
		>
		|
		<a href="https://blog.mozilla.org/en/mozilla/ai/ai-tech" target="_blank" rel="noreferrer">
			Blog posts
		</a>
	</p>
</div>

<style>
	.page {
		/* ML uses the AI-runtime purple as its accent. */
		--accent: #4a3aa7;
		width: 100%;
		max-width: 1200px;
	}

	h1 {
		font-family: 'Zilla Slab', serif;
		margin-bottom: var(--space-4);
	}

	.platforms {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
		margin-bottom: var(--space-3);
	}

	.platforms a {
		padding: var(--space-2) var(--space-4);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: var(--surface-card);
		text-decoration: none;
		color: var(--ink-primary);
		font-size: 14px;
	}

	.platforms a:hover {
		background: var(--surface-control);
	}

	.platforms a.active {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--ink-inverse);
	}

	.hardware {
		font-size: 13px;
		color: var(--ink-secondary);
		margin-bottom: var(--space-6);
	}

	.features {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(460px, 1fr));
		gap: var(--space-5);
	}

	.feature {
		background: var(--surface-card);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		padding: var(--space-4);
	}

	h2 {
		font-size: 16px;
		margin-bottom: var(--space-1);
	}

	.feature-desc {
		font-size: 13px;
		color: var(--ink-secondary);
		margin-bottom: var(--space-3);
	}

	.charts {
		display: flex;
		gap: var(--space-4);
	}

	.more-info {
		margin-top: var(--space-7);
		font-size: 13px;
	}

	.error {
		color: var(--danger);
		padding: var(--space-8) 0;
	}
</style>
