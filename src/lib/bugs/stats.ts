import type { Bug, BugzillaData } from './api';

export interface Slice {
	/** Raw value, e.g. the component name or the OS. */
	key: string;
	/** Value with its count, as shown in the chart legend. */
	label: string;
	count: number;
	/** Share of the total, 0-100, to two decimals. */
	percentage: number;
}

/** Bugs Bugzilla left without an OS. */
export const UNSPECIFIED = 'Unspecified';

/** Bugs carrying no `perf:` keyword. */
export const NO_PERF_KEYWORD = 'unspecified';

export function allRatedBugs(data: BugzillaData): Bug[] {
	const combined = [
		...data.high.bugs,
		...data.medium.bugs,
		...data.low.bugs,
		...data.needinfo.bugs,
		...data.regressions.bugs
	];

	const seen = new Set<number>();
	const unique: Bug[] = [];
	for (const bug of combined) {
		if (seen.has(bug.id)) continue;
		seen.add(bug.id);
		unique.push(bug);
	}

	return unique.sort((a, b) => Date.parse(b.last_change_time) - Date.parse(a.last_change_time));
}

function toSlices(counts: Map<string, number>, total: number): Slice[] {
	return [...counts.entries()]
		.map(([key, count]) => ({
			key,
			label: `${key} (${count})`,
			count,
			percentage: total === 0 ? 0 : Math.round((count / total) * 10000) / 100
		}))
		.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function countBy(bugs: readonly Bug[], key: (bug: Bug) => string): Map<string, number> {
	const counts = new Map<string, number>();
	for (const bug of bugs) {
		const value = key(bug);
		counts.set(value, (counts.get(value) ?? 0) + 1);
	}
	return counts;
}

/** Bugs per operating system. */
export function byOperatingSystem(bugs: readonly Bug[]): Slice[] {
	return toSlices(
		countBy(bugs, (bug) => bug.op_sys || UNSPECIFIED),
		bugs.length
	);
}

/** Bugs per Bugzilla component. */
export function byComponent(bugs: readonly Bug[]): Slice[] {
	return toSlices(
		countBy(bugs, (bug) => bug.component),
		bugs.length
	);
}

export function byPerfKeyword(bugs: readonly Bug[]): Slice[] {
	const counts = new Map<string, number>();
	let total = 0;

	for (const bug of bugs) {
		const keywords = bug.keywords.filter((keyword) => keyword.startsWith('perf:'));

		if (keywords.length === 0) {
			counts.set(NO_PERF_KEYWORD, (counts.get(NO_PERF_KEYWORD) ?? 0) + 1);
			total++;
			continue;
		}

		for (const keyword of keywords) {
			const name = keyword.slice('perf:'.length);
			counts.set(name, (counts.get(name) ?? 0) + 1);
			total++;
		}
	}

	return toSlices(counts, total);
}

export interface ImpactCounts {
	high: number;
	medium: number;
	low: number;
	untriaged: number;
	needinfo: number;
}

export function impactCounts(data: BugzillaData): ImpactCounts {
	return {
		high: data.high.bugs.length,
		medium: data.medium.bugs.length,
		low: data.low.bugs.length,
		untriaged: data.untriaged.bugs.length,
		needinfo: data.needinfo.bugs.length
	};
}

export interface TriageCounts {
	general: number;
	memory: number;
	navigation: number;
	responsiveness: number;
	startup: number;
}

export function triageCounts(data: BugzillaData): TriageCounts {
	return {
		general: data.triageGeneral.bugs.length,
		memory: data.triageMemory.bugs.length,
		navigation: data.triageNavigation.bugs.length,
		responsiveness: data.triageResponsiveness.bugs.length,
		startup: data.triageStartup.bugs.length
	};
}

/** Whole days between `last_change_time` and now. */
export function daysSinceUpdate(bug: Bug, now: number = Date.now()): number {
	return Math.floor((now - Date.parse(bug.last_change_time)) / (24 * 60 * 60 * 1000));
}

/** Date part of an ISO timestamp, for display. */
export function isoDate(timestamp: string): string {
	return timestamp.slice(0, 10);
}

export function filterBySummary(bugs: readonly Bug[], query: string): Bug[] {
	const terms = query
		.toLowerCase()
		.split(',')
		.map((term) => term.trim())
		.filter(Boolean);

	if (terms.length === 0) return [...bugs];

	return bugs.filter((bug) => {
		const summary = bug.summary.toLowerCase();
		return terms.some((term) => summary.includes(term));
	});
}
