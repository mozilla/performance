import type { Repository } from '$lib/api/treeherder';
import { normalizeParams } from '$lib/param-aliases';
import { JETSTREAM_RANGE_ALIASES, rangeField } from '$lib/speedometer/config';
import { bool, parseState, patchUrl, str, stringSet } from '$lib/url-state';
import { DEFAULT_PLATFORM, PLATFORM_KEYS, SCORE_TEST } from './config';

const REPOSITORIES: readonly Repository[] = ['mozilla-central', 'autoland'];

export const jetStreamSchema = {
	os: str(DEFAULT_PLATFORM, PLATFORM_KEYS),
	/**
	 * Not restricted to a list: the tests come from the signature list, which
	 * changes with the benchmark. Same reasoning as navbench's `test`.
	 */
	test: str(SCORE_TEST),

	range: rangeField(365, JETSTREAM_RANGE_ALIASES),
	repository: str('mozilla-central', REPOSITORIES),
	alerts: bool(false),
	/**
	 * Annotate the score chart with alerts from every subtest, not just the
	 * charted one. Only meaningful on the overall score, which is where the page
	 * offers it.
	 */
	allAlerts: bool(false),
	/** Series labels hidden by clicking the chart legend. */
	hide: stringSet(),

	filter: str(''),

	sort: str(''),
	dir: str('desc', ['asc', 'desc'] as const)
};

export interface JetStreamState {
	os: string;
	test: string;
	range: number;
	repository: Repository;
	alerts: boolean;
	allAlerts: boolean;
	hide: ReadonlySet<string>;
	filter: string;
	sort: string;
	dir: 'asc' | 'desc';
}

function normalizePageParams(url: URL): URL {
	return normalizeParams(url, { rename: { repo: 'repository' } });
}

export function parseJetStreamState(url: URL): JetStreamState {
	return parseState(jetStreamSchema, normalizePageParams(url)) as JetStreamState;
}

export function jetStreamHref(url: URL, patch: Partial<JetStreamState>): string {
	return patchUrl(jetStreamSchema, normalizePageParams(url), patch);
}
