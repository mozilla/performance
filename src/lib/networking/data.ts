import { type CsvRow, fetchCsv, numeric } from '$lib/api/csv';
import type { ChartConfig } from './config';

export interface SeriesData {
	/** X values, epoch milliseconds, ascending. */
	labels: number[];
	/** Series name -> one value per label, null where the day is missing. */
	series: Record<string, Array<number | null>>;
}

export interface PieData {
	labels: string[];
	values: number[];
}

const isLongFormat = (rows: CsvRow[], columns: string[], config: ChartConfig): boolean => {
	if (config.format === 'long') return true;
	if (columns.length < 3) return false;
	// A non-numeric second column means it is a category, not a value.
	return numeric(rows[0]?.[columns[1]]) === null;
};

function parseWide(rows: CsvRow[], columns: string[]): SeriesData {
	const [dateColumn, ...valueColumns] = columns;
	const labels: number[] = [];
	const series: Record<string, Array<number | null>> = {};
	for (const column of valueColumns) series[column] = [];

	for (const row of rows) {
		const time = Date.parse(row[dateColumn]);
		if (Number.isNaN(time)) continue;
		labels.push(time);
		for (const column of valueColumns) series[column].push(numeric(row[column]));
	}

	return { labels, series };
}

function parseLong(rows: CsvRow[], columns: string[], config: ChartConfig): SeriesData {
	const dateColumn = columns[0];
	const categoryColumn = columns[1];

	const valueColumn =
		config.valueColumn && columns.includes(config.valueColumn) ? config.valueColumn : columns[2];

	const byDate = new Map<number, Record<string, number | null>>();
	const categories = new Set<string>();

	for (const row of rows) {
		const time = Date.parse(row[dateColumn]);
		if (Number.isNaN(time)) continue;

		const category = row[categoryColumn];
		categories.add(category);

		let entry = byDate.get(time);
		if (!entry) {
			entry = {};
			byDate.set(time, entry);
		}
		entry[category] = numeric(row[valueColumn]);
	}

	const labels = [...byDate.keys()].sort((a, b) => a - b);
	const series: Record<string, Array<number | null>> = {};

	for (const category of [...categories].sort()) {
		series[category] = labels.map((time) => byDate.get(time)?.[category] ?? null);
	}

	return { labels, series };
}

export function reshape(rows: CsvRow[], config: ChartConfig): SeriesData {
	if (rows.length === 0) return { labels: [], series: {} };
	const columns = Object.keys(rows[0]);

	return isLongFormat(rows, columns, config)
		? parseLong(rows, columns, config)
		: parseWide(rows, columns);
}

export function reshapePie(rows: CsvRow[], config: ChartConfig): PieData {
	if (rows.length === 0) return { labels: [], values: [] };
	const columns = Object.keys(rows[0]);
	const labelColumn = config.labelColumn ?? columns[0];
	const valueColumn = config.valueColumn ?? columns[1];

	const labels: string[] = [];
	const values: number[] = [];

	for (const row of rows) {
		const value = numeric(row[valueColumn]);
		if (value === null) continue;
		labels.push(row[labelColumn]);
		values.push(value);
	}

	return { labels, values };
}

export type ChartData = { kind: 'series'; data: SeriesData } | { kind: 'pie'; data: PieData };

export async function loadChart(config: ChartConfig, signal?: AbortSignal): Promise<ChartData> {
	const rows = await fetchCsv(config.url, signal);
	return config.chartType === 'pie'
		? { kind: 'pie', data: reshapePie(rows, config) }
		: { kind: 'series', data: reshape(rows, config) };
}

/** The most recent non-null value of a series, for the legend. */
export function latestValue(values: ReadonlyArray<number | null>): number | null {
	for (let i = values.length - 1; i >= 0; i--) {
		if (values[i] !== null) return values[i];
	}
	return null;
}
