import {
	fetchTaskRef,
	treeherderJobUrl,
	treeherderPushUrl,
	type Repository
} from '#lib/api/treeherder.js';

export interface JobRef {
	repository: Repository;
	revision: string;
	jobId: number;
}

/**
 * Opens the Treeherder job a data point came from, in a new tab.
 *
 * Treeherder selects a job by its Taskcluster task run, which the performance
 * summary does not carry, so it is looked up first. The tab is opened
 * synchronously, before that lookup, because a `window.open` after an `await`
 * has lost the click's user activation and would be popup-blocked. If the
 * lookup fails the tab still lands on the push, just without the job selected.
 */
export async function openTreeherderJob(job: JobRef): Promise<void> {
	if (!job.jobId || !job.revision) return;

	const tab = window.open('about:blank', '_blank');
	if (!tab) return;
	tab.opener = null;

	let url = treeherderPushUrl(job.repository, job.revision);
	try {
		const task = await fetchTaskRef(job.repository, job.jobId);
		if (task) url = treeherderJobUrl(job.repository, job.revision, task);
	} catch {
		// Fall through to the push view.
	}
	tab.location.href = url;
}
