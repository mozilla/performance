import type { Repository } from '$lib/api/treeherder';
import { normalizeParams } from '$lib/param-aliases';
import { bool, parseState, patchUrl, str, stringSet } from '$lib/url-state';

import { rangeField } from '$lib/speedometer/config';
import { DEFAULT_DEVICE, DEFAULT_TEST, DEVICE_KEYS, TEST_KEYS } from './config';

const REPOSITORIES: readonly Repository[] = ['mozilla-central', 'autoland'];

export const androidSchema = {
	device: str(DEFAULT_DEVICE, DEVICE_KEYS),
	test: str(DEFAULT_TEST, TEST_KEYS),
	range: rangeField(),
	repository: str('mozilla-central', REPOSITORIES),
	replicates: bool(false),
	alerts: bool(false),
	/** Series labels hidden by clicking the chart legend. */
	hide: stringSet(),
	/** Treeherder job whose replicate videos are open. Empty means none. */
	job: str(''),
	/** Which replicate's video is showing, as a string so it can be absent. */
	replicate: str(''),

	sort: str(''),
	dir: str('desc', ['asc', 'desc'] as const)
};

export interface AndroidState {
	device: string;
	test: string;
	range: number;
	repository: Repository;
	replicates: boolean;
	alerts: boolean;
	hide: ReadonlySet<string>;
	job: string;
	replicate: string;
	sort: string;
	dir: 'asc' | 'desc';
}

// timeline is a range alias. Recordings use Treeherder job IDs; Taskcluster
// taskId/retryId cannot identify that selection and are removed from URLs.
function normalizePageParams(url: URL): URL {
	return normalizeParams(url, {
		rename: { timeline: 'range' },
		drop: ['taskId', 'retryId']
	});
}

export function parseAndroidState(url: URL): AndroidState {
	return parseState(androidSchema, normalizePageParams(url)) as AndroidState;
}

export function androidHref(url: URL, patch: Partial<AndroidState>): string {
	return patchUrl(androidSchema, normalizePageParams(url), patch);
}

export function withVideoClosed(patch: Partial<AndroidState>): Partial<AndroidState> {
	return { ...patch, job: '', replicate: '' };
}

/** The open job as a number, or null when none is selected or it is malformed. */
export function openJobId(state: AndroidState): number | null {
	if (state.job === '') return null;
	const jobId = Number(state.job);
	return Number.isInteger(jobId) && jobId > 0 ? jobId : null;
}

/** The selected replicate index, clamped to what the archive actually holds. */
export function openReplicateIndex(state: AndroidState, count: number): number {
	const index = Number(state.replicate);
	return Number.isInteger(index) && index >= 0 && index < count ? index : 0;
}
