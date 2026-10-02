import { describe, expect, it } from 'vitest';
import {
	androidHref,
	type AndroidState,
	openJobId,
	openReplicateIndex,
	parseAndroidState,
	withVideoClosed
} from './state';

const at = (query: string) => new URL(`https://example.test/android/${query}`);

describe('parseAndroidState', () => {
	it('falls back to the defaults for an empty URL', () => {
		const state = parseAndroidState(at(''));

		expect(state.device).toBe('a55');
		expect(state.test).toBe('newssite-applink-startup');
		expect(state.range).toBe(90);
		expect(state.repository).toBe('mozilla-central');
		expect(state.job).toBe('');
	});

	it('rejects an unknown device or test rather than charting nothing', () => {
		const state = parseAndroidState(at('?device=nexus5&test=made-up'));

		expect(state.device).toBe('a55');
		expect(state.test).toBe('newssite-applink-startup');
	});
});

describe('androidHref', () => {
	it('keeps every other setting when one changes', () => {
		const url = at('?device=s24&test=sp3&range=365&repository=autoland&replicates=1');

		const href = androidHref(url, { device: 'p6' });

		expect(href).toContain('device=p6');
		expect(href).toContain('test=sp3');
		expect(href).toContain('range=365');
		expect(href).toContain('repository=autoland');
		expect(href).toContain('replicates=1');
	});

	it('omits defaults so a shared link only pins what was chosen', () => {
		expect(androidHref(at('?device=p6'), { device: 'a55' })).toBe('/android/');
	});
});

describe('withVideoClosed', () => {
	it('clears the open video alongside whatever else changed', () => {
		const url = at('?device=a55&job=586889877&replicate=3');

		const href = androidHref(url, withVideoClosed({ range: 30 }));

		expect(href).toContain('range=30');
		expect(href).not.toContain('job=');
		expect(href).not.toContain('replicate=');
	});
});

describe('openJobId', () => {
	const state = (job: string) => ({ job }) as AndroidState;

	it('reads a job id', () => {
		expect(openJobId(state('586889877'))).toBe(586889877);
	});

	it('treats an absent or malformed job as nothing open', () => {
		expect(openJobId(state(''))).toBeNull();
		expect(openJobId(state('../etc'))).toBeNull();
		expect(openJobId(state('-1'))).toBeNull();
		expect(openJobId(state('1.5'))).toBeNull();
	});
});

describe('openReplicateIndex', () => {
	const state = (replicate: string) => ({ replicate }) as AndroidState;

	it('reads the selected replicate', () => {
		expect(openReplicateIndex(state('3'), 10)).toBe(3);
	});

	// A link made when a job had 10 replicates, opened against a job that has 5.
	it('falls back to the first when the index is out of range', () => {
		expect(openReplicateIndex(state('7'), 5)).toBe(0);
		expect(openReplicateIndex(state(''), 5)).toBe(0);
		expect(openReplicateIndex(state('nope'), 5)).toBe(0);
	});
});
