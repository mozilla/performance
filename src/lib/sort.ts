export type SortDirection = 'asc' | 'desc';

export type ColumnType = 'text' | 'number' | 'date';

export interface SortState {
	column: string;
	direction: SortDirection;
}

/**
 * The state after clicking `column`.
 *
 * Clicking the active column flips it. Clicking a different column starts from
 * that column's natural direction -- ascending for text, descending for numbers
 * and dates, because "biggest first" is what you want from a count or a date
 * and "A first" is what you want from a name.
 */
export function nextSort(current: SortState, column: string, type: ColumnType): SortState {
	if (current.column === column) {
		return { column, direction: current.direction === 'asc' ? 'desc' : 'asc' };
	}
	return { column, direction: type === 'text' ? 'asc' : 'desc' };
}

/**
 * Convert a cell value to something orderable, or null if it cannot be ordered
 * as the declared type (a missing number, an unparseable date).
 */
function sortKey(value: unknown, type: ColumnType): number | string | null {
	// Guard before any coercion: Number(null) and Number('') are both 0, which
	// would order a missing value as if it were zero.
	if (value === null || value === undefined || value === '') return null;

	if (type === 'number') {
		const number = typeof value === 'number' ? value : Number(value);
		return Number.isFinite(number) ? number : null;
	}

	if (type === 'date') {
		const time = Date.parse(String(value));
		return Number.isNaN(time) ? null : time;
	}

	return String(value);
}

/**
 * Sort a copy of `rows` by the value `select` extracts.
 *
 * Rows whose value cannot be ordered as the column's type are kept together at
 * the end in both directions, rather than being flipped into the middle of the
 * table when the direction changes.
 */
export function sortRows<T>(
	rows: readonly T[],
	select: (row: T) => unknown,
	type: ColumnType,
	direction: SortDirection
): T[] {
	const sign = direction === 'asc' ? 1 : -1;

	const orderable: Array<{ row: T; key: number | string }> = [];
	const unorderable: T[] = [];

	for (const row of rows) {
		const key = sortKey(select(row), type);
		if (key === null) unorderable.push(row);
		else orderable.push({ row, key });
	}

	orderable.sort((a, b) => {
		if (typeof a.key === 'number' && typeof b.key === 'number') {
			return sign * (a.key - b.key);
		}
		return sign * String(a.key).localeCompare(String(b.key), undefined, { numeric: true });
	});

	return [...orderable.map((entry) => entry.row), ...unorderable];
}
