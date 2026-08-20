/**
 * Chart.js configuration for the Job Debug view: one dataset per machine,
 * coloured and shaped so individual machines can be told apart.
 */
import type { ChartData, ChartOptions } from 'chart.js';
import type { Repository } from '$lib/api/treeherder';
import { lowerIsBetter } from './config';
import type { Bounds, MachineGroup } from './machines';

export interface MachinePoint {
	x: number;
	y: number;
	revision: string;
	jobId: number;
	repository: Repository;
	machineName: string;
}

export interface MachineChartInputs {
	groups: readonly MachineGroup[];
	/** Isolated machine name, or '' for all. */
	isolated: string;
	/** Machine under the pointer, dimming the others. */
	hovered: string | null;
	bounds: Bounds | null;
	test: string;
}

function withAlpha(hex: string, alpha: number): string {
	const value = hex.replace('#', '');
	const r = parseInt(value.slice(0, 2), 16);
	const g = parseInt(value.slice(2, 4), 16);
	const b = parseInt(value.slice(4, 6), 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function buildMachineChartData(
	inputs: MachineChartInputs
): ChartData<'scatter', MachinePoint[]> {
	const { groups, isolated, hovered } = inputs;

	return {
		datasets: groups.map((group) => {
			const faded = hovered !== null && hovered !== group.name;

			return {
				label: group.name,
				hidden: isolated !== '' && isolated !== group.name,
				data: group.measurements.map((m) => ({
					x: m.date.getTime(),
					y: m.value,
					revision: m.revision,
					jobId: m.jobId,
					repository: m.repository,
					machineName: group.name
				})),
				// Only the fill and border fade; point size stays constant so the
				// chart does not wiggle as the pointer moves between machines.
				pointRadius: 5,
				pointStyle: group.style.shape as 'circle',
				pointRotation: group.style.rotation,
				pointBackgroundColor: faded ? withAlpha(group.style.color, 0.16) : group.style.color,
				pointBorderColor: faded ? 'transparent' : '#000',
				pointBorderWidth: 0.5,
				// Chart.js paints the lowest order last, i.e. on top, so the hovered
				// machine needs a lower order than the faded ones. Without this a
				// faded machine that sorts earlier paints over the opaque points.
				order: hovered === group.name ? -1 : 0
			};
		})
	};
}

export interface MachineChartHandlers {
	onPointClick?(point: MachinePoint): void;
	onHoverMachine?(machine: string | null): void;
}

export function buildMachineChartOptions(
	inputs: MachineChartInputs,
	handlers: MachineChartHandlers = {}
): ChartOptions<'scatter'> {
	const { bounds, test, groups } = inputs;

	return {
		responsive: true,
		// Height comes from the container (--chart-height) rather than from an
		// aspect ratio. With a fluid-width column, a fixed 1.5 ratio makes the
		// chart taller as the window widens -- at 1400px it would be 933px
		// tall, which is worse than the 900px cap it replaced.
		maintainAspectRatio: false,
		onClick: (_event, elements, chart) => {
			const hit = elements[0];
			if (!hit) return;
			const point = chart.data.datasets[hit.datasetIndex].data[
				hit.index
			] as unknown as MachinePoint;
			handlers.onPointClick?.(point);
		},
		onHover: (event, elements) => {
			const target = event.native?.target as HTMLElement | null;
			if (target) target.style.cursor = elements.length > 0 ? 'pointer' : 'default';
			const index = elements[0]?.datasetIndex;
			handlers.onHoverMachine?.(index === undefined ? null : (groups[index]?.name ?? null));
		},
		plugins: {
			// The machine legend is rendered as HTML chips rather than by
			// Chart.js, because it needs to be links.
			legend: { display: false },
			tooltip: {
				callbacks: {
					title: (items) => {
						const point = items[0]?.raw as MachinePoint | undefined;
						if (!point) return '';
						return new Date(point.x).toLocaleDateString('en-US', {
							month: 'short',
							day: 'numeric',
							year: 'numeric'
						});
					},
					label: (item) => {
						const point = item.raw as MachinePoint;
						const revision = point.revision ? ` (${point.revision.slice(0, 8)})` : '';
						const task = point.jobId ? ' [click for task]' : '';
						const value = Math.round(point.y * 100) / 100;
						return `${point.machineName}: ${value}${revision}${task}`;
					}
				}
			}
		},
		scales: {
			x: {
				type: 'time',
				min: bounds?.xMin,
				max: bounds?.xMax,
				time: { unit: 'day', tooltipFormat: 'MMM dd, yyyy' },
				title: { display: true, text: 'Date' }
			},
			y: {
				beginAtZero: false,
				min: bounds?.yMin,
				max: bounds?.yMax,
				title: {
					display: true,
					text: lowerIsBetter(test) ? 'Time (ms)' : 'Score (Higher is better)'
				}
			}
		}
	} as ChartOptions<'scatter'>;
}
