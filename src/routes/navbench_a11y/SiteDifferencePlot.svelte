<script lang="ts">
	import { type A11yRow, beyondNoise, formatChange } from '#lib/navbench/a11y.js';
	import { displayName, OVERALL_TEST } from '#lib/navbench/config.js';

	interface Props {
		rows: A11yRow[];
		/** Shared x range, as fractions. */
		extent: { min: number; max: number };
		selected: string;
		href(test: string): string;
	}

	let { rows, extent, selected, href }: Props = $props();

	/** Position along the track, as a percentage of its width. */
	const at = (fraction: number) => ((fraction - extent.min) / (extent.max - extent.min)) * 100;

	// Round steps, few enough to stay legible at phone width.
	const ticks = $derived.by(() => {
		const span = extent.max - extent.min;
		const step = span <= 0.12 ? 0.02 : span <= 0.3 ? 0.05 : span <= 0.7 ? 0.1 : 0.2;
		const out: number[] = [];
		for (let t = Math.ceil(extent.min / step) * step; t <= extent.max + 1e-9; t += step) {
			out.push(Math.round(t * 1000) / 1000);
		}
		return out;
	});
</script>

<figure class="plot" aria-label="Change in display time with accessibility on, by site">
	<div class="row axis" aria-hidden="true">
		<span class="label"></span>
		<span class="track">
			{#each ticks as tick (tick)}
				<span class="tick" style:left="{at(tick)}%">{formatChange(tick)}</span>
			{/each}
		</span>
		<span class="value"></span>
	</div>

	{#each rows as row (row.test)}
		<div
			class="row"
			class:overall={row.test === OVERALL_TEST}
			class:selected={row.test === selected}
		>
			<a class="label" href={href(row.test)} data-sveltekit-reset="false">
				{displayName(row.test)}
			</a>
			<span
				class="track"
				title="{displayName(row.test)}: {formatChange(
					row.change
				)} on average over {row.pushes} pushes, from {formatChange(row.min)} to {formatChange(
					row.max
				)}"
			>
				{#each ticks as tick (tick)}
					<span class="grid" class:zero={tick === 0} style:left="{at(tick)}%"></span>
				{/each}
				<span
					class="range"
					style:left="{at(row.min)}%"
					style:width="{Math.max(at(row.max) - at(row.min), 0.4)}%"
				></span>
				<span class="dot" class:notable={beyondNoise(row.change)} style:left="{at(row.change)}%"
				></span>
			</span>
			<span class="value" class:notable={beyondNoise(row.change)}>{formatChange(row.change)}</span>
		</div>
	{/each}

	<figcaption>
		Dot: the average over the paired pushes. Bar: the smallest to the largest single push. Right of
		zero, pages take longer to display with accessibility on; left of zero, less time.
	</figcaption>
</figure>

<style>
	.plot {
		width: 100%;
		max-width: var(--content-max);
		margin: 0;
		font-family: sans-serif;
		font-size: 13px;
	}

	.row {
		display: grid;
		grid-template-columns: minmax(7rem, 13rem) 1fr 4.5rem;
		align-items: center;
		gap: var(--space-3);
		min-height: 28px;
	}

	.row.overall {
		border-bottom: 1px solid var(--border-default);
		padding-bottom: var(--space-1);
		margin-bottom: var(--space-1);
		font-weight: bold;
	}

	.row.selected .label {
		color: var(--accent);
	}

	.label {
		color: var(--ink-primary);
		text-align: right;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.track {
		position: relative;
		height: 22px;
	}

	.axis .track {
		height: 18px;
		color: var(--ink-muted);
		font-size: 11px;
	}

	.tick {
		position: absolute;
		transform: translateX(-50%);
		white-space: nowrap;
	}

	.grid {
		position: absolute;
		top: 0;
		bottom: 0;
		border-left: 1px solid var(--border-subtle);
	}

	.grid.zero {
		border-left: 1px dashed var(--ink-muted);
	}

	.range {
		position: absolute;
		top: 8px;
		height: 6px;
		border-radius: 3px;
		background: color-mix(in srgb, #8a3ffc 30%, transparent);
	}

	.dot {
		position: absolute;
		top: 4px;
		width: 14px;
		height: 14px;
		margin-left: -7px;
		border-radius: 50%;
		background: var(--surface-card);
		border: 2px solid #8a3ffc;
		box-sizing: border-box;
	}

	/* Filled only when the average is clear of push-to-push noise. */
	.dot.notable {
		background: #8a3ffc;
	}

	.value {
		text-align: right;
		font-variant-numeric: tabular-nums;
		color: var(--ink-secondary);
	}

	.value.notable {
		color: var(--ink-primary);
		font-weight: bold;
	}

	figcaption {
		margin-top: var(--space-3);
		color: var(--ink-muted);
		font-size: 12px;
		text-align: center;
	}

	@media (max-width: 600px) {
		.row {
			grid-template-columns: 6.5rem 1fr 3.5rem;
			gap: var(--space-2);
		}

		/* Wrapped rather than cut off: the name is the point of the row. */
		.label {
			white-space: normal;
			line-height: 1.2;
		}
	}
</style>
