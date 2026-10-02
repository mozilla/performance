/**
 * JetStream 3 dashboard configuration.
 *
 * The suite name is `jetstream3` even though the page and the data file are
 * still called "jetstream"; both are load-bearing and neither can be renamed
 * from here.
 */
import { FRAMEWORK } from '$lib/api/treeherder';

export const JETSTREAM_FRAMEWORK = FRAMEWORK.browsertime;
export const JETSTREAM_SUITE = 'jetstream3';

export const SCORE_TEST = 'score';

export interface JetStreamPlatform {
	key: string;
	label: string;
	platforms: string[];
	/** As in the Speedometer config: where Safari runs now, if elsewhere. */
	safariPlatform?: string;
}

export const PLATFORMS: readonly JetStreamPlatform[] = [
	{
		key: 'osx',
		label: 'Mac',
		platforms: ['macosx1500-aarch64-shippable'],
		// Safari and Safari TP run on a dedicated macOS 27 pool (Bug 2075598).
		safariPlatform: 'macosx2700-aarch64-shippable'
	},
	{
		key: 'windows',
		label: 'Windows 11',

		platforms: ['windows11-64-24h2-shippable', 'windows11-64-shippable-qr']
	},
	{ key: 'linux', label: 'Linux', platforms: ['linux2404-64-shippable'] },
	{
		key: 'android-a55',
		label: 'Android (A55)',
		platforms: ['android-hw-a55-14-0-aarch64-shippable']
	}
];

export const PLATFORM_KEYS = PLATFORMS.map((p) => p.key);
export const DEFAULT_PLATFORM = 'osx';

export function platformByKey(key: string): JetStreamPlatform {
	return PLATFORMS.find((p) => p.key === key) ?? PLATFORMS[0];
}

/** JetStream reports a score, where higher is better, for every test. */
export function lowerIsBetter(): boolean {
	return false;
}

export function displayName(test: string): string {
	return test === SCORE_TEST ? 'Overall Score' : test;
}
