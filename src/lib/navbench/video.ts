/**
 * Replicate screen recordings for a clicked Navigation Benchmark point.
 *
 * A NavBench job records every replicate of every site and scenario, so one
 * archive holds ~70 recordings in seven groups. The page shows one group at a
 * time, defaulting to the site whose chart was clicked.
 */
import {
	fetchArtifactList,
	fetchArtifactJson,
	fetchArtifactTarGz,
	findPerfherderArtifact,
	type PerfherderData,
	type TaskArtifact
} from '$lib/api/taskcluster';
import type { TarEntry } from '$lib/api/targz';
import { fetchTaskRef, type TaskRef } from '$lib/api/treeherder';
import {
	isVideo,
	NoVideoError,
	pairVideosWithReplicates,
	type VideoGroup
} from '$lib/replicate-videos';
import { displayName, NAVBENCH_REPOSITORY, NAVBENCH_SUITE, videoScenario } from './config';

const ARCHIVE_PREFERENCE = [
	'public/test_info/browsertime-videos-annotated.tgz',
	'public/test_info/browsertime-videos-original.tgz'
];

function findArchive(artifacts: readonly TaskArtifact[]): string | undefined {
	return ARCHIVE_PREFERENCE.find((name) => artifacts.some((artifact) => artifact.name === name));
}

/**
 * The scenario directory a recording sits under.
 *
 * Paths look like
 * `browsertime-videos-annotated/nav-bench/pages/www_bbc_com/bbc-nav-subnav/data/video/3.mp4`,
 * so the component before `data/video` is the scenario, which is the test name
 * without its `-score` suffix.
 */
export function scenarioOf(path: string): string | undefined {
	const match = /\/pages\/[^/]+\/([^/]+)\/data\/video\//.exec(path);
	return match?.[1];
}

/** Group an archive's recordings by scenario directory. */
export function groupByScenario(entries: readonly TarEntry[]): Map<string, TarEntry[]> {
	const groups = new Map<string, TarEntry[]>();

	for (const entry of entries) {
		if (!isVideo(entry)) continue;
		const scenario = scenarioOf(entry.name);
		if (!scenario) continue;

		const existing = groups.get(scenario);
		if (existing) existing.push(entry);
		else groups.set(scenario, [entry]);
	}

	return groups;
}

export function replicatesByTest(data: PerfherderData): Map<string, number[]> {
	const suite = data.suites?.find((each) => each.name === NAVBENCH_SUITE);
	const byTest = new Map<string, number[]>();

	for (const subtest of suite?.subtests ?? []) {
		if (subtest.replicates?.length) byTest.set(subtest.name, subtest.replicates);
	}

	return byTest;
}

export interface NavBenchRecordings {
	task: TaskRef;
	groups: VideoGroup[];
}

export async function loadNavBenchVideos(
	jobId: number,
	signal?: AbortSignal
): Promise<NavBenchRecordings> {
	const task = await fetchTaskRef(NAVBENCH_REPOSITORY, jobId);
	if (!task) throw new NoVideoError(`No Taskcluster task is recorded for job ${jobId}.`);

	const artifacts = await fetchArtifactList(task.taskId, task.retryId, signal);

	const archiveName = findArchive(artifacts);
	if (!archiveName) throw new NoVideoError('This job did not publish a video archive.');

	const perfherderName = findPerfherderArtifact(artifacts);
	const replicates = perfherderName
		? await fetchArtifactJson<PerfherderData>(task.taskId, task.retryId, perfherderName, signal)
				.then(replicatesByTest)
				// Unlabelled recordings are still worth watching.
				.catch(() => new Map<string, number[]>())
		: new Map<string, number[]>();

	const entries = await fetchArtifactTarGz(task.taskId, task.retryId, archiveName, signal);

	const groups: VideoGroup[] = [...groupByScenario(entries).entries()]
		.map(([scenario, files]) => ({
			key: scenario,
			label: displayName(scenario),
			// browsertime numbers these from one: 1.mp4 … 10.mp4.
			videos: pairVideosWithReplicates(files, replicates.get(`${scenario}-score`) ?? [], {
				indexBase: 1
			})
		}))
		.sort((a, b) => a.key.localeCompare(b.key));

	if (groups.length === 0) {
		throw new NoVideoError('The video archive for this job contains no recordings.');
	}

	return { task, groups };
}

/** The group to open for a chart click, given the test that was charted. */
export function defaultGroup(groups: readonly VideoGroup[], test: string): string {
	const scenario = videoScenario(test);
	return groups.some((group) => group.key === scenario) ? scenario! : groups[0].key;
}
