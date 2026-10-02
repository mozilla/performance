import {
	type Alert,
	type AlertSummary,
	perfherderAlertUrl,
	selectCanonicalSignatures,
	fetchAlertSummaries,
	fetchAlertSummary,
	fetchSignatures,
	type PerfSignature
} from '$lib/api/treeherder';
import { SCORE_TEST, SPEEDOMETER_FRAMEWORK, SPEEDOMETER_SUITE } from './config';

/** Perfherder marks an alert invalid with status 3; those are never shown. */
const STATUS_INVALID = 3;

/** Percentage changes smaller than this are noise and are not listed. */
const NEGLIGIBLE_PCT = 0.01;

/** How many improvement and regression lines to list in a hover label. */
const MAX_LABEL_LINES = 8;

/** An alert together with the summary it arrived in. */
export interface EnrichedAlert {
	summaryId: number;
	pushTimestamp: number;
	alert: Alert;
}

export interface AlertData {
	alerts: EnrichedAlert[];
	summaries: Map<number, AlertSummary>;
}

/** A vertical marker on the chart. */
export interface AlertMarker {
	summaryId: number;
	date: Date;
	/** Whether the net effect is a regression; drives the marker colour. */
	isRegression: boolean;
	/**
	 * Short text drawn next to the marker, or null to draw no label until
	 * hover. The aggregate view has too many alerts to label them all.
	 */
	label: string | null;
	/** Lines shown on hover. */
	detail: string[];
	url: string;
}

/** `Editor-TipTap` from `Editor-TipTap/total`. */
export function baseTestName(test: string): string {
	return test.replace('/total', '');
}

/** Does this signature's test belong to `test` or one of its subparts? */
function isPartOf(test: string, candidate: string | undefined): boolean {
	if (!candidate) return false;
	return candidate === test || candidate.startsWith(`${baseTestName(test)}/`);
}

export async function fetchAlertsForTest(
	test: string,
	platform: string,
	days: number,
	signal?: AbortSignal,
	options: { suite?: string; framework?: number; allTests?: boolean } = {}
): Promise<AlertData> {
	const suite = options.suite ?? SPEEDOMETER_SUITE;
	const framework = options.framework ?? SPEEDOMETER_FRAMEWORK;

	const signatures = await fetchSignatures({ repository: 'autoland', framework, platform }, signal);

	const candidates = signatures.filter(
		(sig: PerfSignature) =>
			sig.suite === suite &&
			(sig.application === 'firefox' || sig.application === 'fenix') &&
			(options.allTests === true || isPartOf(test, sig.test))
	);

	const signatureIds = selectCanonicalSignatures(candidates).map((sig) => sig.id);
	if (signatureIds.length === 0) return { alerts: [], summaries: new Map() };

	const alerts: EnrichedAlert[] = [];
	const summaries = new Map<number, AlertSummary>();
	const reassignedTo = new Set<number>();

	const perSignature = await Promise.all(
		signatureIds.map((id) => fetchAlertSummaries(id, days, signal).then((s) => [id, s] as const))
	);

	for (const [signatureId, signatureSummaries] of perSignature) {
		for (const summary of signatureSummaries) {
			summaries.set(summary.id, summary);
			for (const alert of summary.alerts) {
				if (alert.series_signature.id !== signatureId) continue;
				alerts.push({ summaryId: summary.id, pushTimestamp: summary.push_timestamp, alert });
				if (alert.related_summary_id) reassignedTo.add(alert.related_summary_id);
			}
		}
	}

	// An alert can be reassigned to a different summary (a human decided the
	// regression really belongs to another push). Follow those so the marker
	// lands on the push actually blamed.
	const missing = [...reassignedTo].filter((id) => !summaries.has(id));
	const related = await Promise.all(
		missing.map((id) => fetchAlertSummary(id, signal).catch(() => null))
	);

	for (const summary of related) {
		if (!summary) continue;
		summaries.set(summary.id, summary);
		for (const alert of summary.alerts) {
			if (!isPartOf(test, alert.series_signature.test)) continue;
			alerts.push({ summaryId: summary.id, pushTimestamp: summary.push_timestamp, alert });
		}
	}

	return { alerts, summaries };
}

/** Merge per-test/per-platform results into one set, de-duplicating alerts. */
export function mergeAlertData(parts: readonly AlertData[]): AlertData {
	const alerts = new Map<string, EnrichedAlert>();
	const summaries = new Map<number, AlertSummary>();

	for (const part of parts) {
		for (const enriched of part.alerts) {
			// The same alert is reachable from several signatures and from a
			// reassigned summary; key on both ids so it is counted once.
			alerts.set(`${enriched.summaryId}:${enriched.alert.id}`, enriched);
		}
		for (const [id, summary] of part.summaries) summaries.set(id, summary);
	}

	return { alerts: [...alerts.values()], summaries };
}

/** The summary an alert finally belongs to, following one reassignment hop. */
function finalSummaryId(enriched: EnrichedAlert): number {
	return enriched.alert.related_summary_id ?? enriched.summaryId;
}

function isVisible(enriched: EnrichedAlert): boolean {
	return enriched.alert.status !== STATUS_INVALID;
}

function formatPct(pct: number): string {
	return Math.abs(pct).toFixed(1);
}

