<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import EngineChart from './EngineChart.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import { resource } from '$lib/resource.svelte';
	import { dateRange, failureRate, fetchEngineData } from '$lib/ml/engine';
	import { parseState, patchUrl, str } from '$lib/url-state';

	const schema = { engine: str('') };

	const view = $derived(parseState(schema, page.url));
	const href = (patch: Partial<typeof view>) => patchUrl(schema, page.url, patch);

	const data = resource((signal) => fetchEngineData(signal));

	const engines = $derived(data.value ?? []);
	const covered = $derived(dateRange(engines));

	const shown = $derived(
		view.engine === '' ? engines : engines.filter((engine) => engine.id === view.engine)
	);

	/** True when the URL names an engine the dataset does not have. */
	const unknownEngine = $derived(
		!data.loading && !data.error && view.engine !== '' && shown.length === 0
	);

	const day = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
	const integer = new Intl.NumberFormat(undefined);
	const percent = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 2 });

	const rate = (success: number, failure: number) => {
		const value = failureRate(success, failure);
		return value === null ? '—' : percent.format(value);
	};

	const select = (event: Event & { currentTarget: HTMLSelectElement }) =>
		goto(href({ engine: event.currentTarget.value }), {
			replaceState: true,
			noScroll: true,
			keepFocus: true
		});
</script>

<svelte:head><title>Firefox AI Runtime Engines</title></svelte:head>

<div class="page">
	<h1>Firefox AI Runtime Engines</h1>

	<!--
		The one place in the dashboard that charts telemetry rather than CI
		benchmarks, which is worth saying on the page: the numbers describe what
		users experienced, so they move with population and hardware mix and are
		not comparable with the reference-machine timings on the ML page.
	-->
	<p class="lede">
		Per-engine latency and reliability from <a
			href="https://firefox-source-docs.mozilla.org/toolkit/components/ml/index.html"
			target="_blank"
			rel="noreferrer">Firefox AI Runtime</a
		>
		telemetry on nightly, beta and release — not CI benchmarks. The upstream query covers a rolling seven
		days{#if covered}, currently {day.format(covered.first)} to {day.format(covered.last)}{/if}.
	</p>

	<div class="controls">
		<label>
			<span>Filter by EngineId:</span>
			<select value={view.engine} onchange={select} disabled={engines.length === 0}>
				<option value="">All</option>
				{#each engines as engine (engine.id)}
					<option value={engine.id}>{engine.label}</option>
				{/each}
			</select>
		</label>
		{#if view.engine !== ''}
			<a class="clear" href={href({ engine: '' })} data-sveltekit-noscroll>Show all</a>
		{/if}
	</div>

	{#if data.error}
		<p class="error">Could not load engine data: {String(data.error)}</p>
	{:else if data.loading}
		<Spinner message="Loading engine telemetry…" />
	{:else if engines.length === 0}
		<p class="empty">The engine dataset is empty.</p>
	{:else if unknownEngine}
		<p class="empty">
			No engine called <code>{view.engine}</code> in the current seven-day window. It may have been renamed,
			or simply not have run.
		</p>
	{:else}
		{#each shown as engine (engine.id)}
			<section class="engine">
				<h2>{engine.label}</h2>
				<div class="body">
					<div class="chart">
						<EngineChart points={engine.points} label={engine.label} />
					</div>
					<div class="stats">
						<div class="card">
							<h3>Engine creation</h3>
							<dl>
								<dt>Success</dt>
								<dd>{integer.format(engine.totals.engineCreationSuccess)}</dd>
								<dt>Failure</dt>
								<dd>{integer.format(engine.totals.engineCreationFailure)}</dd>
								<dt>Failure rate</dt>
								<dd>
									{rate(engine.totals.engineCreationSuccess, engine.totals.engineCreationFailure)}
								</dd>
							</dl>
						</div>
						<div class="card">
							<h3>Inference</h3>
							<dl>
								<dt>Success</dt>
								<dd>{integer.format(engine.totals.inferenceSuccess)}</dd>
								<dt>Failure</dt>
								<dd>{integer.format(engine.totals.inferenceFailure)}</dd>
								<dt>Failure rate</dt>
								<dd>
									{rate(engine.totals.inferenceSuccess, engine.totals.inferenceFailure)}
								</dd>
							</dl>
						</div>
					</div>
				</div>
			</section>
		{/each}
	{/if}
</div>

<style>
	.page {
		/* Same AI-runtime purple as the ML page, which this is a sibling of. */
		--accent: #4a3aa7;
		width: 100%;
		max-width: 1200px;
	}

	h1 {
		font-family: 'Zilla Slab', serif;
		margin-bottom: var(--space-2);
	}

	.lede {
		font-size: 13px;
		color: var(--ink-secondary);
		max-width: 70ch;
		margin-bottom: var(--space-5);
	}

	.controls {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin-bottom: var(--space-6);
	}

	.controls label {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: 14px;
	}

	.controls select {
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: var(--surface-control);
		color: var(--ink-primary);
		font-size: 14px;
		/* The longest engine id is ~70 characters; let the box grow to the
		   content rather than truncating, but not past the page. */
		max-width: 100%;
	}

	.clear {
		font-size: 13px;
	}

	.engine {
		background: var(--surface-card);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		padding: var(--space-4);
		margin-bottom: var(--space-5);
	}

	h2 {
		font-size: 16px;
		margin-bottom: var(--space-3);
		/* Engine ids are unspaced and can be long enough to overflow. */
		overflow-wrap: anywhere;
	}

	.body {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-4);
		align-items: flex-start;
	}

	.chart {
		flex: 1 1 460px;
		min-width: 0;
	}

	.stats {
		display: flex;
		gap: var(--space-3);
		flex: 1 1 320px;
	}

	.card {
		flex: 1;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		padding: var(--space-3);
		min-width: 0;
	}

	h3 {
		font-size: 13px;
		color: var(--ink-secondary);
		margin-bottom: var(--space-2);
	}

	dl {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: var(--space-1) var(--space-3);
		font-size: 13px;
	}

	dt {
		color: var(--ink-secondary);
	}

	dd {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.error {
		color: var(--danger);
		padding: var(--space-8) 0;
	}

	.empty {
		color: var(--ink-muted);
		padding: var(--space-8) 0;
	}
</style>
