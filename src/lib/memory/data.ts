/**
 * Parsing the long-format memory CSV.
 *
 * Shape: `date, process, [version,] <probe>_p75_<unit>, ...`. The `version`
 * column is optional: without it (nightly) every row pools under ALL, which is
 * exactly the shape the default display mode reads -- and with no per-version
 * rows there are no release markers either.
 */
import { type CsvRow, fetchCsv, numeric } from '$lib/api/csv';
import { ALL, CHANNEL_URLS, type Channel, type Probe } from './config';

/** Columns that describe a row rather than carry a probe value. */
const META_COLUMNS = new Set(['date', 'process', 'version']);

export interface MemoryRow {
	date: Date;
	values: Record<string, number | null>;
}

/** process -> version -> rows, oldest first. */
export type MemoryData = Record<string, Record<string, MemoryRow[]>>;

export function parseMemoryRows(rows: CsvRow[]): MemoryData {
	const byProcess: MemoryData = {};

	for (const row of rows) {
		const date = row.date;
		const process = row.process;
		if (!date || !process) continue;

		const time = Date.parse(date);
		if (Number.isNaN(time)) continue;

		const values: Record<string, number | null> = {};
		for (const [column, value] of Object.entries(row)) {
			if (META_COLUMNS.has(column)) continue;
			values[column] = numeric(value);
		}

		const version = row.version || ALL;
		const versions = (byProcess[process] ??= {});
		(versions[version] ??= []).push({ date: new Date(time), values });
	}

	for (const versions of Object.values(byProcess)) {
		for (const rows of Object.values(versions)) {
			rows.sort((a, b) => a.date.getTime() - b.date.getTime());
		}
	}

	return byProcess;
}

export async function fetchMemoryData(channel: Channel, signal?: AbortSignal): Promise<MemoryData> {
	return parseMemoryRows(await fetchCsv(CHANNEL_URLS[channel], signal));
}

/**
 * Major versions present for a process, oldest first. Sorted numerically so the
 * legend reads 141, 142, ... rather than lexicographically.
 */
export function versionsIn(processData: Record<string, MemoryRow[]> | undefined): string[] {
	return Object.keys(processData ?? {})
		.filter((version) => version !== ALL)
		.sort((a, b) => Number(a) - Number(b));
}

export interface Point {
	x: number;
	y: number | null;
}

/**
 * Per-version series cover different date ranges, so datasets carry their own
 * {x, y} points rather than sharing one labels array.
 */
export function pointsFor(rows: MemoryRow[] | undefined, column: string): Point[] {
	return (rows ?? []).map((row) => ({ x: row.date.getTime(), y: row.values[column] ?? null }));
}

export interface Crossing {
	date: Date;
	version: string;
}

/**
 * The day each major version crossed the charting threshold for this probe: the
 * first date its series carries a value.
 *
 * The release query only emits a version's rows once it holds MIN_SHARE_PCT of
 * that day's volume, so the crossing date needs no column of its own -- it is
 * where the version's data begins.
 */
export function thresholdCrossings(
	probe: Probe,
	processData: Record<string, MemoryRow[]> | undefined
): Crossing[] {
	const pooled = processData?.[ALL] ?? [];
	if (pooled.length === 0) return [];

	const windowStart = pooled[0].date.getTime();
	const crossings: Crossing[] = [];

	for (const version of versionsIn(processData)) {
		const first = (processData?.[version] ?? []).find(
			(row) => row.values[probe.p75] != null || row.values[probe.p95] != null
		);
		// A version already present on the window's first day crossed before the
		// window opened, so there is no crossing to mark.
		if (first && first.date.getTime() > windowStart) {
			crossings.push({ date: first.date, version });
		}
	}

	return crossings.sort((a, b) => a.date.getTime() - b.date.getTime());
}
