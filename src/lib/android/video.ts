/**
 * Replicate screen recordings for a clicked Android data point.
 *
 * Resolve the job to a Taskcluster task, read the job's own perfherder-data
 * artifact for the per-replicate values, unpack the `<suite>.tgz` archive, and
 * pair the two up. The pairing itself is shared with NavBench; what is
 * Android-specific is where the archive lives and that there is one flat set of
 * recordings rather than one per site.
 */
import {
	fetchArtifactList,
	fetchArtifactTarGz,
	fetchArtifactJson,
	findPerfherderArtifact,
	type PerfherderData,
	replicatesFor
} from '$lib/api/taskcluster';
import { fetchTaskRef, type Repository, type TaskRef } from '$lib/api/treeherder';
import { NoVideoError, pairVideosWithReplicates, type ReplicateVideo } from '$lib/replicate-videos';
import type { AndroidTest } from './config';

export interface ReplicateSet {
	task: TaskRef;
	videos: ReplicateVideo[];
	/** Every replicate value the job reported, whether or not it has a video. */
	replicates: number[];
}

/** Everything needed to show the video panel for one data point. */
export async function loadReplicateVideos(
	repository: Repository,
	jobId: number,
	test: AndroidTest,
	signal?: AbortSignal
): Promise<ReplicateSet> {
	const task = await fetchTaskRef(repository, jobId);
	if (!task) throw new NoVideoError(`No Taskcluster task is recorded for job ${jobId}.`);

	const artifacts = await fetchArtifactList(task.taskId, task.retryId, signal);

	const archiveName = `public/build/${test.suite}.tgz`;
	if (!artifacts.some((artifact) => artifact.name === archiveName)) {
		throw new NoVideoError('This job did not publish a video archive.');
	}

	const perfherderName = findPerfherderArtifact(artifacts);

	// The values are a nicety -- without them the videos are still watchable,
	// just unlabelled -- so a missing or unreadable measurement artifact must
	// not fail the whole panel.
	const replicates = perfherderName
		? await fetchArtifactJson<PerfherderData>(task.taskId, task.retryId, perfherderName, signal)
				.then((data) => replicatesFor(data, test.suite, test.test))
				.catch(() => [])
		: [];

	const entries = await fetchArtifactTarGz(task.taskId, task.retryId, archiveName, signal);
	// mozperftest numbers these from zero: vid0_fenix.mp4.
	const videos = pairVideosWithReplicates(entries, replicates, { indexBase: 0 });

	if (videos.length === 0) {
		throw new NoVideoError('The video archive for this job contains no recordings.');
	}

	return { task, videos, replicates };
}