/**
 * Markers for a single subtest chart: one per summary, labelled with the
 * headline percentage.
 */
function buildSingleTestMarkers(test: string, data: AlertData): AlertMarker[] {
	const bySummary = new Map<number, EnrichedAlert[]>();

	for (const enriched of data.alerts) {
		if (!isVisible(enriched)) continue;
		const id = finalSummaryId(enriched);
		const existing = bySummary.get(id);
		if (existing) existing.push(enriched);
		else bySummary.set(id, [enriched]);
	}

	const markers: AlertMarker[] = [];

	for (const [summaryId, group] of bySummary) {
		// The /total alert is the headline; without one, the largest change is.
		const headline =
			group.find((e) => e.alert.series_signature.test?.endsWith('/total')) ??
			group.reduce((max, e) =>
				Math.abs(e.alert.amount_pct ?? 0) > Math.abs(max.alert.amount_pct ?? 0) ? e : max
			);

		const timestamp = data.summaries.get(summaryId)?.push_timestamp ?? headline.pushTimestamp;
		const pct = formatPct(headline.alert.amount_pct ?? 0);
		const base = baseTestName(test);

		const parts = group
			.map((e) => {
				const alertTest = e.alert.series_signature.test;
				if (!alertTest) return null;
				const subtest = alertTest.replace(base, '').replace(/^\//, '');
				const value = formatPct(e.alert.amount_pct ?? 0);
				return subtest ? `${subtest}: ${value}%` : `${value}%`;
			})
			.filter((line): line is string => line !== null);

		markers.push({
			summaryId,
			date: new Date(timestamp * 1000),
			isRegression: headline.alert.is_regression,
			label: `${pct}%`,
			detail: [`#${summaryId}: ${pct}%`, ...parts],
			url: perfherderAlertUrl(summaryId)
		});
	}

	return markers.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * Markers for the Overall Score chart, aggregating every subtest's alerts.
 *
 * There are far too many to label individually, so each marker is unlabelled
 * until hover and then lists the affected tests.
 */
function buildAggregateMarkers(data: AlertData): AlertMarker[] {
	const visible = data.alerts.filter(isVisible);

	// A summary that was itself reassigned elsewhere must not get its own
	// marker, or the same regression appears at two pushes.
	const reassignedAway = new Set(
		visible.filter((e) => e.alert.related_summary_id).map((e) => e.summaryId)
	);

	const bySummary = new Map<number, EnrichedAlert[]>();
	for (const enriched of visible) {
		const id = finalSummaryId(enriched);
		const existing = bySummary.get(id);
		if (existing) existing.push(enriched);
		else bySummary.set(id, [enriched]);
	}

	const markers: AlertMarker[] = [];

	for (const [summaryId, group] of bySummary) {
		if (reassignedAway.has(summaryId)) continue;

		const summary = data.summaries.get(summaryId);
		if (!summary) continue;

		// Collapse each test's subparts to one line, preferring the /total
		// alert and otherwise the largest change.
		const changes = new Map<string, { pct: number; isTotal: boolean; isRegression: boolean }>();

		for (const { alert } of group) {
			const test = alert.series_signature.test;
			if (!test || test === SCORE_TEST) continue;

			const pct = alert.amount_pct ?? 0;
			if (Math.abs(pct) < NEGLIGIBLE_PCT) continue;

			const key = test.split('/')[0];
			const isTotal = test.endsWith('/total');
			const existing = changes.get(key);

			if (!existing || (!existing.isTotal && (isTotal || Math.abs(pct) > Math.abs(existing.pct)))) {
				changes.set(key, { pct, isTotal, isRegression: alert.is_regression });
			}
		}

		const improvements: string[] = [];
		const regressions: string[] = [];

		for (const [test, change] of changes) {
			const line = `${test}: ${change.isRegression ? '-' : '+'}${formatPct(change.pct)}%`;
			(change.isRegression ? regressions : improvements).push(line);
		}

		markers.push({
			summaryId,
			date: new Date(summary.push_timestamp * 1000),
			isRegression: regressions.length >= improvements.length,
			label: null,
			detail: [
				`Alert ${summaryId}`,
				...improvements.slice(0, MAX_LABEL_LINES),
				...regressions.slice(0, MAX_LABEL_LINES)
			],
			url: perfherderAlertUrl(summaryId)
		});
	}

	return markers.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * Alert markers for a chart.
 *
 * The Overall Score chart aggregates alerts from every subtest; a subtest chart
 * shows only its own.
 */
export function buildAlertMarkers(test: string, data: AlertData): AlertMarker[] {
	return test === SCORE_TEST ? buildAggregateMarkers(data) : buildSingleTestMarkers(test, data);
}

/**
 * Drop markers outside the charted window.
 *
 * Alerts are always searched over `ALERT_WINDOW_DAYS`, independent of the
 * selected range, because that is one cacheable query rather than one per
 * range. Without this filter the annotation plugin extends the x axis to reach
 * the oldest marker, so picking "1 month" produced a three-month axis with the
 * data squeezed into the right-hand quarter.
 */
export function markersWithinDays(
	markers: readonly AlertMarker[],
	days: number,
	now: number = Date.now()
): AlertMarker[] {
	const cutoff = now - days * 24 * 60 * 60 * 1000;
	return markers.filter((marker) => marker.date.getTime() >= cutoff);
}
