/**
 * Typed client for the Taskcluster queue's artifact API.
 *
 * Used by the Android and Navigation Benchmark pages, which show the screen
 * recording a performance test made of each replicate. Treeherder's performance
 * API does not carry per-replicate data or videos at all: both live in job
 * artifacts, so the page has to go to Taskcluster for them.
 *
 * Two artifacts matter per job:
 *
 *  - `public/build/perfherder-data-<hash>.json`, the raw measurement the job
 *    submitted, including each replicate's value. The hash in the filename
 *    changes per job, so the name has to be discovered from the artifact list
 *    rather than constructed.
 *  - `public/build/<suite>.tgz`, holding one video per replicate.
 *
 * Note that the queue redirects artifact downloads to a storage host with a
 * signed URL. `fetch` follows that transparently; it is only worth knowing
 * because it means an artifact response is cross-origin twice over.
 */
import { fetchJson } from './http';
import { fetchTarGz, type TarEntry } from './targz';

const QUEUE = 'https://firefox-ci-tc.services.mozilla.com/api/queue/v1';

export interface TaskArtifact {
	name: string;
	contentType: string;
}

interface ArtifactListResponse {
	artifacts: TaskArtifact[];
}

export function artifactUrl(taskId: string, runId: number, name: string): string {
	return `${QUEUE}/task/${taskId}/runs/${runId}/artifacts/${name}`;
}

/**
 * Every artifact a task run published.
 *
 * Cached by `fetchJson`: a completed run's artifact list never changes, and the
 * page asks for it again whenever the user reopens the same data point.
 */
export async function fetchArtifactList(
	taskId: string,
	runId: number,
	signal?: AbortSignal
): Promise<TaskArtifact[]> {
	const response = await fetchJson<ArtifactListResponse>(
		`${QUEUE}/task/${taskId}/runs/${runId}/artifacts`,
		{ signal }
	);
	return response.artifacts ?? [];
}

export async function fetchArtifactJson<T>(
	taskId: string,
	runId: number,
	name: string,
	signal?: AbortSignal
): Promise<T> {
	return fetchJson<T>(artifactUrl(taskId, runId, name), { signal });
}

export async function fetchArtifactTarGz(
	taskId: string,
	runId: number,
	name: string,
	signal?: AbortSignal
): Promise<TarEntry[]> {
	return fetchTarGz(artifactUrl(taskId, runId, name), signal);
}

export function findPerfherderArtifact(artifacts: readonly TaskArtifact[]): string | undefined {
	return artifacts.find((artifact) =>
		/^public\/(build|test_info)\/perfherder-data(-[0-9a-f]+)*\.json$/.test(artifact.name)
	)?.name;
}

// --- perfherder-data.json -------------------------------------------------

export interface PerfherderSubtest {
	name: string;
	value?: number;
	unit?: string;
	replicates?: number[];
}

export interface PerfherderSuite {
	name: string;
	value?: number;
	unit?: string;
	extraOptions?: string[];
	subtests?: PerfherderSubtest[];
}

export interface PerfherderData {
	suites: PerfherderSuite[];
	application?: { name?: string };
}

export function replicatesFor(data: PerfherderData, suiteName: string, testName: string): number[] {
	const suite = data.suites?.find((each) => each.name === suiteName);
	if (!suite) return [];

	const subtest = suite.subtests?.find((each) => each.name === testName);
	if (subtest?.replicates?.length) return subtest.replicates;

	// Some suites report a single value with no subtest breakdown.
	return suite.value !== undefined && !suite.subtests?.length ? [suite.value] : [];
}
