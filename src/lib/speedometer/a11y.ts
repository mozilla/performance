/**
 * Speedometer 3 Accessibility: what turning accessibility on costs each browser.
 *
 * The `speedometer3-a11y` suite runs Speedometer 3 with accessibility
 * force-enabled at the level a screen reader gets. Its raw score says little
 * on its own; what matters is how much slower it is than plain Speedometer 3
 * on the same build. Each accessibility run is paired with the Speedometer 3
 * run of the same browser on the same push, or failing that the nearest one,
 * and the page charts and tabulates the slowdown between the two.
 */
import type { Measurement, Repository } from '#lib/api/treeherder.js';
import { BROWSERS, type BrowserKey, classify } from '#lib/browsers.js';
import {
	displayName,
	lowerIsBetter,
	PLATFORMS,
	SCORE_TEST,
	SPEEDOMETER_SUITE,
	SUBTESTS
} from './config';
import { speedometerSchemaFor } from './state';
import {
	type CellValue,
	type ComparisonTable,
	type DiffValue,
	type TableRow,
	trailingAverage
} from './table';

export const A11Y_SUITE = 'speedometer3-a11y';

const PLATFORM_KEYS = ['windows', 'windows-hwref', 'linux', 'osxm4', 'android-a55'];

export const A11Y_PLATFORMS = PLATFORMS.filter((platform) => PLATFORM_KEYS.includes(platform.key));

/** The overall score, then the workloads. */
export const A11Y_TESTS: readonly string[] = [SCORE_TEST, ...SUBTESTS];

/** The suite runs on mozilla-central only. */
const REPOSITORIES: readonly Repository[] = ['mozilla-central'];

export const a11ySchema = speedometerSchemaFor({
	os: 'windows',
	platformKeys: PLATFORM_KEYS,
	test: SCORE_TEST,
	repository: 'mozilla-central',
	repositories: REPOSITORIES
});

/**
 * How far a Speedometer 3 run may be from an accessibility run to stand in as
 * its baseline, when none ran on the same push.
 */
export const BASELINE_WINDOW_HOURS = 24;

/** No Safari: the accessibility suite does not run it. */
const VALUE_KEYS: readonly BrowserKey[] = ['firefox', 'firefox-nar', 'chrome', 'car'];
const COMPARISON_KEYS: readonly BrowserKey[] = ['chrome', 'car'];

/**
 * One accessibility run against its baseline. `value` is the slowdown, e.g.
 * 0.3 for 30% slower with accessibility on; the rest describes the
 * accessibility run, except `suite`, which is Speedometer 3's so that the
 * point is charted and tabulated as the browser it compares.
 */
export interface ImpactPoint extends Measurement {
	/** Speedometer 3, averaged over the baseline push's jobs. */
	baseline: number;
	/** Speedometer 3 Accessibility, averaged over this push's jobs. */
	accessible: number;
	baselineRevision: string;
	baselineSignatureId: number;
	/** The baseline ran on a different push. */
	approximate: boolean;
}

/** How much slower a test is with accessibility on: 0.3 for 30% slower. */
export function slowdown(test: string, baseline: number, accessible: number): number {
	return lowerIsBetter(test) ? accessible / baseline - 1 : baseline / accessible - 1;
}

/**
 * The browser a run belongs to, counting an accessibility run as its browser's
 * plain one: browsers.ts files Firefox's as a browser of its own, Nightly
 * (a11y), and has none for Nightly-as-Release's.
 */
const browserOf = (m: Measurement) => classify({ ...m, suite: SPEEDOMETER_SUITE });

interface Push {
	revision: string;
	date: Date;
	value: number;
	first: Measurement;
}

/** One entry per push, averaging its retriggers. */
function byPush(measurements: readonly Measurement[]): Push[] {
	const groups = new Map<string, Measurement[]>();
	for (const m of measurements) {
		const group = groups.get(m.revision);
		if (group) group.push(m);
		else groups.set(m.revision, [m]);
	}
	return [...groups.entries()].map(([revision, group]) => ({
		revision,
		date: group.reduce((min, m) => (m.date < min ? m.date : min), group[0].date),
		value: group.reduce((sum, m) => sum + m.value, 0) / group.length,
		first: group[0]
	}));
}

function nearest(pushes: readonly Push[], date: Date, windowMs: number): Push | undefined {
	let best: Push | undefined;
	let bestDistance = windowMs;
	for (const push of pushes) {
		const distance = Math.abs(push.date.getTime() - date.getTime());
		if (distance <= bestDistance) {
			best = push;
			bestDistance = distance;
		}
	}
	return best;
}

/**
 * Pair every accessibility push with its baseline, per browser and test.
 * Accessibility pushes with no baseline within the window are dropped.
 */
