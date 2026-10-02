import { describe, expect, it } from 'vitest';
import type { Alert, AlertSummary } from '$lib/api/treeherder';
import { signature } from '../../tests/factories';
import {
	type AlertData,
	type AlertMarker,
	baseTestName,
	buildAlertMarkers,
	markersWithinDays,
	mergeAlertData
} from './alerts';

let nextAlertId = 1;

function alert(overrides: Partial<Alert> & { test?: string } = {}): Alert {
	const { test, ...rest } = overrides;
	return {
		id: nextAlertId++,
		amount_pct: 5,
		is_regression: true,
		status: 0,
		related_summary_id: null,
		series_signature: signature({ test: test ?? 'Editor-TipTap/total' }),
		...rest
	};
}

/** Build AlertData from summaries described as (id, timestamp, alerts). */
function data(summaries: Array<{ id: number; pushTimestamp: number; alerts: Alert[] }>): AlertData {
	const summaryMap = new Map<number, AlertSummary>();
	const enriched = [];

	for (const s of summaries) {
		summaryMap.set(s.id, {
			id: s.id,
			push_timestamp: s.pushTimestamp,
			repository: 'autoland',
			alerts: s.alerts
		});
		for (const a of s.alerts) {
			enriched.push({ summaryId: s.id, pushTimestamp: s.pushTimestamp, alert: a });
		}
	}

	return { alerts: enriched, summaries: summaryMap };
}

const T = 1_754_006_400;

describe('baseTestName', () => {
	it('strips a /total suffix', () => {
		expect(baseTestName('Editor-TipTap/total')).toBe('Editor-TipTap');
	});

	it('leaves other names alone', () => {
		expect(baseTestName('score')).toBe('score');
	});
});

describe('buildAlertMarkers, single subtest', () => {
	const test = 'Editor-TipTap/total';

	it('produces one marker per summary, labelled with the headline percentage', () => {
		const markers = buildAlertMarkers(
			test,
			data([{ id: 100, pushTimestamp: T, alerts: [alert({ amount_pct: 7.25 })] }])
		);

		expect(markers).toHaveLength(1);
		expect(markers[0]).toMatchObject({ summaryId: 100, label: '7.3%', isRegression: true });
		expect(markers[0].date.getTime()).toBe(T * 1000);
		expect(markers[0].url).toContain('id=100');
	});

	// Perfherder marks superseded alerts invalid; showing them would put
	// markers on pushes that were investigated and dismissed.
	it('drops alerts with the invalid status', () => {
		const markers = buildAlertMarkers(
			test,
			data([{ id: 100, pushTimestamp: T, alerts: [alert({ status: 3 })] }])
		);

		expect(markers).toEqual([]);
	});

	it('prefers the /total alert as the headline over a larger subpart', () => {
		const markers = buildAlertMarkers(
			test,
			data([
				{
					id: 100,
					pushTimestamp: T,
					alerts: [
						alert({ test: 'Editor-TipTap/Highlight/Async', amount_pct: 40 }),
						alert({ test: 'Editor-TipTap/total', amount_pct: 5 })
					]
				}
			])
		);

		expect(markers[0].label).toBe('5.0%');
	});

	it('falls back to the largest change when there is no /total alert', () => {
		const markers = buildAlertMarkers(
			test,
			data([
				{
					id: 100,
					pushTimestamp: T,
					alerts: [
						alert({ test: 'Editor-TipTap/Highlight/Async', amount_pct: 3 }),
						alert({ test: 'Editor-TipTap/Highlight/Sync', amount_pct: -12 })
					]
				}
			])
		);

		expect(markers[0].label).toBe('12.0%');
	});

	it('lists each subpart in the hover detail', () => {
		const markers = buildAlertMarkers(
			test,
			data([
				{
					id: 100,
					pushTimestamp: T,
					alerts: [
						alert({ test: 'Editor-TipTap/total', amount_pct: 5 }),
						alert({ test: 'Editor-TipTap/Highlight/Async', amount_pct: 9 })
					]
				}
			])
		);

		expect(markers[0].detail).toEqual(['#100: 5.0%', 'total: 5.0%', 'Highlight/Async: 9.0%']);
	});

	// A reassigned alert belongs to the push a human blamed, not the one the
	// detector first flagged.
	it('follows a reassignment to the target summary', () => {
		const markers = buildAlertMarkers(
			test,
			data([
				{
					id: 100,
					pushTimestamp: T,
					alerts: [alert({ related_summary_id: 200, amount_pct: 6 })]
				},
				{ id: 200, pushTimestamp: T + 3600, alerts: [] }
			])
		);

		expect(markers).toHaveLength(1);
		expect(markers[0].summaryId).toBe(200);
		expect(markers[0].date.getTime()).toBe((T + 3600) * 1000);
	});

	it('returns markers in chronological order', () => {
		const markers = buildAlertMarkers(
			test,
			data([
				{ id: 3, pushTimestamp: T + 200, alerts: [alert()] },
				{ id: 1, pushTimestamp: T, alerts: [alert()] },
				{ id: 2, pushTimestamp: T + 100, alerts: [alert()] }
			])
		);

		expect(markers.map((m) => m.summaryId)).toEqual([1, 2, 3]);
	});

	it('returns nothing when there are no alerts', () => {
		expect(buildAlertMarkers(test, { alerts: [], summaries: new Map() })).toEqual([]);
	});
});

