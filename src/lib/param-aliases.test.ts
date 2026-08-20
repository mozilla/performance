import { describe, expect, it } from 'vitest';
import { normalizeParams } from './param-aliases';
import { parseAndroidState } from './android/state';
import { jetStreamHref, parseJetStreamState } from './jetstream/state';
import { parseNavBenchState } from './navbench/state';
import { parseSpeedometerState } from './speedometer/state';

const at = (path: string, query: string) =>
	new URL(`https://performance.mozilla.org${path}${query}`);

describe('normalizeParams', () => {
	const spec = { rename: { repo: 'repository' }, drop: ['taskId'] };

	it('renames a parameter', () => {
		const url = normalizeParams(at('/x', '?repo=autoland'), spec);
		expect(url.searchParams.get('repository')).toBe('autoland');
		expect(url.searchParams.has('repo')).toBe(false);
	});

	it('keeps the canonical spelling when both are present, and still drops the alias', () => {
		const url = normalizeParams(at('/x', '?repo=autoland&repository=mozilla-central'), spec);
		expect(url.searchParams.get('repository')).toBe('mozilla-central');
		expect(url.searchParams.has('repo')).toBe(false);
	});

	it('removes parameters that cannot be honoured', () => {
		const url = normalizeParams(at('/x', '?taskId=abc&range=7'), spec);
		expect(url.searchParams.has('taskId')).toBe(false);
		expect(url.searchParams.get('range')).toBe('7');
	});

	it('leaves everything else alone', () => {
		const url = normalizeParams(at('/x', '?os=linux&utm_source=bugzilla'), spec);
		expect(url.searchParams.get('os')).toBe('linux');
		expect(url.searchParams.get('utm_source')).toBe('bugzilla');
	});

	it('returns the same URL object when there is nothing to rewrite', () => {
		const url = at('/x', '?os=linux');
		expect(normalizeParams(url, spec)).toBe(url);
	});

	it('does not mutate the URL it was given', () => {
		const url = at('/x', '?repo=autoland');
		normalizeParams(url, spec);
		expect(url.searchParams.get('repo')).toBe('autoland');
	});
});

describe('parameter aliases, per page', () => {
	it('speedometer.html?repo=autoland selects autoland', () => {
		expect(parseSpeedometerState(at('/speedometer.html', '?repo=autoland')).repository).toBe(
			'autoland'
		);
	});

	it('jetstream.html?repo=autoland selects autoland', () => {
		expect(parseJetStreamState(at('/jetstream.html', '?repo=autoland')).repository).toBe(
			'autoland'
		);
	});

	it('navbench.html?subtest=... selects that test', () => {
		expect(parseNavBenchState(at('/navbench.html', '?subtest=bbc-nav-subnav-score')).test).toBe(
			'bbc-nav-subnav-score'
		);
	});

	it('android.html?timeline=30 selects a one-month range', () => {
		expect(parseAndroidState(at('/android.html', '?timeline=30')).range).toBe(30);
	});

	it('android.html?taskId=...&retryId=0 opens no recording rather than the wrong one', () => {
		const state = parseAndroidState(at('/android.html', '?taskId=abc123&retryId=0&device=a55'));
		expect(state.job).toBe('');
		expect(state.replicate).toBe('');
		expect(state.device).toBe('a55');
	});
});

describe('range aliases', () => {
	const cases = [
		['week', 7],
		['1month', 30],
		['3months', 90],
		['year', 365]
	] as const;

	for (const [slug, days] of cases) {
		it(`?range=${slug} is ${days} days on dashboards supporting range labels`, () => {
			const query = `?range=${slug}`;
			expect(parseSpeedometerState(at('/speedometer.html', query)).range).toBe(days);
			expect(parseNavBenchState(at('/navbench.html', query)).range).toBe(days);
			expect(parseAndroidState(at('/android.html', query)).range).toBe(days);
		});
	}

	it('reads day counts', () => {
		expect(parseNavBenchState(at('/navbench.html', '?range=7')).range).toBe(7);
	});

	it('falls back to the default for a range that is not offered', () => {
		expect(parseAndroidState(at('/android.html', '?range=5000')).range).toBe(90);
	});
});

describe("JetStream's range, which is spelled its own way", () => {
	const at = (query: string) => new URL(`https://performance.mozilla.org/jetstream.html${query}`);

	it('defaults to a year, not the 90 days every other page uses', () => {
		expect(parseJetStreamState(at('')).range).toBe(365);
	});

	it('reads ?range=all as a year', () => {
		expect(parseJetStreamState(at('?range=all')).range).toBe(365);
	});

	it('reads ?range=1 as one month, not one day', () => {
		expect(parseJetStreamState(at('?range=1')).range).toBe(30);
	});

	it('reads ?range=3 as three months', () => {
		expect(parseJetStreamState(at('?range=3')).range).toBe(90);
	});

	it('reads day counts', () => {
		expect(parseJetStreamState(at('?range=7')).range).toBe(7);
		expect(parseJetStreamState(at('?range=30')).range).toBe(30);
	});

	it('omits the parameter at its own default rather than the shared one', () => {
		const url = at('?range=30');
		expect(jetStreamHref(url, { range: 365 })).not.toContain('range=');
		expect(jetStreamHref(url, { range: 90 })).toContain('range=90');
	});
});
