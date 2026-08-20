import { describe, expect, it } from 'vitest';
import type { JetStreamRow } from './data';
import { testsIn, toMeasurements } from './data';

const row = (overrides: Partial<JetStreamRow> = {}): JetStreamRow => ({
	date: '2026-08-01T00:00:00Z',
	test: 'score',
	suite: 'jetstream3',
	platform: 'macosx1500-aarch64-shippable',
	application: 'firefox',
	value: 200,
	...overrides
});

describe('toMeasurements', () => {
	it('keeps only rows for the requested platforms', () => {
		const measurements = toMeasurements(
			[
				row({ platform: 'macosx1500-aarch64-shippable' }),
				row({ platform: 'linux2404-64-shippable' })
			],
			['macosx1500-aarch64-shippable']
		);

		expect(measurements).toHaveLength(1);
	});

	it('accepts several platforms', () => {
		const measurements = toMeasurements(
			[
				row({ platform: 'windows11-64-24h2-shippable' }),
				row({ platform: 'windows11-64-shippable-qr' })
			],
			['windows11-64-24h2-shippable', 'windows11-64-shippable-qr']
		);

		expect(measurements).toHaveLength(2);
	});

	it('takes Safari from its own platform when it has one', () => {
		const measurements = toMeasurements(
			[
				row({ application: 'firefox' }),
				row({ application: 'safari', value: 1 }),
				row({ application: 'safari-tp', value: 2 }),
				row({ application: 'safari', platform: 'macosx2700-aarch64-shippable', value: 3 }),
				row({ application: 'firefox', platform: 'macosx2700-aarch64-shippable' })
			],
			['macosx1500-aarch64-shippable'],
			'macosx2700-aarch64-shippable'
		);

		expect(measurements.map((m) => [m.application, m.platform])).toEqual([
			['firefox', 'macosx1500-aarch64-shippable'],
			['safari', 'macosx2700-aarch64-shippable']
		]);
	});

	it('parses dates', () => {
		const [measurement] = toMeasurements(
			[row({ date: '2026-08-01T00:00:00Z' })],
			['macosx1500-aarch64-shippable']
		);

		expect(measurement.date.toISOString()).toBe('2026-08-01T00:00:00.000Z');
	});

	it('drops rows with an unparseable date', () => {
		expect(toMeasurements([row({ date: 'whenever' })], ['macosx1500-aarch64-shippable'])).toEqual(
			[]
		);
	});

	// The snapshot carries no revision or job id, so those fields are empty --
	// the chart that needs them reads Treeherder instead.
	it('marks snapshot rows as having no signature or job', () => {
		const [measurement] = toMeasurements([row()], ['macosx1500-aarch64-shippable']);
		expect(measurement).toMatchObject({ signatureId: -1, jobId: -1, revision: '' });
	});

	it('carries the application through so the rows can be classified', () => {
		const [measurement] = toMeasurements(
			[row({ application: 'safari' })],
			['macosx1500-aarch64-shippable']
		);
		expect(measurement.application).toBe('safari');
	});
});

describe('testsIn', () => {
	const measure = (test: string) =>
		toMeasurements([row({ test })], ['macosx1500-aarch64-shippable'])[0];

	it('lists the score first, then the rest alphabetically', () => {
		expect(testsIn([measure('WSL'), measure('score'), measure('Air')])).toEqual([
			'score',
			'Air',
			'WSL'
		]);
	});

	it('de-duplicates', () => {
		expect(testsIn([measure('Air'), measure('Air')])).toEqual(['Air']);
	});

	it('copes with no score row', () => {
		expect(testsIn([measure('Air')])).toEqual(['Air']);
	});

	it('returns nothing for no measurements', () => {
		expect(testsIn([])).toEqual([]);
	});
});
