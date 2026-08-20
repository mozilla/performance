import { describe, expect, it } from 'vitest';
import { parseSpeedometerState, speedometerHref, toggleHidden } from './state';

const at = (search: string) => new URL(`https://example.org/speedometer/${search}`);

describe('parseSpeedometerState', () => {
	it('defaults to the Mac platform, overall score and 3 months', () => {
		const state = parseSpeedometerState(at(''));
		expect(state).toMatchObject({
			os: 'osxm4',
			subtest: 'score',
			range: 90,
			repository: 'mozilla-central',
			replicates: false,
			alerts: false
		});
	});

	it('rejects an unknown platform', () => {
		expect(parseSpeedometerState(at('?os=amiga')).os).toBe('osxm4');
	});

	it('reads a range in days', () => {
		expect(parseSpeedometerState(at('?range=7')).range).toBe(7);
	});

	it('rejects a range that is not one of the offered values', () => {
		expect(parseSpeedometerState(at('?range=45')).range).toBe(90);
	});

	it.each([
		['week', 7],
		['1month', 30],
		['3months', 90],
		['year', 365]
	])('accepts the range alias %s', (slug, days) => {
		expect(parseSpeedometerState(at(`?range=${slug}`)).range).toBe(days);
	});

	it('accepts the repo alias', () => {
		expect(parseSpeedometerState(at('?repo=autoland')).repository).toBe('autoland');
	});

	it('prefers repository over the alias when both are present', () => {
		expect(parseSpeedometerState(at('?repo=autoland&repository=mozilla-central')).repository).toBe(
			'mozilla-central'
		);
	});
});

describe('speedometerHref', () => {
	it('keeps all other state when changing platform', () => {
		const url = at(
			'?subtest=Editor-TipTap/total&range=365&repository=autoland&replicates=1&alerts=1'
		);
		const next = new URL(speedometerHref(url, { os: 'linux' }), url);

		expect(next.searchParams.get('os')).toBe('linux');
		expect(next.searchParams.get('subtest')).toBe('Editor-TipTap/total');
		expect(next.searchParams.get('range')).toBe('365');
		expect(next.searchParams.get('repository')).toBe('autoland');
		expect(next.searchParams.get('replicates')).toBe('1');
		expect(next.searchParams.get('alerts')).toBe('1');
	});

	it('keeps the range when toggling the repository', () => {
		const url = at('?range=365');
		const next = new URL(speedometerHref(url, { repository: 'autoland' }), url);

		expect(next.searchParams.get('range')).toBe('365');
	});

	it('normalises a range alias when any other parameter is patched', () => {
		const url = at('?range=year');
		const next = new URL(speedometerHref(url, { os: 'linux' }), url);

		expect(next.searchParams.get('range')).toBe('365');
	});

	it('moves state across to the Job Debug route unchanged', () => {
		const url = new URL('https://example.org/speedometer/?os=linux&range=7&replicates=1');
		const state = parseSpeedometerState(url);
		const target = new URL('https://example.org/speedometer_job_debug');
		const href = speedometerHref(target, state);
		const moved = parseSpeedometerState(new URL(href, target));

		expect(moved).toMatchObject({ os: 'linux', range: 7, replicates: true });
	});
});

describe('toggleHidden', () => {
	it('adds a label that was visible', () => {
		expect([...toggleHidden(new Set(), 'Chrome')]).toEqual(['Chrome']);
	});

	it('removes a label that was hidden', () => {
		expect([...toggleHidden(new Set(['Chrome']), 'Chrome')]).toEqual([]);
	});

	it('leaves other labels alone', () => {
		expect([...toggleHidden(new Set(['Chrome']), 'Safari')].sort()).toEqual(['Chrome', 'Safari']);
	});

	it('does not mutate the input', () => {
		const hidden = new Set(['Chrome']);
		toggleHidden(hidden, 'Safari');
		expect([...hidden]).toEqual(['Chrome']);
	});
});
