import { describe, expect, it } from 'vitest';
import { measurement } from '../../tests/factories';
import { groupByMachine, MACHINE_COLORS, paddedBounds, styleForIndex } from './machines';

describe('styleForIndex', () => {
	it('cycles colour first, then shape', () => {
		const first = styleForIndex(0);
		const second = styleForIndex(1);
		const wrapped = styleForIndex(MACHINE_COLORS.length);

		expect(second.color).not.toBe(first.color);
		expect(second.shape).toBe(first.shape);

		// After exhausting the colours, reuse them with the next shape.
		expect(wrapped.color).toBe(first.color);
		expect(wrapped.shape).not.toBe(first.shape);
	});

	it('gives a distinct colour+shape pair to each of the first 90 machines', () => {
		const seen = new Set<string>();
		for (let i = 0; i < MACHINE_COLORS.length * 6; i++) {
			const style = styleForIndex(i);
			seen.add(`${style.color}|${style.shape}|${style.rotation}`);
		}
		expect(seen.size).toBe(MACHINE_COLORS.length * 6);
	});

	it('pairs each shape with a legend glyph', () => {
		expect(styleForIndex(0).symbol).toBeTruthy();
	});
});

describe('groupByMachine', () => {
	it('groups measurements by machine name', () => {
		const groups = groupByMachine([
			measurement({ machineName: 'a' }),
			measurement({ machineName: 'b' }),
			measurement({ machineName: 'a' })
		]);

		expect(groups.map((g) => g.name)).toEqual(['a', 'b']);
		expect(groups[0].measurements).toHaveLength(2);
	});

	it('sorts numerically so worker-2 precedes worker-10', () => {
		const groups = groupByMachine([
			measurement({ machineName: 'worker-10' }),
			measurement({ machineName: 'worker-2' })
		]);

		expect(groups.map((g) => g.name)).toEqual(['worker-2', 'worker-10']);
	});

	it('labels measurements with no machine name as unknown', () => {
		expect(groupByMachine([measurement({ machineName: undefined })])[0].name).toBe('unknown');
	});

	it('assigns a machine the same style regardless of input order', () => {
		const a = groupByMachine([
			measurement({ machineName: 'b' }),
			measurement({ machineName: 'a' })
		]);
		const b = groupByMachine([
			measurement({ machineName: 'a' }),
			measurement({ machineName: 'b' })
		]);

		expect(a.map((g) => g.style.color)).toEqual(b.map((g) => g.style.color));
	});

	it('returns nothing for no measurements', () => {
		expect(groupByMachine([])).toEqual([]);
	});
});

describe('paddedBounds', () => {
	const at = (iso: string) => new Date(iso);

	it('returns null for no measurements', () => {
		expect(paddedBounds([])).toBeNull();
	});

	it('covers the full extent with padding outside it', () => {
		const bounds = paddedBounds([
			measurement({ date: at('2026-08-01T00:00:00Z'), value: 100 }),
			measurement({ date: at('2026-08-11T00:00:00Z'), value: 200 })
		])!;

		expect(bounds.xMin).toBeLessThan(Date.parse('2026-08-01T00:00:00Z'));
		expect(bounds.xMax).toBeGreaterThan(Date.parse('2026-08-11T00:00:00Z'));
		expect(bounds.yMin).toBeLessThan(100);
		expect(bounds.yMax).toBeGreaterThan(200);
	});

	// Without a fallback the axis collapses to zero width and Chart.js draws
	// nothing useful.
	it('pads a single point into a non-empty range', () => {
		const bounds = paddedBounds([measurement({ date: at('2026-08-01T00:00:00Z'), value: 100 })])!;

		expect(bounds.xMax).toBeGreaterThan(bounds.xMin);
		expect(bounds.yMax).toBeGreaterThan(bounds.yMin);
	});

	it('pads a flat series where every value is identical', () => {
		const bounds = paddedBounds([
			measurement({ date: at('2026-08-01T00:00:00Z'), value: 100 }),
			measurement({ date: at('2026-08-02T00:00:00Z'), value: 100 })
		])!;

		expect(bounds.yMax).toBeGreaterThan(bounds.yMin);
	});

	it('pads a series where every value is zero', () => {
		const bounds = paddedBounds([
			measurement({ date: at('2026-08-01T00:00:00Z'), value: 0 }),
			measurement({ date: at('2026-08-02T00:00:00Z'), value: 0 })
		])!;

		expect(bounds.yMax).toBeGreaterThan(bounds.yMin);
	});
});
