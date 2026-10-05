import { describe, expect, it } from 'vitest';
import { buildComparisonTable } from '$lib/speedometer/table';
import { JETSTREAM_NAMING } from './config';
import { toMeasurements } from './data';

const PLATFORM = 'macosx1500-aarch64-shippable';

describe('JETSTREAM_NAMING', () => {
	it('treats subtests as scores in the comparison table', () => {
		const measurements = toMeasurements(
			[
				{ application: 'firefox', value: 9.58 },
				{ application: 'safari', value: 10.58 }
			].map(({ application, value }) => ({
				date: '2026-08-01T00:00:00Z',
				test: 'typescript-lib-Geometric',
				suite: 'jetstream3',
				platform: PLATFORM,
				application,
				value
			})),
			[PLATFORM]
		);

		const table = buildComparisonTable(measurements, ['typescript-lib-Geometric'], {
			supportsSafari: true,
			naming: JETSTREAM_NAMING
		});
		const [row] = table.rows;

		// Firefox's score is 9.5% below Safari's, so the cell must not be green.
		expect(row.values.firefox.formatted).toBe('9.58');
		expect(row.diffs.safari.formatted).toBe('-9.5%');
		expect(row.diffs.safari.color).not.toBe('green');
	});
});