export function pairImpacts(
	measurements: readonly Measurement[],
	windowHours: number = BASELINE_WINDOW_HOURS
): ImpactPoint[] {
	const groups = new Map<string, { baseline: Measurement[]; accessible: Measurement[] }>();
	for (const m of measurements) {
		const browser = browserOf(m);
		if (!browser) continue;
		const which =
			m.suite === A11Y_SUITE ? 'accessible' : m.suite === SPEEDOMETER_SUITE ? 'baseline' : null;
		if (!which) continue;
		const key = `${browser.key}|${m.test}`;
		let group = groups.get(key);
		if (!group) {
			group = { baseline: [], accessible: [] };
			groups.set(key, group);
		}
		group[which].push(m);
	}

	const windowMs = windowHours * 60 * 60 * 1000;
	const points: ImpactPoint[] = [];

	for (const group of groups.values()) {
		const baselines = byPush(group.baseline);
		const sameRevision = new Map(baselines.map((push) => [push.revision, push]));

		for (const push of byPush(group.accessible)) {
			const baseline = sameRevision.get(push.revision) ?? nearest(baselines, push.date, windowMs);
			if (!baseline || baseline.value <= 0 || push.value <= 0) continue;

			points.push({
				...push.first,
				suite: SPEEDOMETER_SUITE,
				date: push.date,
				value: slowdown(push.first.test, baseline.value, push.value),
				baseline: baseline.value,
				accessible: push.value,
				baselineRevision: baseline.revision,
				baselineSignatureId: baseline.first.signatureId,
				approximate: baseline.revision !== push.revision
			});
		}
	}

	return points.sort((a, b) => a.date.getTime() - b.date.getTime());
}

function round(value: number, decimals: number): number {
	const factor = 10 ** decimals;
	return Math.round(value * factor) / factor;
}

export function formatSlowdown(value: number | null): string {
	if (value === null) return 'N/A';
	const percent = round(value * 100, 1);
	return `${percent > 0 ? '+' : ''}${percent}%`;
}

/** Firefox's slowdown minus the other browser's, in percentage points. */
function formatGap(gap: number | null): string {
	if (gap === null) return 'N/A';
	const points = round(gap * 100, 1);
	return `${points > 0 ? '+' : ''}${points} pp`;
}

/** Positive gaps mean accessibility costs Firefox more than the other browser. */
export function gapColor(gap: number | null): string {
	if (gap === null) return 'inherit';
	if (gap < -0.02) return 'green';
	if (gap < 0.02) return 'black';
	if (gap < 0.05) return '#b38f00';
	return 'red';
}

/**
 * Each browser's slowdown averaged over the trailing week, and how far
 * Firefox's is above each competitor's.
 */
export function buildImpactTable(
	points: readonly ImpactPoint[],
	tests: readonly string[] = A11Y_TESTS
): ComparisonTable {
	const byRow = new Map<string, Map<BrowserKey, ImpactPoint[]>>();
	for (const point of points) {
		const browser = classify(point);
		if (!browser) continue;
		let browsers = byRow.get(point.test);
		if (!browsers) {
			browsers = new Map();
			byRow.set(point.test, browsers);
		}
		const existing = browsers.get(browser.key);
		if (existing) existing.push(point);
		else browsers.set(browser.key, [point]);
	}

	const column = (key: BrowserKey) => ({ key, browser: BROWSERS.find((b) => b.key === key)! });
	const rows: TableRow[] = [];

	for (const test of tests) {
		const browsers = byRow.get(test);
		if (!browsers) continue;

		const averages = {} as Record<BrowserKey, number | null>;
		for (const { key } of BROWSERS) averages[key] = trailingAverage(browsers.get(key) ?? []);
		if (averages.firefox === null) continue;

		const values = {} as Record<BrowserKey, CellValue>;
		for (const { key } of BROWSERS) {
			values[key] = { average: averages[key], formatted: formatSlowdown(averages[key]) };
		}

		const diffs = {} as Record<BrowserKey, DiffValue>;
		for (const key of COMPARISON_KEYS) {
			const other = averages[key];
			const gap = other === null ? null : averages.firefox - other;
			diffs[key] = { diff: gap, formatted: formatGap(gap), color: gapColor(gap) };
		}

		rows.push({ test, label: displayName(test), unit: '%', values, diffs });
	}

	return {
		valueColumns: VALUE_KEYS.map(column),
		diffColumns: COMPARISON_KEYS.map(column),
		rows
	};
}

/** The tooltip line for a point: the slowdown, and the two numbers behind it. */
export function impactTooltip(series: string, point: ImpactPoint): string {
	const digits = (value: number) => round(value, 2);
	const baseline = point.approximate
		? `SP3 ${digits(point.baseline)} from ${point.baselineRevision.slice(0, 6)}`
		: `SP3 ${digits(point.baseline)}`;
	return (
		`${series}: ${formatSlowdown(point.value)} ` +
		`(${baseline}, a11y ${digits(point.accessible)}, ${point.revision.slice(0, 6)})`
	);
}
