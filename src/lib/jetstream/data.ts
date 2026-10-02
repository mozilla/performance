import type { Measurement, Repository } from '$lib/api/treeherder';
import { isSafariApplication } from '$lib/browsers';
import { loadMeasurements, loadSignatures } from '$lib/speedometer/data';
import { JETSTREAM_FRAMEWORK, JETSTREAM_SUITE, platformByKey } from './config';

export const JETSTREAM_DATA_URL =
	'https://raw.githubusercontent.com/mozilla/performance-data/refs/heads/main/jetstream-data.json.gz';

export interface JetStreamRow {
	date: string;
	test: string;
	suite: string;
	platform: string;
	application: string;
	value: number;
}

interface RedashResult {
	query_result: { data: { rows: JetStreamRow[] } };
}

export async function fetchJetStreamSnapshot(signal?: AbortSignal): Promise<JetStreamRow[]> {
	const response = await fetch(JETSTREAM_DATA_URL, { signal });
	if (!response.ok || !response.body) {
		throw new Error(`${response.status} ${response.statusText} for ${JETSTREAM_DATA_URL}`);
	}

	const inflated = response.body.pipeThrough(new DecompressionStream('gzip'));
	const text = await new Response(inflated).text();
	const parsed = JSON.parse(text) as RedashResult;

	return parsed.query_result?.data?.rows ?? [];
}

/**
 * Rows for one platform, converted to the shared Measurement shape.
 *
 * With a `safariPlatform`, Safari's rows come from there and only from there:
 * this feeds the comparison table, where Safari's old platform would skew the
 * average.
 */
export function toMeasurements(
	rows: readonly JetStreamRow[],
	platforms: readonly string[],
	safariPlatform?: string
): Measurement[] {
	const wanted = new Set(platforms);
	const matches = (row: JetStreamRow) =>
		safariPlatform && isSafariApplication(row.application)
			? row.platform === safariPlatform
			: wanted.has(row.platform);

	return rows
		.filter(matches)
		.map((row) => ({
			date: new Date(row.date),
			value: row.value,
			test: row.test,
			suite: row.suite,
			platform: row.platform,
			application: row.application,
			signatureId: -1,
			repository: 'mozilla-central' as Repository,
			revision: '',
			jobId: -1,
			extraOptions: []
		}))
		.filter((measurement) => !Number.isNaN(measurement.date.getTime()));
}

/** Every test present in the snapshot for a platform, score first. */
export function testsIn(measurements: readonly Measurement[]): string[] {
	const tests = [...new Set(measurements.map((m) => m.test))].sort();
	return tests.includes('score') ? ['score', ...tests.filter((t) => t !== 'score')] : tests;
}

export async function loadJetStreamSignatures(
	platformKey: string,
	repository: Repository,
	signal?: AbortSignal
) {
	const { platforms, safariPlatform } = platformByKey(platformKey);
	return loadSignatures(platformKey, repository, signal, {
		platforms,
		safariPlatform,
		suite: JETSTREAM_SUITE
	});
}

export async function loadJetStreamSeries(
	signatures: Parameters<typeof loadMeasurements>[0],
	days: number,
	signal?: AbortSignal
) {
	return loadMeasurements(signatures, days, false, signal, JETSTREAM_FRAMEWORK);
}
