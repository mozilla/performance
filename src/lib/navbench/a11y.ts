/**
 * The Navigation Benchmark with accessibility on and off: the same tests run
 * plain (nav-bench) and with the accessibility service enabled
 * (nav-bench-a11y), which builds the accessibility tree that screen readers
 * and other assistive technologies present the page from.
 *
 * Compared push by push rather than as two independent averages. Both variants
 * run on the same autoland pushes, and nav-bench moves several percent between
 * pushes on its own, so the difference within a push is a much steadier signal
 * than the difference between two noisy means.
 */
import type { Measurement } from '#lib/api/treeherder.js';
import { classify } from '#lib/browsers.js';
import { OVERALL_TEST, testKey } from './config';

export interface PairedPush {
	revision: string;
	/** Push time; the latest of the runs, should a retrigger land later. */
	date: Date;
	/** Score with accessibility off, averaged over the push's runs. */
	off: number;
	/** Score with accessibility on, likewise. */
	on: number;
	/** See `displayTimeChange`. */
	change: number;
	/** An accessibility-enabled job on this push, to open from the chart. */
	jobId: number;
}

/**
 * The change in time to display the page with accessibility on, as a fraction:
 * 0.05 means it takes 5% longer, -0.05 that it takes 5% less.
 *
 * A score is 60000 / SpeedIndex, so `off / on - 1` is exactly the relative
 * change in SpeedIndex for one site, and for the overall score (a geometric
 * mean of scores) the geometric mean of those changes.
 */
export function displayTimeChange(off: number, on: number): number {
	return off / on - 1;
}

interface PushRuns {
	values: number[];
	date: Date;
	jobId: number;
}

/** Runs of one variant for one test, by revision. */
function byRevision(measurements: readonly Measurement[]): Map<string, PushRuns> {
	const runs = new Map<string, PushRuns>();
	for (const m of measurements) {
		const existing = runs.get(m.revision);
		if (existing) {
			existing.values.push(m.value);
			if (m.date > existing.date) existing.date = m.date;
		} else {
			runs.set(m.revision, { values: [m.value], date: m.date, jobId: m.jobId });
		}
	}
	return runs;
}

const mean = (values: readonly number[]) => values.reduce((a, b) => a + b, 0) / values.length;

/**
 * The pushes where one test ran both with accessibility off and on, oldest
 * first.
 *
 * Off is the plain shippable Firefox run only: Nightly-as-Release also runs on
 * these pushes, and pairing it with the shippable accessibility run would
 * compare two builds rather than one setting.
 */
export function pairByPush(measurements: readonly Measurement[], test: string): PairedPush[] {
	const forTest = measurements.filter((m) => testKey(m.test) === test);
	const off = byRevision(forTest.filter((m) => classify(m)?.key === 'firefox'));
	const on = byRevision(forTest.filter((m) => classify(m)?.key === 'firefox-a11y'));

	const pairs: PairedPush[] = [];
	for (const [revision, onRuns] of on) {
		const offRuns = off.get(revision);
		if (!offRuns) continue;

		const offValue = mean(offRuns.values);
		const onValue = mean(onRuns.values);
		if (offValue <= 0 || onValue <= 0) continue;

		pairs.push({
			revision,
			date: onRuns.date > offRuns.date ? onRuns.date : offRuns.date,
			off: offValue,
			on: onValue,
			change: displayTimeChange(offValue, onValue),
			jobId: onRuns.jobId
		});
	}

	return pairs.sort((a, b) => a.date.getTime() - b.date.getTime());
}

export interface A11yRow {
	test: string;
	/** Mean score over the paired pushes, accessibility off. */
	off: number;
	/** Mean score over the same pushes, accessibility on. */
	on: number;
	/** `displayTimeChange(off, on)` of the two means. */
	change: number;
	/** The smallest and largest single-push changes, to show the spread. */
	min: number;
	max: number;
	pushes: number;
	/** The pushes themselves, for the per-site charts. */
	pairs: PairedPush[];
}

/**
 * One row per test that has paired pushes: the overall score first, then the
 * sites from the largest change down, which is the order worth reading in.
 */
export function a11yRows(
	measurements: readonly Measurement[],
	tests: readonly string[]
): A11yRow[] {
	const rows: A11yRow[] = [];
	for (const test of tests) {
		const pairs = pairByPush(measurements, test);
		if (pairs.length === 0) continue;

		const off = mean(pairs.map((pair) => pair.off));
		const on = mean(pairs.map((pair) => pair.on));
		const each = pairs.map((pair) => pair.change);
		rows.push({
			test,
			off,
			on,
			change: displayTimeChange(off, on),
			min: Math.min(...each),
			max: Math.max(...each),
			pushes: pairs.length,
			pairs
		});
	}

	const overall = rows.filter((row) => row.test === OVERALL_TEST);
	const sites = rows.filter((row) => row.test !== OVERALL_TEST);
	return [...overall, ...sites.sort((a, b) => b.change - a.change)];
}

/**
 * The range every per-site chart shares, as fractions, so the charts can be
 * compared at a glance. Always includes zero, with a little room either side.
 */
export function sharedExtent(rows: readonly A11yRow[]): { min: number; max: number } {
	const values = rows.flatMap((row) => [row.min, row.max]);
	const min = Math.min(0, ...values);
	const max = Math.max(0, ...values);
	const pad = Math.max((max - min) * 0.08, 0.01);
	// Out to whole percentages, so the axes land on round numbers.
	return { min: Math.floor((min - pad) * 100) / 100, max: Math.ceil((max + pad) * 100) / 100 };
}

/** `+4.2%`, `-0.8%`: signed, since the direction is the point. */
export function formatChange(fraction: number): string {
	const percent = Math.round(fraction * 1000) / 10;
	return `${percent > 0 ? '+' : ''}${percent.toFixed(1)}%`;
}

/**
 * Below this size, a difference is within what nav-bench moves between pushes
 * on its own. Loose on purpose: with a handful of pushes, a small difference is
 * not yet a finding.
 */
export const NOISE_THRESHOLD = 0.03;

export function beyondNoise(fraction: number): boolean {
	return Math.abs(fraction) >= NOISE_THRESHOLD;
}
