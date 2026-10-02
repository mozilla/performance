import { describe, expect, it } from 'vitest';
import {
	artifactUrl,
	findPerfherderArtifact,
	type PerfherderData,
	replicatesFor,
	type TaskArtifact
} from './taskcluster';

const artifact = (name: string, contentType = 'application/json'): TaskArtifact => ({
	name,
	contentType
});

/** The artifact list of a real newssite-applink-startup job. */
const REAL_LIST: TaskArtifact[] = [
	artifact('public/build/newssite-applink-startupstd-output.json'),
	artifact('public/build/newssite_applink_startup_submetricsstd-output.json'),
	artifact('public/build/newssite-applink-startup.tgz', 'application/x-compressed-tar'),
	artifact('public/build/perfherder-data-2992991643-f67459c7.json'),
	artifact('public/fetch/perfherder-data-fetch-content.json'),
	artifact('public/logs/live_backing.log', 'text/plain')
];

describe('artifactUrl', () => {
	it('addresses the run, not just the task', () => {
		expect(artifactUrl('NUoL0MMvQ9OMmEdGu8hGdw', 1, 'public/build/x.tgz')).toBe(
			'https://firefox-ci-tc.services.mozilla.com/api/queue/v1' +
				'/task/NUoL0MMvQ9OMmEdGu8hGdw/runs/1/artifacts/public/build/x.tgz'
		);
	});
});

describe('findPerfherderArtifact', () => {
	it('finds the hashed measurement file', () => {
		expect(findPerfherderArtifact(REAL_LIST)).toBe(
			'public/build/perfherder-data-2992991643-f67459c7.json'
		);
	});

	it('does not match the fetch-content manifest', () => {
		const list = [
			artifact('public/build/perfherder-data-fetch-content.json'),
			artifact('public/build/perfherder-data-2992991643-f67459c7.json')
		];

		expect(findPerfherderArtifact(list)).toBe(
			'public/build/perfherder-data-2992991643-f67459c7.json'
		);
	});

	it('accepts the unhashed name for jobs that still publish it', () => {
		expect(findPerfherderArtifact([artifact('public/build/perfherder-data.json')])).toBe(
			'public/build/perfherder-data.json'
		);
	});

	it('finds the browsertime measurement among its similarly-named neighbours', () => {
		const navbench = [
			artifact('perftest/mitmproxy.log', 'text/plain'),
			artifact('public/build/perfherder-data-mozharness-actions.json'),
			artifact('public/fetch/perfherder-data-fetch-content.json'),
			artifact('public/test_info/browsertime-videos-annotated.tgz', 'application/octet-stream'),
			artifact('public/test_info/perfherder-data.json'),
			artifact('public/test_info/profile_resource-usage.json')
		];

		expect(findPerfherderArtifact(navbench)).toBe('public/test_info/perfherder-data.json');
	});

	it('returns undefined when the job published no measurement', () => {
		expect(
			findPerfherderArtifact([artifact('public/logs/live.log', 'text/plain')])
		).toBeUndefined();
	});
});

describe('replicatesFor', () => {
	/** Trimmed from a real perfherder-data artifact. */
	const data: PerfherderData = {
		suites: [
			{
				name: 'newssite-applink-startup',
				unit: 'ms',
				subtests: [
					{ name: 'applink_startup', value: 1639.56, replicates: [1643.5, 1713.7, 1588.4] }
				]
			},
			{
				name: 'newssite_applink_startup_submetrics',
				value: 1639.56,
				subtests: [
					{ name: 'newssite_applink_startup', replicates: [1643.5, 1713.7, 1588.4] },
					{ name: 'total-cpu-time', replicates: [5790, 4960, 4840] }
				]
			}
		]
	};

	it('returns the named subtest, not the first one', () => {
		expect(replicatesFor(data, 'newssite_applink_startup_submetrics', 'total-cpu-time')).toEqual([
			5790, 4960, 4840
		]);
	});

	it('reads the charted subtest out of its own suite', () => {
		expect(replicatesFor(data, 'newssite-applink-startup', 'applink_startup')).toEqual([
			1643.5, 1713.7, 1588.4
		]);
	});

	it('falls back to the suite value when a suite has no subtests', () => {
		const flat: PerfherderData = { suites: [{ name: 'startup', value: 812 }] };

		expect(replicatesFor(flat, 'startup', 'anything')).toEqual([812]);
	});

	it('returns nothing for an unknown suite or subtest', () => {
		expect(replicatesFor(data, 'nope', 'applink_startup')).toEqual([]);
		expect(replicatesFor(data, 'newssite-applink-startup', 'nope')).toEqual([]);
	});
});
