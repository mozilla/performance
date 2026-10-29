import type { ChartAnnotation } from '$lib/annotations';
import { FRAMEWORK } from '$lib/api/treeherder';
import { PLATFORMS, type PlatformConfig } from '$lib/speedometer/config';

export const NAVBENCH_SUITE = 'nav-bench-overall';
export const NAVBENCH_FRAMEWORK = FRAMEWORK.browsertime;

export const NAVBENCH_REPOSITORY = 'autoland' as const;

/**
 * The platforms the benchmark runs on, from the shared platform table. Android
 * runs the mobile variant (nav-bench-m) in Fenix, which reports under the same
 * suite name.
 */
const NAVBENCH_PLATFORM_KEYS = ['linux', 'osxm4', 'windows', 'windows-hwref', 'android-a55'];

export const NAVBENCH_PLATFORMS: readonly PlatformConfig[] = PLATFORMS.filter((platform) =>
	NAVBENCH_PLATFORM_KEYS.includes(platform.key)
);

export const PLATFORM_KEYS = NAVBENCH_PLATFORMS.map((platform) => platform.key);
export const DEFAULT_PLATFORM = 'osxm4';

export function platformByKey(key: string): PlatformConfig {
	return (
		NAVBENCH_PLATFORMS.find((platform) => platform.key === key) ??
		NAVBENCH_PLATFORMS.find((platform) => platform.key === DEFAULT_PLATFORM)!
	);
}

export const OVERALL_TEST = 'overall';

/** Treeherder's spelling of a test name, given ours. */
export function signatureTest(test: string): string | undefined {
	return test === OVERALL_TEST ? undefined : test;
}

/** Ours, given Treeherder's. */
export function testKey(signatureTestName: string | undefined): string {
	return signatureTestName === undefined || signatureTestName === ''
		? OVERALL_TEST
		: signatureTestName;
}

const SITE_LABELS: Record<string, string> = {
	amazon: 'Amazon',
	bbc: 'BBC',
	duckduckgo: 'DuckDuckGo',
	facebook: 'Facebook',
	google: 'Google',
	'google-docs': 'Google Docs',
	reddit: 'Reddit',
	wikipedia: 'Wikipedia',
	yahoo: 'Yahoo'
};

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/**
 * A test's site and scenario: `google-docs` and `warm` from
 * `google-docs-nav-warm-score`.
 *
 * Split at `-nav-` rather than at the first hyphen, so a hyphenated site name
 * stays together.
 */
function parseTest(test: string): { site: string; scenario?: string } {
	const name = test.replace(/-score$/, '');
	const split = name.indexOf('-nav-');
	return split === -1
		? { site: name }
		: { site: name.slice(0, split), scenario: name.slice(split + '-nav-'.length) };
}

const siteLabel = (site: string) => SITE_LABELS[site] ?? site.split('-').map(capitalize).join(' ');

/**
 * `BBC nav subnav` from `bbc-nav-subnav-score`.
 *
 * Every test in this suite is a score, so the suffix carries no information in
 * a table whose header already says so.
 */
export function displayName(test: string): string {
	if (test === OVERALL_TEST) return 'Overall Score';

	const { site, scenario } = parseTest(test);
	return scenario === undefined ? siteLabel(site) : `${siteLabel(site)} nav ${scenario}`;
}

/** The sites among these tests, labelled and alphabetical. */
export function sitesIn(tests: readonly string[]): string[] {
	const sites = new Set(
		tests.filter((test) => test !== OVERALL_TEST).map((test) => siteLabel(parseTest(test).site))
	);
	return [...sites].sort((a, b) => a.localeCompare(b));
}

const SCENARIO_LABELS: Record<string, string> = {
	load: 'page load',
	subnav: 'sub-navigation',
	warm: 'warm-load'
};

/** The scenarios among these tests, in prose, in the order above. */
export function scenariosIn(tests: readonly string[]): string[] {
	const scenarios = new Set(
		tests.flatMap((test) => {
			const { scenario } = parseTest(test);
			return test === OVERALL_TEST || scenario === undefined ? [] : [scenario];
		})
	);
	const known = Object.keys(SCENARIO_LABELS);
	return [...scenarios]
		.sort((a, b) => {
			const rank = (scenario: string) =>
				known.includes(scenario) ? known.indexOf(scenario) : known.length;
			return rank(a) - rank(b) || a.localeCompare(b);
		})
		.map((scenario) => SCENARIO_LABELS[scenario] ?? scenario);
}

/** `a, b and c`, matching the explainer's house style (no serial comma). */
export function proseList(items: readonly string[]): string {
	return items.length <= 1
		? (items[0] ?? '')
		: `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * Events worth calling out on the charts, drawn as dashed markers.
 *
 * `date` is the autoland push time. `tests` limits an annotation to the charts
 * of those tests, and `platforms` to those platform keys; without them, the
 * annotation appears on every chart.
 */
export interface NavBenchAnnotation extends ChartAnnotation {
	tests?: readonly string[];
	platforms?: readonly string[];
}

export const NAVBENCH_ANNOTATIONS: readonly NavBenchAnnotation[] = [
	{
		date: '2026-10-08T21:44:57Z',
		label: 'Bug 2073531',
		description:
			'mitmproxy playback switched from proxy to direct mode; connections now include TLS and direct-connection network optimizations',
		url: 'https://bugzilla.mozilla.org/show_bug.cgi?id=2073531'
	},
	{
		date: '2026-09-03T16:54:43Z',
		label: 'Bug 2043896',
		description:
			'Added google, facebook, yahoo and google-docs to the benchmark; overall score is now a geomean over more sites',
		url: 'https://bugzilla.mozilla.org/show_bug.cgi?id=2043896'
	},
	{
		date: '2026-07-01T20:28:07Z',
		label: 'Bug 2050165',
		description: 'Cleaned up nav-bench output data and fixed annotated videos on Windows',
		url: 'https://bugzilla.mozilla.org/show_bug.cgi?id=2050165',
		platforms: ['windows', 'windows-hwref']
	}
];

/** The annotations to draw on one test's chart on one platform. */
export function annotationsFor(
	test: string,
	platform: string,
	annotations: readonly NavBenchAnnotation[] = NAVBENCH_ANNOTATIONS
): ChartAnnotation[] {
	return annotations.filter(
		(annotation) =>
			(!annotation.tests || annotation.tests.includes(test)) &&
			(!annotation.platforms || annotation.platforms.includes(platform))
	);
}

export function videoScenario(test: string): string | undefined {
	return test === OVERALL_TEST ? undefined : test.replace(/-score$/, '');
}
