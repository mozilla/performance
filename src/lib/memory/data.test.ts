import { describe, expect, it } from 'vitest';
import { parseCsv } from '$lib/api/csv';
import type { Probe } from './config';
import { parseMemoryRows, pointsFor, thresholdCrossings, versionsIn } from './data';

const probe: Probe = {
	key: 'rss',
	title: 'RSS',
	unit: 'MB',
	axis: 'RSS (MB)',
	p75: 'rss_p75_mb',
	p95: 'rss_p95_mb'
};

const csv = (text: string) => parseMemoryRows(parseCsv(text));

describe('parseMemoryRows', () => {
	it('groups by process and version', () => {
		const data = csv(
			[
				'date,process,version,rss_p75_mb',
				'2026-08-01,default,all,100',
				'2026-08-01,default,141,110',
				'2026-08-01,tab,all,200'
			].join('\n')
		);

		expect(Object.keys(data).sort()).toEqual(['default', 'tab']);
		expect(Object.keys(data.default).sort()).toEqual(['141', 'all']);
		expect(data.tab.all[0].values.rss_p75_mb).toBe(200);
	});

	// Nightly's query has no version column; every row must pool under `all`,
	// which is the shape the default display mode reads.
	it('pools every row under all when there is no version column', () => {
		const data = csv(['date,process,rss_p75_mb', '2026-08-01,default,100'].join('\n'));
		expect(Object.keys(data.default)).toEqual(['all']);
	});

	it('sorts rows oldest first regardless of file order', () => {
		const data = csv(
			[
				'date,process,rss_p75_mb',
				'2026-08-03,default,3',
				'2026-08-01,default,1',
				'2026-08-02,default,2'
			].join('\n')
		);

		expect(data.default.all.map((r) => r.values.rss_p75_mb)).toEqual([1, 2, 3]);
	});

	// A gap in the data must stay a gap; turning it into 0 would draw a crash
	// to the floor.
	it('keeps a blank value as null rather than zero', () => {
		const data = csv(['date,process,rss_p75_mb', '2026-08-01,default,'].join('\n'));
		expect(data.default.all[0].values.rss_p75_mb).toBeNull();
	});

	it('ignores rows with an unparseable or missing date', () => {
		const data = csv(
			[
				'date,process,rss_p75_mb',
				'not-a-date,default,1',
				',default,2',
				'2026-08-01,default,3'
			].join('\n')
		);

		expect(data.default.all).toHaveLength(1);
	});

	it('excludes meta columns from the value map', () => {
		const data = csv(['date,process,version,rss_p75_mb', '2026-08-01,default,141,100'].join('\n'));
		expect(Object.keys(data.default['141'][0].values)).toEqual(['rss_p75_mb']);
	});
});

describe('versionsIn', () => {
	it('sorts numerically, not lexicographically', () => {
		const data = csv(
			[
				'date,process,version,rss_p75_mb',
				'2026-08-01,default,9,1',
				'2026-08-01,default,141,1',
				'2026-08-01,default,20,1'
			].join('\n')
		);

		expect(versionsIn(data.default)).toEqual(['9', '20', '141']);
	});

	it('excludes the pooled series', () => {
		const data = csv(['date,process,version,rss_p75_mb', '2026-08-01,default,all,1'].join('\n'));
		expect(versionsIn(data.default)).toEqual([]);
	});

	it('handles a missing process', () => {
		expect(versionsIn(undefined)).toEqual([]);
	});
});

describe('pointsFor', () => {
	it('maps rows to x/y points', () => {
		const data = csv(['date,process,rss_p75_mb', '2026-08-01,default,100'].join('\n'));
		const points = pointsFor(data.default.all, 'rss_p75_mb');

		expect(points).toEqual([{ x: Date.parse('2026-08-01'), y: 100 }]);
	});

	it('yields null for a column the row does not have', () => {
		const data = csv(['date,process,rss_p75_mb', '2026-08-01,default,100'].join('\n'));
		expect(pointsFor(data.default.all, 'missing')[0].y).toBeNull();
	});

	it('handles missing rows', () => {
		expect(pointsFor(undefined, 'rss_p75_mb')).toEqual([]);
	});
});

describe('thresholdCrossings', () => {
	it('marks the first day a version carries a value', () => {
		const data = csv(
			[
				'date,process,version,rss_p75_mb',
				'2026-08-01,default,all,100',
				'2026-08-02,default,all,100',
				'2026-08-03,default,all,100',
				'2026-08-02,default,141,110',
				'2026-08-03,default,141,110'
			].join('\n')
		);

		const crossings = thresholdCrossings(probe, data.default);
		expect(crossings).toHaveLength(1);
		expect(crossings[0].version).toBe('141');
		expect(crossings[0].date.getTime()).toBe(Date.parse('2026-08-02'));
	});

	// A version already present on day one crossed before the window opened, so
	// there is no crossing to mark.
	it('does not mark a version present on the first day of the window', () => {
		const data = csv(
			[
				'date,process,version,rss_p75_mb',
				'2026-08-01,default,all,100',
				'2026-08-01,default,141,110'
			].join('\n')
		);

		expect(thresholdCrossings(probe, data.default)).toEqual([]);
	});

	it('ignores a version whose rows are all blank for this probe', () => {
		const data = csv(
			[
				'date,process,version,rss_p75_mb',
				'2026-08-01,default,all,100',
				'2026-08-02,default,141,'
			].join('\n')
		);

		expect(thresholdCrossings(probe, data.default)).toEqual([]);
	});

	it('returns nothing without pooled rows to define the window', () => {
		const data = csv(['date,process,version,rss_p75_mb', '2026-08-02,default,141,110'].join('\n'));

		expect(thresholdCrossings(probe, data.default)).toEqual([]);
	});

	it('returns crossings oldest first', () => {
		const data = csv(
			[
				'date,process,version,rss_p75_mb',
				'2026-08-01,default,all,1',
				'2026-08-05,default,142,1',
				'2026-08-03,default,141,1'
			].join('\n')
		);

		expect(thresholdCrossings(probe, data.default).map((c) => c.version)).toEqual(['141', '142']);
	});
});
