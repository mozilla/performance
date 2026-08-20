/**
 * The pre-baked Bugzilla snapshot published by mozilla/performance-data.
 *
 * A scheduled job in that repository runs the Bugzilla queries and commits the
 * result, so the dashboard reads one static JSON file rather than hitting the
 * Bugzilla REST API from every visitor's browser.
 */
import { fetchJson } from '$lib/api/http';

export const BUGZILLA_DATA_URL =
	'https://raw.githubusercontent.com/mozilla/performance-data/refs/heads/main/bugzilla-data-all.json';

export interface Bug {
	id: number;
	summary: string;
	component: string;
	severity: string;
	priority: string;
	status: string;
	/** Bugzilla leaves this null on some bugs. */
	op_sys: string | null;
	keywords: string[];
	creation_time: string;
	last_change_time: string;
}

/** The buckets in the published file, each a saved Bugzilla search. */
export type BugGroup =
	| 'high'
	| 'medium'
	| 'low'
	| 'untriaged'
	| 'needinfo'
	| 'regressions'
	| 'triageGeneral'
	| 'triageMemory'
	| 'triageNavigation'
	| 'triageResponsiveness'
	| 'triageStartup';

export type BugzillaData = Record<BugGroup, { bugs: Bug[] }>;

const EMPTY: { bugs: Bug[] } = { bugs: [] };

export async function fetchBugzillaData(signal?: AbortSignal): Promise<BugzillaData> {
	const raw = await fetchJson<Partial<BugzillaData>>(BUGZILLA_DATA_URL, { signal });

	const groups: BugGroup[] = [
		'high',
		'medium',
		'low',
		'untriaged',
		'needinfo',
		'regressions',
		'triageGeneral',
		'triageMemory',
		'triageNavigation',
		'triageResponsiveness',
		'triageStartup'
	];

	const out = {} as BugzillaData;
	for (const group of groups) {
		// A group can be missing if the upstream query was renamed; an empty
		// list is a better outcome than the whole page failing.
		out[group] = raw[group] ?? EMPTY;
	}
	return out;
}
