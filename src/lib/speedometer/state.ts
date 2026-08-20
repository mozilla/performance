import type { Repository } from '$lib/api/treeherder';
import { normalizeParams } from '$lib/param-aliases';
import { bool, parseState, patchUrl, str, stringSet } from '$lib/url-state';
import { DEFAULT_PLATFORM, PLATFORM_KEYS, rangeField, SCORE_TEST } from './config';

const REPOSITORIES: readonly Repository[] = ['mozilla-central', 'autoland'];

/** What differs between the URL schemas of the pages built on this one. */
export interface SchemaDefaults {
	os: string;
	platformKeys: readonly string[];
	/** The test charted when the URL names none. */
	test: string;
	repository: Repository;
}

export function speedometerSchemaFor(defaults: SchemaDefaults) {
	return {
		os: str(defaults.os, defaults.platformKeys),
		subtest: str(defaults.test),
		range: rangeField(),
		repository: str(defaults.repository, REPOSITORIES),
		replicates: bool(false),

		alerts: bool(false),
		/** Series labels the user has hidden by clicking the legend. */
		hide: stringSet(),
		/** Whether the per-subtest charts are expanded. */
		subtestCharts: bool(false),
		/** Job Debug: selected browser. Empty means "first with data". */
		browser: str(''),
		/** Job Debug: isolated machine. Empty means "all machines". */
		machine: str(''),

		sort: str(''),
		dir: str('desc', ['asc', 'desc'] as const)
	};
}

export type SpeedometerSchema = ReturnType<typeof speedometerSchemaFor>;

export const speedometerSchema: SpeedometerSchema = speedometerSchemaFor({
	os: DEFAULT_PLATFORM,
	platformKeys: PLATFORM_KEYS,
	test: SCORE_TEST,
	repository: 'mozilla-central'
});

export type SpeedometerState = {
	os: string;
	subtest: string;
	range: number;
	repository: Repository;
	replicates: boolean;
	alerts: boolean;
	hide: ReadonlySet<string>;
	subtestCharts: boolean;
	browser: string;
	machine: string;
	sort: string;
	dir: 'asc' | 'desc';
};

function normalizePageParams(url: URL): URL {
	return normalizeParams(url, { rename: { repo: 'repository' } });
}

export function parseSpeedometerState(
	url: URL,
	schema: SpeedometerSchema = speedometerSchema
): SpeedometerState {
	return parseState(schema, normalizePageParams(url)) as SpeedometerState;
}

/** URL for the current view with `patch` applied and everything else kept. */
export function speedometerHref(
	url: URL,
	patch: Partial<SpeedometerState>,
	schema: SpeedometerSchema = speedometerSchema
): string {
	return patchUrl(schema, normalizePageParams(url), patch);
}

/** Toggle one series label in the hidden set. */
export function toggleHidden(hidden: ReadonlySet<string>, label: string): Set<string> {
	const next = new Set(hidden);
	if (!next.delete(label)) next.add(label);
	return next;
}
