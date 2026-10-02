/**
 * URL state for the Navigation Benchmark route.
 *
 * Same shape as Android's, minus the parameters the page does not have: there
 * is no repository choice (autoland only) and no replicates toggle. The open
 * recording needs a group as well as a replicate, because one job's archive
 * holds a set per site and scenario.
 */
import { normalizeParams } from '$lib/param-aliases';
import { bool, parseState, patchUrl, str } from '$lib/url-state';
import { rangeField } from '$lib/speedometer/config';
import { DEFAULT_PLATFORM, OVERALL_TEST, PLATFORM_KEYS } from './config';

export const navBenchSchema = {
	os: str(DEFAULT_PLATFORM, PLATFORM_KEYS),
	/**
	 * Not restricted to a list: the per-site tests are discovered from the
	 * signature list, so the schema cannot know them. An unknown value simply
	 * charts nothing, which is the honest outcome for a link to a site that has
	 * been removed from the benchmark.
	 */
	test: str(OVERALL_TEST),
	range: rangeField(),
	/** Treeherder job whose recordings are open. Empty means none. */
	job: str(''),
	/** Which site and scenario within that job's archive. */
	group: str(''),
	replicate: str(''),
	/** Whether the per-site charts below the table are expanded. */
	subtestCharts: bool(false),

	sort: str(''),
	dir: str('desc', ['asc', 'desc'] as const)
};

export interface NavBenchState {
	os: string;
	test: string;
	range: number;
	job: string;
	group: string;
	replicate: string;
	subtestCharts: boolean;
	sort: string;
	dir: 'asc' | 'desc';
}

function normalizePageParams(url: URL): URL {
	return normalizeParams(url, { rename: { subtest: 'test' } });
}

export function parseNavBenchState(url: URL): NavBenchState {
	return parseState(navBenchSchema, normalizePageParams(url)) as NavBenchState;
}

export function navBenchHref(url: URL, patch: Partial<NavBenchState>): string {
	return patchUrl(navBenchSchema, normalizePageParams(url), patch);
}

/**
 * A patch that also closes the recordings panel.
 *
 * Applied by everything that changes which points are on the chart, so the open
 * job cannot outlive the data it came from.
 */
export function withVideoClosed(patch: Partial<NavBenchState>): Partial<NavBenchState> {
	return { ...patch, job: '', group: '', replicate: '' };
}

export function openJobId(state: NavBenchState): number | null {
	if (state.job === '') return null;
	const jobId = Number(state.job);
	return Number.isInteger(jobId) && jobId > 0 ? jobId : null;
}

/** The selected replicate, clamped to what the chosen group actually holds. */
export function openReplicateIndex(state: NavBenchState, count: number): number {
	const index = Number(state.replicate);
	return Number.isInteger(index) && index >= 0 && index < count ? index : 0;
}
