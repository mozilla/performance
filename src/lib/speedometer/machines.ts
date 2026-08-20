import type { Measurement } from '$lib/api/treeherder';

export const MACHINE_COLORS = [
	'#e6194b',
	'#3cb44b',
	'#4363d8',
	'#f58231',
	'#911eb4',
	'#42d4f4',
	'#f032e6',
	'#469990',
	'#9A6324',
	'#000075',
	'#800000',
	'#808000',
	'#e6beff',
	'#aaffc3',
	'#ffd8b1'
] as const;

/**
 * Chart.js point styles. All filled shapes; rotation creates further variants,
 * so colour × shape gives 15 × 6 = 90 distinguishable machines.
 */
export const MACHINE_SHAPES = [
	{ style: 'circle', rotation: 0, symbol: '●' },
	{ style: 'triangle', rotation: 0, symbol: '▲' },
	{ style: 'rect', rotation: 0, symbol: '■' },
	{ style: 'rectRot', rotation: 0, symbol: '◆' },
	{ style: 'triangle', rotation: 180, symbol: '▼' },
	{ style: 'rect', rotation: 45, symbol: '▨' }
] as const;

export interface MachineStyle {
	color: string;
	shape: string;
	rotation: number;
	/** Unicode glyph matching the point style, for the HTML legend. */
	symbol: string;
}

export interface MachineGroup {
	name: string;
	style: MachineStyle;
	measurements: Measurement[];
}

/** Style for the machine at `index` in the sorted machine list. */
export function styleForIndex(index: number): MachineStyle {
	const color = MACHINE_COLORS[index % MACHINE_COLORS.length];
	const shape = MACHINE_SHAPES[Math.floor(index / MACHINE_COLORS.length) % MACHINE_SHAPES.length];
	return { color, shape: shape.style, rotation: shape.rotation, symbol: shape.symbol };
}

const UNKNOWN_MACHINE = 'unknown';

/**
 * Group measurements by machine, sorted numeric-aware by name so that
 * `worker-2` precedes `worker-10` and the legend order is stable.
 */
export function groupByMachine(measurements: readonly Measurement[]): MachineGroup[] {
	const byName = new Map<string, Measurement[]>();

	for (const measurement of measurements) {
		const name = measurement.machineName || UNKNOWN_MACHINE;
		const existing = byName.get(name);
		if (existing) existing.push(measurement);
		else byName.set(name, [measurement]);
	}

	return [...byName.keys()]
		.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
		.map((name, index) => ({
			name,
			style: styleForIndex(index),
			measurements: byName.get(name)!
		}));
}

/**
 * Bounds covering every measurement, with padding.
 *
 * The axes are pinned to the full extent of the selected browser's data so
 * that isolating a machine does not rescale the plot -- comparing two machines
 * is the whole point of the view, and it does not work if the axes move.
 */
export interface Bounds {
	xMin: number;
	xMax: number;
	yMin: number;
	yMax: number;
}

const HALF_DAY_MS = 12 * 60 * 60 * 1000;

export function paddedBounds(measurements: readonly Measurement[]): Bounds | null {
	if (measurements.length === 0) return null;

	let xMin = Infinity;
	let xMax = -Infinity;
	let yMin = Infinity;
	let yMax = -Infinity;

	for (const m of measurements) {
		const x = m.date.getTime();
		if (x < xMin) xMin = x;
		if (x > xMax) xMax = x;
		if (m.value < yMin) yMin = m.value;
		if (m.value > yMax) yMax = m.value;
	}

	// Fall back to fixed padding when every point shares an x or a y, which
	// would otherwise collapse the axis to zero width.
	const xPad = xMax > xMin ? (xMax - xMin) * 0.02 : HALF_DAY_MS;
	const yPad = yMax > yMin ? (yMax - yMin) * 0.05 : Math.abs(yMax) * 0.05 || 1;

	return { xMin: xMin - xPad, xMax: xMax + xPad, yMin: yMin - yPad, yMax: yMax + yPad };
}
