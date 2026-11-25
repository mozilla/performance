import type { Measurement } from '#lib/api/treeherder.js';
import { isSafariApplication } from '#lib/browsers.js';
import { SCORE_TEST } from './config';

export const SPEEDOMETER_DATA_URL: string =
	import.meta.env.VITE_SPEEDOMETER_DATA_URL ||
	'https://raw.githubusercontent.com/mozilla/performance-data/refs/heads/main/speedometer-data.json.gz';

export const SNAPSHOT_SCORE_DAYS = 365;
export const SNAPSHOT_SUBTEST_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SpeedometerRow {
	date: string;
	test: string;
	suite: string;
	platform: string;
	application: string;
	signature_id: number;
	value: number;
	revision: string;
	worker_id: string | null;
}

interface RedashResult {
	query_result: { data: { rows: SpeedometerRow[] } };
}

export function snapshotCovers(
	tests: readonly string[],
	days: number,
	repository: string,
	replicates: boolean
): boolean {
	if (repository !== 'mozilla-central' || replicates) return false;
	return tests.every(
		(test) => days <= (test === SCORE_TEST ? SNAPSHOT_SCORE_DAYS : SNAPSHOT_SUBTEST_DAYS)
	);
}

async function download(): Promise<SpeedometerRow[]> {
	const response = await fetch(SPEEDOMETER_DATA_URL);
	if (!response.ok || !response.body) {
		throw new Error(`${response.status} ${response.statusText} for ${SPEEDOMETER_DATA_URL}`);
	}

	const inflated = response.body.pipeThrough(new DecompressionStream('gzip'));
	const parsed = JSON.parse(await new Response(inflated).text()) as RedashResult;
	return parsed.query_result?.data?.rows ?? [];
}

let pending: Promise<SpeedometerRow[]> | undefined;

export function fetchSpeedometerSnapshot(): Promise<SpeedometerRow[]> {
	pending ??= download().catch((error) => {
		pending = undefined;
		throw error;
	});
	return pending;
}

export interface SnapshotFilter {
	platforms: readonly string[];
	safariPlatform?: string;
	tests: readonly string[];
	days: number;
	now?: number;
}

export function snapshotMeasurements(
	rows: readonly SpeedometerRow[],
	{ platforms, safariPlatform, tests, days, now = Date.now() }: SnapshotFilter
): Measurement[] {
	const wanted = new Set(platforms);
	const wantedTests = new Set(tests);
	const since = now - days * DAY_MS;

	const matchesPlatform = (row: SpeedometerRow) =>
		wanted.has(row.platform) ||
		(safariPlatform !== undefined &&
			row.platform === safariPlatform &&
			isSafariApplication(row.application));

	const measurements: Measurement[] = [];
	for (const row of rows) {
		if (!wantedTests.has(row.test) || !matchesPlatform(row)) continue;
		const date = new Date(row.date);
		if (Number.isNaN(date.getTime()) || date.getTime() < since) continue;

		measurements.push({
			date,
			value: row.value,
			test: row.test,
			suite: row.suite,
			platform: row.platform,
			application: row.application,
			signatureId: row.signature_id,
			repository: 'mozilla-central',
			revision: row.revision,
			jobId: 0,
			machineName: row.worker_id ?? undefined,
			extraOptions: []
		});
	}
	return measurements;
}
