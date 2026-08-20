<script lang="ts">
	import { untrack } from 'svelte';
	import {
		Chart,
		type ChartData,
		type ChartOptions,
		type ChartType,
		type Plugin
	} from 'chart.js/auto';
	import annotationPlugin from 'chartjs-plugin-annotation';
	import 'chartjs-adapter-date-fns';

	Chart.register(annotationPlugin);

	interface Props {
		type: ChartType;
		data: ChartData;
		options?: ChartOptions;
		plugins?: Plugin[];
		/**
		 * Chart.js update mode. 'none' skips the animation, which is what you
		 * want when the update is driven by a control the user just changed.
		 */
		updateMode?: 'none' | 'resize' | 'active';
		ariaLabel?: string;
	}

	let { type, data, options = {}, plugins = [], updateMode = 'none', ariaLabel }: Props = $props();

	let canvas: HTMLCanvasElement;
	let chart = $state.raw<Chart | undefined>(undefined);

	$effect(() => {
		// Tracked: rebuild triggers only. Everything else is read via untrack().
		void type;
		void plugins;

		const instance = new Chart(
			canvas,
			untrack(() => ({ type, data, options, plugins }))
		);
		chart = instance;

		return () => {
			instance.destroy();
			chart = undefined;
		};
	});

	$effect(() => {
		// Tracked: in-place update triggers.
		const nextData = data;
		const nextOptions = options;

		const instance = chart;
		if (!instance) return;

		instance.data = nextData;
		instance.options = nextOptions;
		instance.update(updateMode);
	});

	/** Escape hatch for the rare imperative need, e.g. `getDatasetMeta()`. */
	export function getChart(): Chart | undefined {
		return chart;
	}
</script>

<canvas bind:this={canvas} aria-label={ariaLabel} role={ariaLabel ? 'img' : undefined}></canvas>

<style>
	canvas {
		width: 100%;
	}
</style>
