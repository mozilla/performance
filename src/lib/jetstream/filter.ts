/**
 * Case-insensitive, comma-separated subtest filters. Include terms are ANDed;
 * a leading minus excludes a term. Empty exclusions are ignored while typing.
 * A nonempty filter removes the overall score row as it is not a subtest.
 */
import { SCORE_TEST } from './config';

export interface FilterTerms {
	/** Terms the test name must all contain. */
	include: string[];
	/** Terms that, if any is present, drop the test. */
	exclude: string[];
}

export function parseFilter(filterText: string): FilterTerms {
	const terms = filterText
		.split(',')
		.map((term) => term.trim())
		.filter(Boolean);

	return {
		include: terms.filter((term) => !term.startsWith('-')).map((term) => term.toLowerCase()),
		exclude: terms
			.filter((term) => term.startsWith('-'))
			.map((term) => term.slice(1).toLowerCase())
			.filter(Boolean)
	};
}

export function filterTests(tests: readonly string[], filterText: string): readonly string[] {
	const { include, exclude } = parseFilter(filterText);
	if (include.length === 0 && exclude.length === 0) return tests;

	return tests.filter((test) => {
		if (test === SCORE_TEST) return false;

		const name = test.toLowerCase();
		if (exclude.some((term) => name.includes(term))) return false;
		return include.every((term) => name.includes(term));
	});
}

export const FILTER_PRESETS: ReadonlyArray<{ label: string; value: string }> = [
	{ label: 'All Tests', value: '' },
	{ label: 'WebAssembly Only', value: 'wasm' },
	{ label: 'Exclude WebAssembly', value: '-wasm' }
];
