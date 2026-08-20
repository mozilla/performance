import { describe, expect, it } from 'vitest';
import { numeric, parseCsv, parseCsvRows } from './csv';

describe('parseCsvRows', () => {
	it('splits simple rows', () => {
		expect(parseCsvRows('a,b\n1,2')).toEqual([
			['a', 'b'],
			['1', '2']
		]);
	});

	it('keeps commas inside quoted fields', () => {
		expect(parseCsvRows('a,b\n"DOM: Copy, Paste",2')).toEqual([
			['a', 'b'],
			['DOM: Copy, Paste', '2']
		]);
	});

	it('unescapes doubled quotes', () => {
		expect(parseCsvRows('a\n"say ""hi"""')).toEqual([['a'], ['say "hi"']]);
	});

	it('keeps newlines inside quoted fields', () => {
		expect(parseCsvRows('a,b\n"line1\nline2",2')).toEqual([
			['a', 'b'],
			['line1\nline2', '2']
		]);
	});

	it('handles CRLF line endings', () => {
		expect(parseCsvRows('a,b\r\n1,2\r\n')).toEqual([
			['a', 'b'],
			['1', '2']
		]);
	});

	it('strips a UTF-8 BOM from the first column name', () => {
		expect(parseCsvRows('﻿date,value\n1,2')[0]).toEqual(['date', 'value']);
	});

	it('preserves empty fields', () => {
		expect(parseCsvRows('a,b,c\n1,,3')).toEqual([
			['a', 'b', 'c'],
			['1', '', '3']
		]);
	});

	it('ignores a trailing blank line', () => {
		expect(parseCsvRows('a\n1\n')).toEqual([['a'], ['1']]);
	});

	it('returns nothing for empty input', () => {
		expect(parseCsvRows('')).toEqual([]);
	});
});

describe('parseCsv', () => {
	it('keys cells by column name', () => {
		expect(parseCsv('date,value\n2026-08-01,42')).toEqual([{ date: '2026-08-01', value: '42' }]);
	});

	it('trims header names', () => {
		expect(parseCsv('date , value\n1,2')[0]).toEqual({ date: '1', value: '2' });
	});

	it('fills missing trailing cells with empty strings', () => {
		expect(parseCsv('a,b,c\n1,2')[0]).toEqual({ a: '1', b: '2', c: '' });
	});

	it('returns nothing for a header-only file', () => {
		expect(parseCsv('a,b')).toEqual([]);
	});
});

describe('numeric', () => {
	it('parses a number', () => {
		expect(numeric('42.5')).toBe(42.5);
	});

	it('returns null for blank, missing or non-numeric values', () => {
		expect(numeric('')).toBeNull();
		expect(numeric('   ')).toBeNull();
		expect(numeric(undefined)).toBeNull();
		expect(numeric('n/a')).toBeNull();
	});

	// A blank cell must not become 0, or a gap in the data reads as a crash to
	// zero on the chart.
	it('does not turn a blank cell into zero', () => {
		expect(numeric('')).not.toBe(0);
	});
});
