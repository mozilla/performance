/**
 * Parse RFC 4180-ish CSV: quoted fields, embedded commas, embedded newlines,
 * and doubled quotes as an escaped quote.
 */
export function parseCsvRows(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let quoted = false;
	let index = 0;

	// Strip a UTF-8 BOM, which Redash sometimes emits and which would otherwise
	// become part of the first column name.
	if (text.charCodeAt(0) === 0xfeff) index = 1;

	const endField = () => {
		row.push(field);
		field = '';
	};

	const endRow = () => {
		endField();
		// Skip blank trailing lines rather than emitting a one-empty-field row.
		if (row.length > 1 || row[0] !== '') rows.push(row);
		row = [];
	};

	while (index < text.length) {
		const char = text[index];

		if (quoted) {
			if (char === '"') {
				if (text[index + 1] === '"') {
					field += '"';
					index += 2;
					continue;
				}
				quoted = false;
				index++;
				continue;
			}
			field += char;
			index++;
			continue;
		}

		if (char === '"') {
			quoted = true;
			index++;
			continue;
		}

		if (char === ',') {
			endField();
			index++;
			continue;
		}

		if (char === '\r') {
			// Handle CRLF as one terminator.
			if (text[index + 1] === '\n') index++;
			endRow();
			index++;
			continue;
		}

		if (char === '\n') {
			endRow();
			index++;
			continue;
		}

		field += char;
		index++;
	}

	if (field !== '' || row.length > 0) endRow();

	return rows;
}

export type CsvRow = Record<string, string>;

/** Parse CSV with a header row into objects keyed by column name. */
export function parseCsv(text: string): CsvRow[] {
	const rows = parseCsvRows(text);
	if (rows.length === 0) return [];

	const header = rows[0].map((name) => name.trim());

	return rows.slice(1).map((cells) => {
		const record: CsvRow = {};
		header.forEach((name, i) => {
			record[name] = cells[i] ?? '';
		});
		return record;
	});
}

/** A numeric cell, or null when blank or unparseable. */
export function numeric(value: string | undefined): number | null {
	if (value === undefined) return null;
	const trimmed = value.trim();
	if (trimmed === '') return null;
	const parsed = Number(trimmed);
	return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Fetch and parse a CSV endpoint.
 *
 * Not routed through `fetchJson`, since the response is text. Redash query
 * results change at most daily, so the browser's own HTTP cache is enough.
 */
export async function fetchCsv(url: string, signal?: AbortSignal): Promise<CsvRow[]> {
	const response = await fetch(url, { signal });
	if (!response.ok) {
		throw new Error(`${response.status} ${response.statusText} for ${url}`);
	}
	return parseCsv(await response.text());
}
