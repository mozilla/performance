import { describe, expect, it } from 'vitest';
import { bool, num, parseState, patchUrl, str, stringSet, type Schema } from './url-state';

const schema = {
	os: str('osxm4', ['osxm4', 'windows', 'linux', 'android-s24']),
	subtest: str('score'),
	range: num(90, [7, 30, 90, 365]),
	repository: str('mozilla-central', ['mozilla-central', 'autoland']),
	replicates: bool(false),
	hide: stringSet()
} satisfies Schema;

const at = (search: string) => new URL(`https://example.org/speedometer/${search}`);

describe('parseState', () => {
	it('returns defaults for an empty query string', () => {
		expect(parseState(schema, at(''))).toEqual({
			os: 'osxm4',
			subtest: 'score',
			range: 90,
			repository: 'mozilla-central',
			replicates: false,
			hide: new Set()
		});
	});

	it('reads values that are present', () => {
		const state = parseState(
			schema,
			at('?os=linux&range=7&replicates=1&subtest=TodoMVC-Vue/total')
		);
		expect(state.os).toBe('linux');
		expect(state.range).toBe(7);
		expect(state.replicates).toBe(true);
		expect(state.subtest).toBe('TodoMVC-Vue/total');
	});

	it('falls back to the default for values outside the allowed set', () => {
		expect(parseState(schema, at('?os=solaris')).os).toBe('osxm4');
		expect(parseState(schema, at('?range=1234')).range).toBe(90);
		expect(parseState(schema, at('?range=notanumber')).range).toBe(90);
		expect(parseState(schema, at('?repository=try')).repository).toBe('mozilla-central');
	});

	it('parses a comma-separated set, decoding each member', () => {
		const state = parseState(schema, at('?hide=Chrome,Safari%20TP'));
		expect([...state.hide].sort()).toEqual(['Chrome', 'Safari TP']);
	});
});

describe('patchUrl', () => {
	it('preserves every parameter it was not asked to change', () => {
		const url = at(
			'?os=osxm4&subtest=TodoMVC-Vue/total&range=365&repository=autoland&replicates=1'
		);
		const next = new URL(patchUrl(schema, url, { os: 'linux' }), url);

		expect(next.searchParams.get('os')).toBe('linux');
		expect(next.searchParams.get('subtest')).toBe('TodoMVC-Vue/total');
		expect(next.searchParams.get('range')).toBe('365');
		expect(next.searchParams.get('repository')).toBe('autoland');
		expect(next.searchParams.get('replicates')).toBe('1');
	});

	it('round-trips: patching then parsing yields the patched state', () => {
		const url = at('?range=7');
		const patched = new URL(patchUrl(schema, url, { subtest: 'Editor-TipTap/total' }), url);
		const state = parseState(schema, patched);

		expect(state.range).toBe(7);
		expect(state.subtest).toBe('Editor-TipTap/total');
	});

	it('omits values equal to the default so shared links pin only real choices', () => {
		const next = patchUrl(schema, at('?range=7'), { range: 90 });
		expect(next).toBe('/speedometer/');
	});

	it('drops a parameter when it is patched back to its default', () => {
		const url = at('?os=linux&range=7');
		const next = new URL(patchUrl(schema, url, { os: 'osxm4' }), url);

		expect(next.searchParams.has('os')).toBe(false);
		expect(next.searchParams.get('range')).toBe('7');
	});

	it('keeps the path and hash', () => {
		const url = new URL('https://example.org/speedometer_job_debug?range=7#chart');
		expect(patchUrl(schema, url, { range: 30 })).toBe('/speedometer_job_debug?range=30#chart');
	});

	it('keeps query parameters the schema does not know about', () => {
		const url = at('?utm_source=bugzilla&range=7');
		const next = new URL(patchUrl(schema, url, { range: 30 }), url);
		expect(next.searchParams.get('utm_source')).toBe('bugzilla');
	});

	it('produces a stable URL regardless of the order keys were set', () => {
		const a = patchUrl(schema, at(''), { os: 'linux', range: 7 });
		const b = patchUrl(schema, at('?range=7'), { os: 'linux' });
		expect(a).toBe(b);
	});
});

describe('stringSet', () => {
	const setSchema = { hide: stringSet() } satisfies Schema;

	it('round-trips labels containing spaces and commas in the value', () => {
		const url = at('');
		const patched = new URL(
			patchUrl(setSchema, url, { hide: new Set(['Safari TP', 'Chrome']) }),
			url
		);
		expect([...parseState(setSchema, patched).hide].sort()).toEqual(['Chrome', 'Safari TP']);
	});

	it('serialises in a canonical order so equivalent states share a URL', () => {
		const url = at('');
		const a = patchUrl(setSchema, url, { hide: new Set(['Chrome', 'Safari']) });
		const b = patchUrl(setSchema, url, { hide: new Set(['Safari', 'Chrome']) });
		expect(a).toBe(b);
	});

	it('omits an empty set', () => {
		expect(patchUrl(setSchema, at('?hide=Chrome'), { hide: new Set() })).toBe('/speedometer/');
	});
});

describe('bool', () => {
	const boolSchema = { on: bool(false), off: bool(true) } satisfies Schema;

	it('accepts both 1 and true', () => {
		expect(parseState(boolSchema, at('?on=1')).on).toBe(true);
		expect(parseState(boolSchema, at('?on=true')).on).toBe(true);
		expect(parseState(boolSchema, at('?on=0')).on).toBe(false);
	});

	it('serialises against the field default, not against false', () => {
		// A field defaulting to true must record an explicit false.
		expect(patchUrl(boolSchema, at(''), { off: false })).toBe('/speedometer/?off=0');
		expect(patchUrl(boolSchema, at('?off=0'), { off: true })).toBe('/speedometer/');
	});
});
