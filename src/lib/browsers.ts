import type { Measurement } from './api/treeherder';

export type BrowserKey =
	| 'firefox-release'
	| 'firefox'
	| 'firefox-nar'
	| 'firefox-a11y'
	| 'chrome'
	| 'car'
	| 'safari'
	| 'safari-tp';

export interface BrowserDef {
	key: BrowserKey;
	label: string;

	/** Hue follows the vendor: warm for Firefox, green and blue for Chrome, grey for Safari. */
	color: string;
	matches(measurement: Measurement): boolean;
}

const isFirefoxFamily = (m: Measurement) =>
	m.application === 'firefox' || m.application === 'fenix';

/** Instrumented or otherwise non-comparable variants of the base Firefox job. */
const isVariant = (m: Measurement) => m.extraOptions.includes('nova');

/**
 * Runs with the accessibility service enabled, told apart by suite name, e.g.
 * `nav-bench-a11y-overall`. Their own series, not the base Firefox job's.
 */
const isAccessibility = (m: Measurement) => m.suite.split(/[-.]/).includes('a11y');

/**
 * Safari and Safari TP. On Mac they run on a different machine pool from
 * Firefox, so the data layer needs to tell them apart before classifying
 * measurements (see `safariPlatform` in the platform configs).
 */
export const isSafariApplication = (application: string | undefined) =>
	application === 'safari' || application === 'safari-tp';

const isNightlyAsRelease = (m: Measurement) => m.platform.includes('nightlyasrelease');

/** Firefox Release runs on the same shippable platforms, in its own repository. */
const isRelease = (m: Measurement) => m.repository === 'mozilla-release';

export const BROWSERS: readonly BrowserDef[] = [
	{
		key: 'firefox',
		label: 'Nightly',
		color: '#FF9500',
		matches: (m) =>
			isFirefoxFamily(m) &&
			!isRelease(m) &&
			!isNightlyAsRelease(m) &&
			!isVariant(m) &&
			!isAccessibility(m)
	},
	{
		key: 'firefox-nar',
		label: 'Nightly-as-Release',
		color: '#c42b00',
		matches: (m) =>
			isFirefoxFamily(m) &&
			!isRelease(m) &&
			isNightlyAsRelease(m) &&
			!isVariant(m) &&
			!isAccessibility(m)
	},
	{
		key: 'firefox-release',
		label: 'Firefox Release',
		color: '#fff01f',
		matches: (m) => isFirefoxFamily(m) && isRelease(m) && !isVariant(m) && !isAccessibility(m)
	},
	{
		// Shippable Nightly only: there is no Nightly-as-Release or Release
		// accessibility job, and should one appear it would need a series of its own.
		key: 'firefox-a11y',
		label: 'Nightly (a11y)',
		color: '#8a3ffc',
		matches: (m) =>
			isFirefoxFamily(m) &&
			isAccessibility(m) &&
			!isRelease(m) &&
			!isNightlyAsRelease(m) &&
			!isVariant(m)
	},
	{
		key: 'chrome',
		label: 'Chrome',
		color: '#1DA462',
		matches: (m) => m.application === 'chrome' || m.application === 'chrome-m'
	},
	{
		key: 'car',
		label: 'Chromium-as-Release',
		color: '#2773da',
		matches: (m) => m.application === 'custom-car' || m.application === 'cstm-car-m'
	},
	{
		key: 'safari',
		label: 'Safari',
		color: '#444444',
		matches: (m) => m.application === 'safari'
	},
	{
		key: 'safari-tp',
		label: 'Safari TP',
		color: '#777777',
		matches: (m) => m.application === 'safari-tp'
	}
];

export const BROWSER_KEYS = BROWSERS.map((b) => b.key);

export function browserByKey(key: string): BrowserDef | undefined {
	return BROWSERS.find((b) => b.key === key);
}

/** The browser a measurement belongs to, or undefined if it matches none. */
export function classify(measurement: Measurement): BrowserDef | undefined {
	return BROWSERS.find((b) => b.matches(measurement));
}

export function groupByBrowser(
	measurements: readonly Measurement[]
): Array<{ browser: BrowserDef; measurements: Measurement[] }> {
	const groups = new Map<BrowserKey, Measurement[]>();

	for (const measurement of measurements) {
		const browser = classify(measurement);
		if (!browser) continue;
		const existing = groups.get(browser.key);
		if (existing) {
			existing.push(measurement);
		} else {
			groups.set(browser.key, [measurement]);
		}
	}

	return BROWSERS.filter((b) => groups.has(b.key)).map((browser) => ({
		browser,
		measurements: groups.get(browser.key)!
	}));
}
