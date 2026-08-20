import { describe, expect, it } from 'vitest';
import type { Bug, BugzillaData } from './api';
import {
	allRatedBugs,
	byComponent,
	byOperatingSystem,
	byPerfKeyword,
	daysSinceUpdate,
	filterBySummary,
	impactCounts,
	isoDate,
	triageCounts
} from './stats';

let nextId = 1;

function bug(overrides: Partial<Bug> = {}): Bug {
	const id = overrides.id ?? nextId++;
	return {
		id,
		summary: `Bug ${id}`,
		component: 'Performance',
		severity: 'S3',
		priority: 'P3',
		status: 'NEW',
		op_sys: 'Linux',
		keywords: [],
		creation_time: '2026-01-01T00:00:00Z',
		last_change_time: '2026-08-01T00:00:00Z',
		...overrides
	};
}

function data(groups: Partial<Record<keyof BugzillaData, Bug[]>> = {}): BugzillaData {
	const keys: Array<keyof BugzillaData> = [
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
	for (const key of keys) out[key] = { bugs: groups[key] ?? [] };
	return out;
}

describe('allRatedBugs', () => {
	it('combines the rated buckets', () => {
		const combined = allRatedBugs(
			data({
				high: [bug()],
				medium: [bug()],
				low: [bug()],
				needinfo: [bug()],
				regressions: [bug()]
			})
		);

		expect(combined).toHaveLength(5);
	});

	it('excludes untriaged and the per-component triage buckets', () => {
		const combined = allRatedBugs(data({ untriaged: [bug()], triageMemory: [bug()] }));
		expect(combined).toEqual([]);
	});

	it('de-duplicates a bug appearing in two buckets', () => {
		const shared = bug({ id: 42 });
		const combined = allRatedBugs(data({ high: [shared], regressions: [shared] }));

		expect(combined).toHaveLength(1);
	});

	it('sorts newest change first', () => {
		const combined = allRatedBugs(
			data({
				high: [
					bug({ id: 1, last_change_time: '2026-01-01T00:00:00Z' }),
					bug({ id: 2, last_change_time: '2026-08-01T00:00:00Z' })
				]
			})
		);

		expect(combined.map((b) => b.id)).toEqual([2, 1]);
	});
});

describe('byOperatingSystem', () => {
	it('counts bugs per OS, largest first', () => {
		const slices = byOperatingSystem([
			bug({ op_sys: 'Linux' }),
			bug({ op_sys: 'Windows' }),
			bug({ op_sys: 'Windows' })
		]);

		expect(slices.map((s) => [s.key, s.count])).toEqual([
			['Windows', 2],
			['Linux', 1]
		]);
	});

	it('labels a slice with its count', () => {
		expect(byOperatingSystem([bug({ op_sys: 'Linux' })])[0].label).toBe('Linux (1)');
	});

	it('groups a null OS under Unspecified', () => {
		expect(byOperatingSystem([bug({ op_sys: null })])[0].key).toBe('Unspecified');
	});

	it('computes percentages that sum to 100', () => {
		const slices = byOperatingSystem([
			bug({ op_sys: 'Linux' }),
			bug({ op_sys: 'Windows' }),
			bug({ op_sys: 'Mac' }),
			bug({ op_sys: 'Mac' })
		]);

		expect(slices.reduce((sum, s) => sum + s.percentage, 0)).toBeCloseTo(100, 5);
	});

	it('returns nothing for no bugs', () => {
		expect(byOperatingSystem([])).toEqual([]);
	});
});

describe('byComponent', () => {
	it('counts and ranks components', () => {
		const slices = byComponent([
			bug({ component: 'DOM' }),
			bug({ component: 'Layout' }),
			bug({ component: 'DOM' })
		]);

		expect(slices[0]).toMatchObject({ key: 'DOM', count: 2, percentage: 66.67 });
	});

	it('breaks count ties alphabetically for a stable order', () => {
		const slices = byComponent([bug({ component: 'Zeta' }), bug({ component: 'Alpha' })]);
		expect(slices.map((s) => s.key)).toEqual(['Alpha', 'Zeta']);
	});
});

describe('byPerfKeyword', () => {
	it('strips the perf: prefix', () => {
		expect(byPerfKeyword([bug({ keywords: ['perf:startup'] })])[0].key).toBe('startup');
	});

	it('ignores non-perf keywords', () => {
		const slices = byPerfKeyword([bug({ keywords: ['regression', 'perf:responsiveness'] })]);
		expect(slices.map((s) => s.key)).toEqual(['responsiveness']);
	});

	it('groups bugs with no perf keyword under unspecified', () => {
		expect(byPerfKeyword([bug({ keywords: ['regression'] })])[0].key).toBe('unspecified');
	});

	it('counts a bug under each of its perf keywords', () => {
		const slices = byPerfKeyword([bug({ keywords: ['perf:startup', 'perf:memory'] })]);

		expect(slices.map((s) => s.key).sort()).toEqual(['memory', 'startup']);
		expect(slices.reduce((sum, s) => sum + s.count, 0)).toBe(2);
	});

	it('takes percentages over keyword assignments, not bugs', () => {
		const slices = byPerfKeyword([bug({ keywords: ['perf:startup', 'perf:memory'] })]);
		expect(slices.every((s) => s.percentage === 50)).toBe(true);
	});
});

describe('impactCounts and triageCounts', () => {
	it('reports the size of each impact bucket', () => {
		expect(impactCounts(data({ high: [bug()], low: [bug(), bug()] }))).toEqual({
			high: 1,
			medium: 0,
			low: 2,
			untriaged: 0,
			needinfo: 0
		});
	});

	it('reports the size of each triage bucket', () => {
		expect(triageCounts(data({ triageMemory: [bug(), bug()] }))).toMatchObject({
			memory: 2,
			general: 0
		});
	});
});

describe('daysSinceUpdate', () => {
	const now = Date.parse('2026-08-20T00:00:00Z');

	it('counts whole days', () => {
		expect(daysSinceUpdate(bug({ last_change_time: '2026-08-10T00:00:00Z' }), now)).toBe(10);
	});

	it('is zero for a change today', () => {
		expect(daysSinceUpdate(bug({ last_change_time: '2026-08-19T12:00:00Z' }), now)).toBe(0);
	});
});

describe('isoDate', () => {
	it('keeps only the date part', () => {
		expect(isoDate('2026-08-20T13:45:00Z')).toBe('2026-08-20');
	});
});

describe('filterBySummary', () => {
	const bugs = [
		bug({ summary: 'Slow scrolling on Reddit' }),
		bug({ summary: 'High memory usage in tabs' }),
		bug({ summary: 'Janky animation' })
	];

	it('returns everything for an empty query', () => {
		expect(filterBySummary(bugs, '')).toHaveLength(3);
	});

	it('matches case-insensitively', () => {
		expect(filterBySummary(bugs, 'REDDIT')).toHaveLength(1);
	});

	it('treats commas as alternatives', () => {
		expect(filterBySummary(bugs, 'memory, janky')).toHaveLength(2);
	});

	it('ignores empty terms from stray commas', () => {
		expect(filterBySummary(bugs, 'memory,,')).toHaveLength(1);
	});

	it('returns nothing when no summary matches', () => {
		expect(filterBySummary(bugs, 'webgl')).toEqual([]);
	});
});
