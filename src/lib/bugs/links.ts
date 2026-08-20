const BUGLIST = 'https://bugzilla.mozilla.org/buglist.cgi';

export function bugUrl(id: number): string {
	return `https://bugzilla.mozilla.org/show_bug.cgi?id=${id}`;
}

/** Open bugs with any performance impact rating other than "none". */
function ratedQuery(): URLSearchParams {
	const params = new URLSearchParams();
	params.set('query_format', 'advanced');
	params.set('bug_status', '__open__');
	params.set('f1', 'cf_performance_impact');
	params.set('o1', 'isnotempty');
	params.set('f3', 'cf_performance_impact');
	params.set('o3', 'notequals');
	params.set('v3', 'none');
	return params;
}

export function ratedByOperatingSystem(opSys: string): string {
	const params = ratedQuery();
	params.set('op_sys', opSys);
	return `${BUGLIST}?${params}`;
}

export function ratedByComponent(component: string): string {
	const params = ratedQuery();
	params.set('component', component);
	return `${BUGLIST}?${params}`;
}

export function highImpactByComponent(component: string): string {
	const params = new URLSearchParams();
	params.set('query_format', 'advanced');
	params.set('bug_status', '__open__');
	params.set('f1', 'cf_performance_impact');
	params.set('o1', 'equals');
	params.set('v1', 'high');
	params.set('component', component);
	return `${BUGLIST}?${params}`;
}

/**
 * Bugs carrying a given `perf:` keyword, or -- for `unspecified` -- rated bugs
 * carrying none.
 */
export function byPerfKeyword(keyword: string): string {
	if (keyword === 'unspecified') {
		const params = new URLSearchParams();
		params.set('query_format', 'advanced');
		params.set('bug_status', '__open__');
		params.set('f1', 'keywords');
		params.set('o1', 'notsubstring');
		params.set('v1', 'perf:');
		params.set('f2', 'cf_performance_impact');
		params.set('o2', 'isnotempty');
		params.set('f3', 'cf_performance_impact');
		params.set('o3', 'notequals');
		params.set('v3', 'none');
		return `${BUGLIST}?${params}`;
	}

	const params = new URLSearchParams();
	params.set('query_format', 'advanced');
	params.set('bug_status', '__open__');
	params.set('f1', 'keywords');
	params.set('o1', 'substring');
	params.set('v1', `perf:${keyword}`);
	params.set('f2', 'cf_performance_impact');
	params.set('o2', 'isnotempty');
	params.set('f3', 'cf_performance_impact');
	params.set('o3', 'notequals');
	params.set('v3', 'none');
	return `${BUGLIST}?${params}`;
}

/**
 * The saved "Performance Triage" search, which the untriaged slice links to.
 *
 * Kept verbatim rather than rebuilt: it is a hand-tuned boolean-chart query
 * (nested OP/CP groups with j_top=OR) that the triage team maintains, and
 * reconstructing it from parts would invite drift.
 */
export const UNTRIAGED_QUERY =
	`${BUGLIST}?query_based_on=Performance%20Triage&query_format=advanced&resolution=---` +
	'&f1=OP&f2=cf_performance_impact&o2=equals&v2=%3F&f3=CP&f4=OP&f5=product&o5=equals&v5=Core' +
	'&f6=component&o6=equals&v6=Performance&f7=keywords&o7=notsubstring&v7=meta' +
	'&f8=cf_performance_impact&o8=isempty&f9=CP&f10=OP&f11=cf_performance_impact&o11=equals' +
	'&v11=pending-needinfo&f12=flagtypes.name&o12=notsubstring&v12=needinfo&f13=CP&j_top=OR' +
	'&order=Bug%20Number&include_fields=id&include_fields=summary&include_fields=status';

/** Open bugs at a given impact level. */
export function byImpact(impact: 'high' | 'medium' | 'low' | 'pending-needinfo'): string {
	const params = new URLSearchParams();
	params.set('query_format', 'advanced');
	params.set('bug_status', '__open__');
	params.set('f1', 'cf_performance_impact');
	params.set('o1', 'equals');
	params.set('v1', impact);
	return `${BUGLIST}?${params}`;
}

/**
 * The per-component triage queues linked from the counters at the top of the
 * page: unrated open bugs in one Performance component, plus those whose
 * needinfo has been answered.
 */
export function triageQueue(component: string, queryName?: string): string {
	const params = new URLSearchParams();
	if (queryName) params.set('query_based_on', queryName);
	params.set('query_format', 'advanced');
	params.set('resolution', '---');
	// Group 1: unrated bugs in the component.
	params.append('f1', 'OP');
	params.append('f2', 'product');
	params.append('o2', 'equals');
	params.append('v2', 'Core');
	params.append('f3', 'component');
	params.append('o3', 'equals');
	params.append('v3', component);
	params.append('f4', 'keywords');
	params.append('o4', 'notsubstring');
	params.append('v4', 'meta');
	params.append('f5', 'cf_performance_impact');
	params.append('o5', 'isempty');
	params.append('f6', 'CP');
	// Group 2: pending-needinfo bugs whose needinfo flag has been cleared.
	params.append('f7', 'OP');
	params.append('f8', 'product');
	params.append('o8', 'equals');
	params.append('v8', 'Core');
	params.append('f9', 'component');
	params.append('o9', 'equals');
	params.append('v9', component);
	params.append('f10', 'cf_performance_impact');
	params.append('o10', 'equals');
	params.append('v10', 'pending-needinfo');
	params.append('f11', 'flagtypes.name');
	params.append('o11', 'notsubstring');
	params.append('v11', 'needinfo');
	params.append('f12', 'CP');
	params.set('j_top', 'OR');
	params.set('order', 'Bug Number');
	return `${BUGLIST}?${params}`;
}
