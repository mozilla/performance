import { fetchJson } from '$lib/api/http';

export const ML_ENGINE_DATA_URL =
	'https://raw.githubusercontent.com/mozilla/performance-data/refs/heads/main/ml-engine-data.json';

interface RedashResult {
	query_result: { data: { rows: RawRow[] } };
}

/**
 * A row as published. Every metric is nullable, and which ones are null is
 * meaningful rather than incidental: the query FULL JOINs a success CTE against
 * a failure CTE on (date, engine_id), so a day on which an engine only failed
 * has null percentiles and null success counts, and a day on which it only
 * succeeded has null failure counts.
 */
interface RawRow {
	date: string;
	/**
	 * Null for failure events carrying no `engineId` extra -- see
	 * `UNATTRIBUTED`. Not a parse error, and not rare.
	 */
	engine_id: string | null;
	engine_creation_p5: number | null;
	engine_creation_p50: number | null;
	engine_creation_p75: number | null;
	engine_creation_p99: number | null;
	inference_p5: number | null;
	inference_p50: number | null;
	inference_p75: number | null;
	inference_p99: number | null;
	engine_creation_success_count: number | null;
	inference_success_count: number | null;
	engine_creation_failure_count: number | null;
	inference_failure_count: number | null;
}

/** One day of one engine's telemetry. */
export interface EnginePoint {
	date: Date;
	/** Median engine-creation latency in ms, or null on a day with no successes. */
	engineCreationP50: number | null;
	/** Median inference latency in ms, or null on a day with no successes. */
	inferenceP50: number | null;
	engineCreationSuccess: number;
	engineCreationFailure: number;
	inferenceSuccess: number;
	inferenceFailure: number;
}

/** Totals over the window, for the two stats cards beside each chart. */
export interface EngineTotals {
	engineCreationSuccess: number;
	engineCreationFailure: number;
	inferenceSuccess: number;
	inferenceFailure: number;
}

export interface Engine {
	/** The raw `engine_id`, or `UNATTRIBUTED` for the null one. */
	id: string;
	/** What to show the user; differs from `id` only for the two special keys. */
	label: string;
	points: EnginePoint[];
	totals: EngineTotals;
}

export const UNATTRIBUTED = '(unattributed)';

/**
 * Glean's overflow bucket for labeled metrics: everything past the label limit
 * is recorded under this one key. It is an aggregate of unrelated engines, so
 * its percentiles are not a latency anybody experiences.
 */
export const OTHER_ENGINE = '__other__';

export const ENGINE_LABELS: Readonly<Record<string, string>> = {
	[OTHER_ENGINE]: '__other__ (Glean overflow bucket)'
};

const count = (value: number | null): number => (typeof value === 'number' ? value : 0);

/**
 * Parse a `date` from this dataset, which is a calendar day and not an instant.
 *
 * The query selects `DATE(submission_timestamp)`, so a row says "the 12th of
 * July" and nothing about a time. `Date.parse` reads a bare `YYYY-MM-DD` as UTC
 * midnight, and everything that then formats it -- `Intl.DateTimeFormat` for
 * the window, Chart.js for the axis ticks and tooltips -- formats in the
 * viewer's zone, so west of Greenwich every date on the page renders as the day
 * before. Nobody in UTC+0 would ever see it, which is the kind of bug that gets
 * shipped.
 *
 * Built as local midnight instead, so the day that was aggregated is the day
 * that is displayed, in any zone. This is deliberately not what `data.ts` does,
 * and the difference is in the data rather than in the choice: `ml-data.json`
 * carries full timestamps (`2026-04-10T21:13:35Z`) because each row is one CI
 * push, and a push really is an instant.
 *
 * A full timestamp is still accepted, so the page keeps working if the upstream
 * query ever stops truncating to a day.
 */
export function parseDay(raw: string): Date | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);

	if (match) {
		const [, year, month, day] = match.map(Number);
		const date = new Date(year, month - 1, day);
		// `new Date(2026, 12, 40)` rolls silently into the next year, so an
		// out-of-range field would otherwise become a plausible wrong date.
		const valid =
			date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
		return valid ? date : null;
	}

	const time = Date.parse(raw);
	return Number.isNaN(time) ? null : new Date(time);
}

export function groupByEngine(rows: readonly RawRow[]): Engine[] {
	const byId = new Map<string, EnginePoint[]>();

	for (const row of rows) {
		const date = parseDay(row.date);
		if (!date) continue;

		const id = row.engine_id ?? UNATTRIBUTED;
		let points = byId.get(id);
		if (!points) byId.set(id, (points = []));

		points.push({
			date,
			// Percentiles are kept nullable rather than coerced to 0: a day with
			// no successful engine creation is a gap in the line, and a zero
			// would read as "instantaneous" and drag the y-axis to the floor.
			engineCreationP50: row.engine_creation_p50,
			inferenceP50: row.inference_p50,
			// Counts are coerced, because a null count here means the FULL JOIN
			// found no matching row on that side, i.e. none happened.
			engineCreationSuccess: count(row.engine_creation_success_count),
			engineCreationFailure: count(row.engine_creation_failure_count),
			inferenceSuccess: count(row.inference_success_count),
			inferenceFailure: count(row.inference_failure_count)
		});
	}

	const engines: Engine[] = [];
	for (const [id, points] of byId) {
		points.sort((a, b) => a.date.getTime() - b.date.getTime());
		engines.push({ id, label: ENGINE_LABELS[id] ?? id, points, totals: totalsOf(points) });
	}

	const rank = (engine: Engine) =>
		engine.id === UNATTRIBUTED ? 2 : engine.id === OTHER_ENGINE ? 1 : 0;
	engines.sort(
		(a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id, undefined, { numeric: true })
	);

	return engines;
}

export function totalsOf(points: readonly EnginePoint[]): EngineTotals {
	const totals: EngineTotals = {
		engineCreationSuccess: 0,
		engineCreationFailure: 0,
		inferenceSuccess: 0,
		inferenceFailure: 0
	};

	for (const point of points) {
		totals.engineCreationSuccess += point.engineCreationSuccess;
		totals.engineCreationFailure += point.engineCreationFailure;
		totals.inferenceSuccess += point.inferenceSuccess;
		totals.inferenceFailure += point.inferenceFailure;
	}

	return totals;
}

export function failureRate(success: number, failure: number): number | null {
	const attempts = success + failure;
	return attempts === 0 ? null : failure / attempts;
}

/** The window the file covers, taken from the data rather than assumed. */
export function dateRange(engines: readonly Engine[]): { first: Date; last: Date } | null {
	let first: number | undefined;
	let last: number | undefined;

	for (const engine of engines) {
		for (const point of engine.points) {
			const time = point.date.getTime();
			if (first === undefined || time < first) first = time;
			if (last === undefined || time > last) last = time;
		}
	}

	return first === undefined || last === undefined
		? null
		: { first: new Date(first), last: new Date(last) };
}

export async function fetchEngineData(signal?: AbortSignal): Promise<Engine[]> {
	const raw = await fetchJson<RedashResult>(ML_ENGINE_DATA_URL, { signal });
	return groupByEngine(raw.query_result?.data?.rows ?? []);
}