describe('buildAlertMarkers, overall score', () => {
	it('leaves markers unlabelled and lists affected tests on hover', () => {
		const markers = buildAlertMarkers(
			'score',
			data([
				{
					id: 100,
					pushTimestamp: T,
					alerts: [
						alert({ test: 'Editor-TipTap/total', amount_pct: 5, is_regression: true }),
						alert({ test: 'TodoMVC-Vue/total', amount_pct: 3, is_regression: false })
					]
				}
			])
		);

		expect(markers[0].label).toBeNull();
		expect(markers[0].detail).toEqual(['Alert 100', 'TodoMVC-Vue: +3.0%', 'Editor-TipTap: -5.0%']);
	});

	it('collapses a test and its subparts to one line, preferring /total', () => {
		const markers = buildAlertMarkers(
			'score',
			data([
				{
					id: 100,
					pushTimestamp: T,
					alerts: [
						alert({ test: 'Editor-TipTap/Highlight/Async', amount_pct: 40 }),
						alert({ test: 'Editor-TipTap/total', amount_pct: 5 })
					]
				}
			])
		);

		expect(markers[0].detail).toEqual(['Alert 100', 'Editor-TipTap: -5.0%']);
	});

	it('ignores the score alert itself so it is not listed as a test', () => {
		const markers = buildAlertMarkers(
			'score',
			data([
				{
					id: 100,
					pushTimestamp: T,
					alerts: [
						alert({ test: 'score', amount_pct: 2 }),
						alert({ test: 'TodoMVC-Vue/total', amount_pct: 3 })
					]
				}
			])
		);

		expect(markers[0].detail).toEqual(['Alert 100', 'TodoMVC-Vue: -3.0%']);
	});

	it('skips negligible changes', () => {
		const markers = buildAlertMarkers(
			'score',
			data([
				{
					id: 100,
					pushTimestamp: T,
					alerts: [alert({ test: 'TodoMVC-Vue/total', amount_pct: 0.001 })]
				}
			])
		);

		expect(markers[0].detail).toEqual(['Alert 100']);
	});

	it('colours by net direction', () => {
		const netGood = buildAlertMarkers(
			'score',
			data([
				{
					id: 100,
					pushTimestamp: T,
					alerts: [
						alert({ test: 'A/total', amount_pct: 3, is_regression: false }),
						alert({ test: 'B/total', amount_pct: 3, is_regression: false }),
						alert({ test: 'C/total', amount_pct: 3, is_regression: true })
					]
				}
			])
		);

		expect(netGood[0].isRegression).toBe(false);
	});

	// Without this, a reassigned regression gets a marker on both the push it
	// was detected on and the push it was moved to.
	it('does not mark a summary that was reassigned away', () => {
		const markers = buildAlertMarkers(
			'score',
			data([
				{
					id: 100,
					pushTimestamp: T,
					alerts: [alert({ test: 'A/total', related_summary_id: 200 })]
				},
				{ id: 200, pushTimestamp: T + 3600, alerts: [alert({ test: 'A/total' })] }
			])
		);

		expect(markers.map((m) => m.summaryId)).toEqual([200]);
	});

	it('skips a summary whose details were never fetched', () => {
		const partial: AlertData = {
			alerts: [{ summaryId: 999, pushTimestamp: T, alert: alert() }],
			summaries: new Map()
		};

		expect(buildAlertMarkers('score', partial)).toEqual([]);
	});
});

describe('mergeAlertData', () => {
	it('de-duplicates an alert reachable from several signatures', () => {
		const shared = alert();
		const part = data([{ id: 100, pushTimestamp: T, alerts: [shared] }]);

		const merged = mergeAlertData([part, part]);

		expect(merged.alerts).toHaveLength(1);
		expect(merged.summaries.size).toBe(1);
	});

	it('keeps distinct alerts from different summaries', () => {
		const merged = mergeAlertData([
			data([{ id: 100, pushTimestamp: T, alerts: [alert()] }]),
			data([{ id: 200, pushTimestamp: T, alerts: [alert()] }])
		]);

		expect(merged.alerts).toHaveLength(2);
		expect(merged.summaries.size).toBe(2);
	});

	it('returns empty for no parts', () => {
		expect(mergeAlertData([])).toEqual({ alerts: [], summaries: new Map() });
	});
});

describe('markersWithinDays', () => {
	const now = Date.parse('2026-08-20T00:00:00Z');
	const daysAgo = (n: number): AlertMarker => ({
		summaryId: n,
		date: new Date(now - n * 24 * 60 * 60 * 1000),
		isRegression: true,
		label: null,
		detail: [],
		url: ''
	});

	// Alerts are searched over a fixed 90-day window regardless of the selected
	// range. Without clipping, the annotation plugin stretches the x axis out to
	// the oldest marker and "1 month" renders a three-month axis.
	it('keeps only markers inside the window', () => {
		const kept = markersWithinDays([daysAgo(1), daysAgo(20), daysAgo(60)], 30, now);
		expect(kept.map((m) => m.summaryId)).toEqual([1, 20]);
	});

	it('keeps a marker exactly on the boundary', () => {
		expect(markersWithinDays([daysAgo(30)], 30, now)).toHaveLength(1);
	});

	it('keeps everything for a wide enough window', () => {
		expect(markersWithinDays([daysAgo(1), daysAgo(80)], 365, now)).toHaveLength(2);
	});

	it('returns nothing for no markers', () => {
		expect(markersWithinDays([], 30, now)).toEqual([]);
	});
});
