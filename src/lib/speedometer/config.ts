import { FRAMEWORK } from '$lib/api/treeherder';
import type { Field } from '$lib/url-state';

export const SPEEDOMETER_FRAMEWORK = FRAMEWORK.browsertime;
export const SPEEDOMETER_SUITE = 'speedometer3';

/** The overall score, charted and tabulated alongside the subtests. */
export const SCORE_TEST = 'score';

/** The 20 subtests, in display order. */
export const SUBTESTS = [
	'Charts-chartjs/total',
	'Charts-observable-plot/total',
	'Editor-CodeMirror/total',
	'Editor-TipTap/total',
	'NewsSite-Next/total',
	'NewsSite-Nuxt/total',
	'Perf-Dashboard/total',
	'React-Stockcharts-SVG/total',
	'TodoMVC-Angular-Complex-DOM/total',
	'TodoMVC-Backbone/total',
	'TodoMVC-JavaScript-ES5/total',
	'TodoMVC-JavaScript-ES6-Webpack-Complex-DOM/total',
	'TodoMVC-jQuery/total',
	'TodoMVC-Lit-Complex-DOM/total',
	'TodoMVC-Preact-Complex-DOM/total',
	'TodoMVC-React-Complex-DOM/total',
	'TodoMVC-React-Redux/total',
	'TodoMVC-Svelte-Complex-DOM/total',
	'TodoMVC-Vue/total',
	'TodoMVC-WebComponents/total'
] as const;

/** Everything shown in the breakdown table: subtests, then the overall score. */
export const ALL_TESTS: readonly string[] = [...SUBTESTS, SCORE_TEST];

export interface PlatformConfig {
	key: string;
	label: string;
	/** Treeherder machine_platform values; usually the shippable + NaR pair. */
	platforms: string[];
	supportsSafari: boolean;
	/**
	 * Where Safari runs now, when that is not one of `platforms`. Safari's
	 * history stays on the old platform, so both are charted, but only this one
	 * feeds the breakdown table.
	 */
	safariPlatform?: string;
	/** Laid out as two rows in the picker, desktop then mobile. */
	group: 'desktop' | 'mobile';
}

export const PLATFORMS: readonly PlatformConfig[] = [
	{
		key: 'windows',
		label: 'Windows 11',
		platforms: ['windows11-64-24h2-nightlyasrelease', 'windows11-64-24h2-shippable'],
		supportsSafari: false,
		group: 'desktop'
	},
	{
		key: 'windows-hwref',
		label: 'Windows 11 (ref)',
		platforms: ['windows11-64-24h2-hw-ref-nightlyasrelease', 'windows11-64-24h2-hw-ref-shippable'],
		supportsSafari: false,
		group: 'desktop'
	},
	{
		key: 'linux',
		label: 'Linux',
		platforms: ['linux2404-64-nightlyasrelease', 'linux2404-64-shippable'],
		supportsSafari: false,
		group: 'desktop'
	},
	{
		key: 'osxm4',
		label: 'Mac',
		platforms: ['macosx1500-aarch64-nightlyasrelease', 'macosx1500-aarch64-shippable'],
		supportsSafari: true,
		// Safari and Safari TP run on a dedicated macOS 27 pool (Bug 2075598).
		safariPlatform: 'macosx2700-aarch64-shippable',
		group: 'desktop'
	},
	{
		key: 'android-s24',
		label: 'Android (S24)',
		platforms: ['android-hw-s24-14-0-aarch64-shippable'],
		supportsSafari: false,
		group: 'mobile'
	},
	{
		key: 'android-a55',
		label: 'Android (A55)',
		platforms: ['android-hw-a55-14-0-aarch64-shippable'],
		supportsSafari: false,
		group: 'mobile'
	},
	{
		key: 'android-p6',
		label: 'Android (P6)',
		platforms: ['android-hw-p6-13-0-aarch64-shippable'],
		supportsSafari: false,
		group: 'mobile'
	}
];

export const DEFAULT_PLATFORM = 'osxm4';

export const PLATFORM_KEYS = PLATFORMS.map((p) => p.key);

export function platformByKey(key: string): PlatformConfig {
	return PLATFORMS.find((p) => p.key === key) ?? PLATFORMS.find((p) => p.key === DEFAULT_PLATFORM)!;
}

/** Time ranges offered by the range picker, in days. */
export const RANGES = [
	{ days: 7, label: '1 week' },
	{ days: 30, label: '1 month' },
	{ days: 90, label: '3 months' },
	{ days: 365, label: '1 year' }
] as const;

export const RANGE_DAYS = RANGES.map((r) => r.days);
export const DEFAULT_RANGE = 90;

/** Range labels accepted alongside day counts. */
export const RANGE_ALIASES: Record<string, number> = {
	week: 7,
	'1month': 30,
	'3months': 90,
	year: 365
};

/** JetStream also accepts month counts 1 and 3, and all for a year. */
export const JETSTREAM_RANGE_ALIASES: Record<string, number> = {
	all: 365,
	'1': 30,
	'3': 90
};

/** Parse supported days or aliases; serialize days, omitting the page default. */
export function rangeField(
	defaultDays: number = DEFAULT_RANGE,
	aliases: Record<string, number> = RANGE_ALIASES
): Field<number> {
	return {
		default: defaultDays,
		parse(raw) {
			if (raw === null) return defaultDays;
			const fromAlias = aliases[raw];
			if (fromAlias !== undefined) return fromAlias;
			const days = Number(raw);
			return (RANGE_DAYS as readonly number[]).includes(days) ? days : defaultDays;
		},
		serialize: (days) => (days === defaultDays ? null : String(days))
	};
}

/** Is a lower number better for this test? Only the overall score is inverted. */
export function lowerIsBetter(test: string): boolean {
	return test !== SCORE_TEST;
}

export function displayName(test: string): string {
	return test === SCORE_TEST ? 'Overall Score' : test.replace('/total', '');
}

export function unitFor(test: string): string {
	return test === SCORE_TEST ? '' : ' ms';
}
