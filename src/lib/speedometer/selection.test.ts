import { describe, expect, it } from 'vitest';
import { nextSelection, type SelectedPoint, selectionIsLive } from './selection';

const point = (revision: string, time: number, value = 100): SelectedPoint => ({
	revision,
	time,
	value
});

describe('nextSelection', () => {
	it('anchors on the first click without producing a range', () => {
		const result = nextSelection(null, point('aaa', 1000));

		expect(result.selection.revision).toBe('aaa');
		expect(result.range).toBeNull();
	});

	it('produces a range on the second click', () => {
		const result = nextSelection(point('aaa', 1000), point('bbb', 2000));

		expect(result.range).toEqual({ from: 'aaa', to: 'bbb' });
	});

	it('orders the range oldest first regardless of click order', () => {
		const forward = nextSelection(point('aaa', 1000), point('bbb', 2000));
		const backward = nextSelection(point('bbb', 2000), point('aaa', 1000));

		expect(forward.range).toEqual({ from: 'aaa', to: 'bbb' });
		expect(backward.range).toEqual({ from: 'aaa', to: 'bbb' });
	});

	it('re-anchors on the point just clicked so a third click continues', () => {
		const first = nextSelection(null, point('aaa', 1000));
		const second = nextSelection(first.selection, point('bbb', 2000));
		const third = nextSelection(second.selection, point('ccc', 3000));

		expect(third.range).toEqual({ from: 'bbb', to: 'ccc' });
	});

	it('produces no range when the same push is clicked twice', () => {
		const result = nextSelection(point('aaa', 1000), point('aaa', 1000));

		expect(result.range).toBeNull();
		expect(result.selection.revision).toBe('aaa');
	});

	it('produces no range for a point with no revision', () => {
		const result = nextSelection(point('aaa', 1000), point('', 2000));

		expect(result.range).toBeNull();
	});

	it('produces no range when the anchor has no revision', () => {
		const result = nextSelection(point('', 1000), point('bbb', 2000));

		expect(result.range).toBeNull();
		expect(result.selection.revision).toBe('bbb');
	});
});

describe('selectionIsLive', () => {
	it('is false with no selection', () => {
		expect(selectionIsLive(null, ['aaa'])).toBe(false);
	});

	it('is true when the anchor revision is present', () => {
		expect(selectionIsLive(point('aaa', 1000), ['bbb', 'aaa'])).toBe(true);
	});

	it('is false when the anchor is absent from the current data', () => {
		expect(selectionIsLive(point('aaa', 1000), ['bbb', 'ccc'])).toBe(false);
	});

	it('is false for empty data', () => {
		expect(selectionIsLive(point('aaa', 1000), [])).toBe(false);
	});
});
