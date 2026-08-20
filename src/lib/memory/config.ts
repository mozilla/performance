export type Channel = 'release' | 'nightly';

export const CHANNEL_URLS: Record<Channel, string> = {
	release:
		'https://sql.telemetry.mozilla.org/api/queries/121394/results.csv?api_key=5gDtV1iViwoLiW3Wd7Y86CfQN9jFt7cyJLZNzoLE',
	nightly:
		'https://sql.telemetry.mozilla.org/api/queries/121393/results.csv?api_key=kX8yzQ8ns6mGFUUme5KpuRyRn1JQtB8fYFHXGLYN'
};

export const CHANNELS: Channel[] = ['release', 'nightly'];

export interface Probe {
	key: string;
	title: string;
	unit: string;
	axis: string;
	p75: string;
	p95: string;
}

export interface Section {
	title: string;
	probes: Probe[];
}

/**
 * Probes shown simultaneously, grouped into sections. To add a probe: add its
 * columns to the STMO query, then add one entry here -- its chart is generated
 * automatically.
 */
export const SECTIONS: Section[] = [
	{
		title: 'Memory',
		probes: [
			{
				key: 'resident_peak',
				title: 'Resident Peak',
				unit: 'MB',
				axis: 'Peak RSS (MB)',
				p75: 'resident_peak_p75_mb',
				p95: 'resident_peak_p95_mb'
			},
			{
				key: 'js_gc_heap',
				title: 'JS GC Heap',
				unit: 'MB',
				axis: 'JS GC Heap (MB)',
				p75: 'js_gc_heap_p75_mb',
				p95: 'js_gc_heap_p95_mb'
			},
			{
				key: 'memory_unique',
				title: 'Unique Memory',
				unit: 'MB',
				axis: 'Unique (MB)',
				p75: 'memory_unique_p75_mb',
				p95: 'memory_unique_p95_mb'
			}
		]
	},
	{
		title: 'GC / CC',
		probes: [
			{
				key: 'javascript_gc_total_time',
				title: 'JS GC Total Time',
				unit: 'ms',
				axis: 'Total GC time (ms)',
				p75: 'javascript_gc_total_time_p75_ms',
				p95: 'javascript_gc_total_time_p95_ms'
			},
			{
				key: 'javascript_gc_max_pause',
				title: 'JS GC Max Pause',
				unit: 'ms',
				axis: 'Max GC pause (ms)',
				p75: 'javascript_gc_max_pause_p75_ms',
				p95: 'javascript_gc_max_pause_p95_ms'
			},
			{
				key: 'cycle_collector_full',
				title: 'Cycle Collector (Full)',
				unit: 'ms',
				axis: 'Full CC time (ms)',
				p75: 'cycle_collector_full_p75_ms',
				p95: 'cycle_collector_full_p95_ms'
			},
			{
				key: 'cycle_collector_max_pause',
				title: 'Cycle Collector Max Pause',
				unit: 'ms',
				axis: 'Max CC pause (ms)',
				p75: 'cycle_collector_max_pause_p75_ms',
				p95: 'cycle_collector_max_pause_p95_ms'
			}
		]
	}
];

export const ALL_PROBES: Probe[] = SECTIONS.flatMap((section) => section.probes);

/** The two percentile lines drawn for every probe. */
export const PERCENTILES = [
	{ field: 'p75', label: 'P75', color: '#0066cc' },
	{ field: 'p95', label: 'P95', color: '#cc0066' }
] as const;

export type PercentileField = (typeof PERCENTILES)[number]['field'];

export const PROCESS_LABELS: Record<string, string> = {
	default: 'Parent',
	tab: 'Content (tab)',
	extension: 'Extension',
	inference: 'Inference'
};

export const PROCESSES = Object.keys(PROCESS_LABELS);
export const DEFAULT_PROCESS = 'default';

/** Series key for the pooled (all-versions) rows. */
export const ALL = 'all';

/**
 * Share of a day's volume a major version needs before the release query emits
 * rows for it. Mirrors the threshold in queries/memory-desktop-release.sql --
 * keep the two in sync; it drives both the caption and the marker wording.
 */
export const MIN_SHARE_PCT = 10;

/** Only release ships per-version rows. */
export const VERSION_CHANNEL: Channel = 'release';

/**
 * Validated categorical palette (8 fixed slots, light surface). A version's
 * colour is slot (major % 8), so it is a property of the version itself:
 * version 141 keeps its colour as the rolling 6-month window moves and other
 * versions come and go. Consecutive majors land on consecutive slots, which is
 * the pairing the palette's ordering is validated for (worst adjacent CVD
 * dE 9.1 on white). Three slots sit below 3:1 contrast, so lines are also
 * labelled directly at their right-hand end -- see the versionEndLabels plugin.
 */
export const VERSION_COLORS = [
	'#2a78d6',
	'#eb6834',
	'#1baf7a',
	'#eda100',
	'#e87ba4',
	'#008300',
	'#4a3aa7',
	'#e34948'
];

export const versionColor = (version: string): string =>
	VERSION_COLORS[Number(version) % VERSION_COLORS.length];

/** Ink tokens: label text stays neutral, the colour sits in the swatch beside it. */
export const INK_SECONDARY = '#52514e';
export const SURFACE = '#ffffff';
