import { describe, expect, it } from 'vitest';
import { filterTests, parseFilter } from './filter';

const TESTS = [
	'score',
	'async-fs-Average',
	'wasm-hashset-Average',
	'wasm-tsf-Average',
	'hash-map-Average',
	'regex-dna-Average'
];

describe('parseFilter', () => {
	it('splits on commas and trims', () => {
		expect(parseFilter(' wasm , regex ')).toEqual({ include: ['wasm', 'regex'], exclude: [] });
	});

	it('treats a leading dash as an exclusion', () => {
		expect(parseFilter('wasm, -regex')).toEqual({ include: ['wasm'], exclude: ['regex'] });
	});

	it('lower-cases both kinds', () => {
		expect(parseFilter('WASM, -ReGeX')).toEqual({ include: ['wasm'], exclude: ['regex'] });
	});

	it('ignores empty terms and a bare dash', () => {
		// A bare '-' is what the box contains the instant somebody starts typing
		// an exclusion. Treated as a term it would exclude everything.
		expect(parseFilter('wasm, , -')).toEqual({ include: ['wasm'], exclude: [] });
	});
});

describe('filterTests', () => {
	it('returns everything, score included, when the filter is empty', () => {
		expect(filterTests(TESTS, '')).toBe(TESTS);
		expect(filterTests(TESTS, '   ')).toBe(TESTS);
	});

	it('keeps only matching tests', () => {
		expect(filterTests(TESTS, 'wasm')).toEqual(['wasm-hashset-Average', 'wasm-tsf-Average']);
	});

	it('matches case-insensitively', () => {
		expect(filterTests(TESTS, 'WASM')).toEqual(['wasm-hashset-Average', 'wasm-tsf-Average']);
	});

	it('excludes with a leading dash', () => {
		expect(filterTests(TESTS, '-wasm')).toEqual([
			'async-fs-Average',
			'hash-map-Average',
			'regex-dna-Average'
		]);
	});

	it('requires every include term, not any of them', () => {
		expect(filterTests(TESTS, 'wasm, tsf')).toEqual(['wasm-tsf-Average']);
	});

	it('applies exclusions on top of inclusions', () => {
		expect(filterTests(TESTS, 'average, -wasm, -regex')).toEqual([
			'async-fs-Average',
			'hash-map-Average'
		]);
	});

	it('drops the overall score once a filter is active', () => {
		// 'score' contains no filter term, but it also survives a pure exclusion,
		// which would leave the aggregate sitting above a table narrowed to
		// something specific.
		expect(filterTests(TESTS, '-nothing-matches-this')).not.toContain('score');
	});

	it('can match nothing', () => {
		expect(filterTests(TESTS, 'nosuchtest')).toEqual([]);
	});

	it('preserves the original order', () => {
		expect(filterTests(TESTS, 'average')).toEqual([
			'async-fs-Average',
			'wasm-hashset-Average',
			'wasm-tsf-Average',
			'hash-map-Average',
			'regex-dna-Average'
		]);
	});
});
