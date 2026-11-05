import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubFetch, stubJson } from '../tests/fetch-mock';
import { openTreeherderJob } from './open-job';

const job = { repository: 'autoland' as const, revision: 'abc123', jobId: 42 };

function stubOpen() {
	const tab = { opener: {} as unknown, location: { href: 'about:blank' } };
	const open = vi.fn(() => tab);
	vi.stubGlobal('window', { open });
	return { open, tab };
}

describe('openTreeherderJob', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('opens the tab before the lookup, then selects the task run', async () => {
		const fetch = stubJson({ taskcluster_metadata: { task_id: 'T1', retry_id: 2 } });
		const { open, tab } = stubOpen();

		const done = openTreeherderJob(job);
		expect(open).toHaveBeenCalledTimes(1);
		await done;

		expect(fetch.mock.calls[0][0]).toContain('/api/project/autoland/jobs/42/');
		expect(tab.opener).toBeNull();
		expect(tab.location.href).toBe(
			'https://treeherder.mozilla.org/jobs?repo=autoland&revision=abc123' +
				'&group_state=expanded&selectedTaskRun=T1.2'
		);
	});

	it('falls back to the push when the lookup fails', async () => {
		stubFetch(() => new Response('nope', { status: 500 }));
		const { tab } = stubOpen();

		// A different job: fetchJson caches the first test's response by URL.
		await openTreeherderJob({ ...job, jobId: 43 });
		expect(tab.location.href).toBe(
			'https://treeherder.mozilla.org/jobs?repo=autoland&revision=abc123'
		);
	});

	it('does nothing for a point with no job', async () => {
		const { open } = stubOpen();
		await openTreeherderJob({ ...job, jobId: 0 });
		expect(open).not.toHaveBeenCalled();
	});
});
