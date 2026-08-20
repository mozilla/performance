import { describe, expect, it } from 'vitest';
import { nextSort, sortRows, type SortState } from './sort';

describe('nextSort', () => {
	const active: SortState = { column: 'id', direction: 'asc' };

	it('flips direction when the active column is clicked again', () => {
		expect(nextSort(active, 'id', 'number')).toEqual({ column: 'id', direction: 'desc' });
		expect(nextSort({ column: 'id', direction: 'desc' }, 'id', 'number')).toEqual({
			column: 'id',
			direction: 'asc'
		});
	});

	it('starts a new text column ascending regardless of the previous direction', () => {
		expect(nextSort({ column: 'id', direction: 'desc' }, 'summary', 'text')).toEqual({
			column: 'summary',
			direction: 'asc'
		});
	});

	it('starts a new numeric or date column descending', () => {
		expect(nextSort(active, 'count', 'number').direction).toBe('desc');
		expect(nextSort(active, 'created', 'date').direction).toBe('desc');
	});
});

describe('sortRows', () => {
	const rows = [{ v: 9 }, { v: 10 }, { v: 1 }];

	it('sorts numbers numerically, not lexicographically', () => {
		expect(sortRows(rows, (r) => r.v, 'number', 'asc').map((r) => r.v)).toEqual([1, 9, 10]);
	});

	it('reverses for descending', () => {
		expect(sortRows(rows, (r) => r.v, 'number', 'desc').map((r) => r.v)).toEqual([10, 9, 1]);
	});

	it('sorts text case-insensitively and numeric-aware', () => {
		const words = [{ v: 'item10' }, { v: 'Item2' }, { v: 'item1' }];
		expect(sortRows(words, (r) => r.v, 'text', 'asc').map((r) => r.v)).toEqual([
			'item1',
			'Item2',
			'item10'
		]);
	});

	it('sorts dates chronologically', () => {
		const dates = [{ v: '2026-08-01' }, { v: '2025-01-01' }, { v: '2026-01-01' }];
		expect(sortRows(dates, (r) => r.v, 'date', 'asc').map((r) => r.v)).toEqual([
			'2025-01-01',
			'2026-01-01',
			'2026-08-01'
		]);
	});

	it('does not mutate the input', () => {
		const input = [{ v: 3 }, { v: 1 }];
		sortRows(input, (r) => r.v, 'number', 'asc');
		expect(input.map((r) => r.v)).toEqual([3, 1]);
	});

	it('keeps unorderable values at the end in both directions', () => {
		const mixed = [{ v: 5 }, { v: null }, { v: 1 }];

		expect(sortRows(mixed, (r) => r.v, 'number', 'asc').map((r) => r.v)).toEqual([1, 5, null]);
		expect(sortRows(mixed, (r) => r.v, 'number', 'desc').map((r) => r.v)).toEqual([5, 1, null]);
	});

	it('handles an empty list', () => {
		expect(sortRows([], (r) => r, 'text', 'asc')).toEqual([]);
	});
});
