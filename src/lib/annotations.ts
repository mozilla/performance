export interface ChartAnnotation {
	/** ISO date or timestamp; for a code change, the push time. */
	date: string;
	label: string;
	description?: string;
	url?: string;
}

export interface AnnotationStyle {
	color: string;
	lineWidth: number;
	lineDash: number[];
	labelFontSize: number;
	labelPadding: number;
	/**
	 * Where the label sits on the line: `start` is the bottom of the chart
	 * area, `end` the top. Staggered labels move away from that edge, so they
	 * stay inside the chart area either way.
	 */
	labelPosition: 'start' | 'end';
	/** Annotations closer together than this are staggered so labels do not overlap. */
	clusterWindowDays: number;
	staggerStepPx: number;
	staggerLevels: number;
	/** Show an annotation in the tooltip when the hovered point is within this many days. */
	tooltipMatchDays: number;
}

export const DEFAULT_ANNOTATION_STYLE: AnnotationStyle = {
	color: '#ff6384',
	lineWidth: 2,
	lineDash: [5, 5],
	labelFontSize: 9,
	labelPadding: 3,
	labelPosition: 'end',
	clusterWindowDays: 14,
	staggerStepPx: 22,
	staggerLevels: 3,
	tooltipMatchDays: 1
};

const DAY_MS = 24 * 60 * 60 * 1000;

type LabelElement = { getProps(keys: string[], final: boolean): Record<string, number> };

/**
 * Chart.js annotation-plugin line configs, keyed `annotation-<n>`, with labels
 * staggered so that annotations falling close together do not overlap.
 */
export function buildAnnotationLines(
	annotations: readonly ChartAnnotation[],
	overrides: Partial<AnnotationStyle> = {}
): Record<string, object> {
	const style = { ...DEFAULT_ANNOTATION_STYLE, ...overrides };
	const clusterWindowMs = style.clusterWindowDays * DAY_MS;
	// Away from the edge the label is anchored to: up from the bottom, down from the top.
	const direction = style.labelPosition === 'start' ? -1 : 1;

	const sorted = annotations
		.map((annotation) => ({ annotation, time: Date.parse(annotation.date) }))
		.filter((entry) => !Number.isNaN(entry.time))
		.sort((a, b) => a.time - b.time);

	const out: Record<string, object> = {};
	let level = 0;
	let previous: number | null = null;

	sorted.forEach(({ annotation, time }, index) => {
		level =
			previous !== null && time - previous < clusterWindowMs
				? (level + 1) % style.staggerLevels
				: 0;
		previous = time;

		out[`annotation-${index}`] = {
			type: 'line',
			xMin: time,
			xMax: time,
			borderColor: style.color,
			borderWidth: style.lineWidth,
			borderDash: style.lineDash,
			label: {
				display: true,
				content: annotation.label,
				position: style.labelPosition,
				// level 0 written as 0 rather than -(0 * step), which is -0.
				yAdjust: level === 0 ? 0 : direction * level * style.staggerStepPx,
				backgroundColor: style.color,
				color: 'white',
				font: { size: style.labelFontSize },
				padding: style.labelPadding
			},
			click: annotation.url
				? (ctx: { element?: { label?: LabelElement } }, event: { x: number; y: number }) => {
						// The plugin fires click for every annotation whose label
						// overlaps the click's row/column, so only open when the
						// click is actually inside THIS label's box.
						const label = ctx.element?.label;
						if (!label) return;
						const { x, y, x2, y2 } = label.getProps(['x', 'y', 'x2', 'y2'], true);
						if (event.x >= x && event.x <= x2 && event.y >= y && event.y <= y2) {
							window.open(annotation.url, '_blank', 'noopener');
						}
					}
				: undefined,
			enter: (ctx: { chart: { canvas: HTMLCanvasElement } }) => {
				ctx.chart.canvas.title = annotation.description
					? `${annotation.label}: ${annotation.description}`
					: annotation.label;
				ctx.chart.canvas.style.cursor = annotation.url ? 'pointer' : 'default';
			},
			leave: (ctx: { chart: { canvas: HTMLCanvasElement } }) => {
				ctx.chart.canvas.title = '';
				ctx.chart.canvas.style.cursor = 'default';
			}
		};
	});

	return out;
}

/**
 * Tooltip lines for the annotations near a hovered point, so a step in the
 * data can be read against its cause without finding the marker.
 */
export function annotationTooltipLines(
	annotations: readonly ChartAnnotation[],
	time: number,
	overrides: Partial<AnnotationStyle> = {}
): string[] {
	const windowMs = { ...DEFAULT_ANNOTATION_STYLE, ...overrides }.tooltipMatchDays * DAY_MS;
	return annotations
		.filter((annotation) => Math.abs(Date.parse(annotation.date) - time) < windowMs)
		.map((annotation) => `${annotation.label}: ${annotation.description ?? ''}`);
}

/**
 * Drop annotations older than the charted window.
 *
 * The annotation plugin extends the x axis to reach every annotation, so a
 * marker from last month turns a one-week chart into a five-week one with the
 * data squeezed into the right-hand edge. Speedometer's alert markers have
 * the same problem and the same fix, `markersWithinDays`.
 */
export function annotationsWithinDays<T extends ChartAnnotation>(
	annotations: readonly T[],
	days: number,
	now: number = Date.now()
): T[] {
	const cutoff = now - days * DAY_MS;
	return annotations.filter((annotation) => Date.parse(annotation.date) >= cutoff);
}
