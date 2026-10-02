import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stubJson } from '../../tests/fetch-mock';
import { signature } from '../../tests/factories';
import { clearHttpCache } from './http';
import {
	fetchSeries,
	fetchSignatures,
	perfherderGraphsUrl,
	pushlogUrl,
	selectCanonicalSignatures
} from './treeherder';

describe('selectCanonicalSignatures', () => {
	it('prefers the signature with the fewest extra_options', () => {
		const base = signature({ id: 1, extra_options: [] });
		const profiled = signature({ id: 2, extra_options: ['gecko-profile'] });

		expect(selectCanonicalSignatures([profiled, base])).toEqual([base]);
	});

	it('is independent of input order', () => {
		const base = signature({ id: 1, extra_options: [] });
		const profiled = signature({ id: 2, extra_options: ['etw-profile'] });

		expect(selectCanonicalSignatures([base, profiled])).toEqual(
			selectCanonicalSignatures([profiled, base])
		);
	});

	it('treats a missing extra_options as empty', () => {
		const missing = signature({ id: 1, extra_options: undefined });
		const present = signature({ id: 2, extra_options: ['nova'] });

		expect(selectCanonicalSignatures([present, missing])).toEqual([missing]);
	});

	it('keeps one signature per application/platform/suite/test group', () => {
		const sigs = [
			signature({ id: 1, application: 'firefox', test: 'score' }),
			signature({ id: 2, application: 'chrome', test: 'score' }),
			signature({ id: 3, application: 'firefox', test: 'TodoMVC-Vue/total' }),
			signature({
				id: 4,
				application: 'firefox',
				test: 'score',
				machine_platform: 'linux2404-64-shippable'
			})
		];

		expect(selectCanonicalSignatures(sigs)).toHaveLength(4);
	});

	it('breaks ties on equal extra_options by preferring the newest id', () => {
		const older = signature({ id: 10, extra_options: ['a'] });
		const newer = signature({ id: 20, extra_options: ['b'] });

		expect(selectCanonicalSignatures([older, newer])).toEqual([newer]);
	});

	// On Android the base job is the one *without* 'fission', which the
	// fewest-options rule yields for free. That property is the reason the rule
	// is expressed this way rather than as a blocklist, so it is worth pinning.
	it('yields the non-fission Android job without naming fission', () => {
		const nonFission = signature({
			id: 1,
			application: 'fenix',
			machine_platform: 'android-hw-s24-14-0-aarch64-shippable',
			extra_options: []
		});
		const fission = signature({
			id: 2,
			application: 'fenix',
			machine_platform: 'android-hw-s24-14-0-aarch64-shippable',
			extra_options: ['fission']
		});

		expect(selectCanonicalSignatures([fission, nonFission])).toEqual([nonFission]);
	});

	it('returns nothing for no input', () => {
		expect(selectCanonicalSignatures([])).toEqual([]);
	});
});

describe('fetchSignatures', () => {
	beforeEach(() => clearHttpCache());
	afterEach(() => vi.unstubAllGlobals());

	it('folds the response key in as signature_hash and tags the repository', async () => {
		stubJson({
			abc: {
				id: 1,
				framework_id: 13,
				machine_platform: 'linux2404-64-shippable',
				suite: 'speedometer3'
			}
		});

		const [sig] = await fetchSignatures({
			repository: 'autoland',
			framework: 13,
			platform: 'linux2404-64-shippable'
		});

		expect(sig.signature_hash).toBe('abc');
		expect(sig.repository).toBe('autoland');
	});
});

describe('fetchSeries', () => {
	beforeEach(() => clearHttpCache());
	afterEach(() => vi.unstubAllGlobals());

	const respondWith = (data: unknown) => stubJson([{ data }]);

	it('accepts push_timestamp as epoch seconds', async () => {
		respondWith([
			{ job_id: 1, id: 1, value: 5, push_timestamp: 1_754_006_400, push_id: 1, revision: 'a' }
		]);

		const [point] = await fetchSeries({
			signature: signature(),
			framework: 13,
			days: 30,
			replicates: false
		});

		expect(point.date.toISOString()).toBe('2025-08-01T00:00:00.000Z');
	});

	it('accepts push_timestamp as an ISO string', async () => {
		respondWith([
			{
				job_id: 1,
				id: 1,
				value: 5,
				push_timestamp: '2026-08-01T00:00:00Z',
				push_id: 1,
				revision: 'a'
			}
		]);

		const [point] = await fetchSeries({
			signature: signature(),
			framework: 13,
			days: 30,
			replicates: false
		});

		expect(point.date.toISOString()).toBe('2026-08-01T00:00:00.000Z');
	});

	it('inlines signature metadata onto each measurement', async () => {
		respondWith([
			{
				job_id: 42,
				id: 1,
				value: 5,
				push_timestamp: 1_754_006_400,
				push_id: 1,
				revision: 'abc',
				machine_name: 'm1'
			}
		]);

		const [point] = await fetchSeries({
			signature: signature({ id: 7, application: 'chrome', extra_options: ['nova'] }),
			framework: 13,
			days: 30,
			replicates: false
		});

		expect(point).toMatchObject({
			signatureId: 7,
			application: 'chrome',
			extraOptions: ['nova'],
			machineName: 'm1',
			jobId: 42
		});
	});

	it('returns an empty series rather than throwing on an unexpected shape', async () => {
		stubJson({ detail: 'not found' });

		await expect(
			fetchSeries({ signature: signature(), framework: 13, days: 30, replicates: false })
		).resolves.toEqual([]);
	});

	it('requests replicates only when asked', async () => {
		const spy = stubJson([{ data: [] }]);

		await fetchSeries({ signature: signature(), framework: 13, days: 30, replicates: false });
		expect(spy.mock.calls[0][0]).not.toContain('replicates');

		await fetchSeries({ signature: signature(), framework: 13, days: 30, replicates: true });
		expect(spy.mock.calls[1][0]).toContain('replicates=true');
	});
});

describe('outbound links', () => {
	it('builds a Perfherder graphs URL with one series per entry', () => {
		const url = perfherderGraphsUrl([
			{ repository: 'mozilla-central', signatureId: 1, framework: 13 },
			{ repository: 'autoland', signatureId: 2, framework: 13 }
		]);

		expect(url).toContain('series=mozilla-central,1,1,13');
		expect(url).toContain('series=autoland,2,1,13');
	});

	it('uses the integration path for autoland pushlogs', () => {
		expect(pushlogUrl('autoland', 'aaa', 'bbb')).toContain('/integration/autoland/');
		expect(pushlogUrl('mozilla-central', 'aaa', 'bbb')).toContain('/mozilla-central/');
	});
});
