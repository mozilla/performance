/** Test helpers for building Treeherder-shaped fixtures. */
import type { Measurement, PerfSignature } from '$lib/api/treeherder';

let nextId = 1;

export function signature(overrides: Partial<PerfSignature> = {}): PerfSignature {
	const id = overrides.id ?? nextId++;
	return {
		id,
		framework_id: 13,
		signature_hash: `hash${id}`,
		machine_platform: 'macosx1500-aarch64-shippable',
		suite: 'speedometer3',
		test: 'score',
		application: 'firefox',
		extra_options: [],
		repository: 'mozilla-central',
		...overrides
	};
}

export function measurement(overrides: Partial<Measurement> = {}): Measurement {
	return {
		date: new Date('2026-08-01T00:00:00Z'),
		value: 100,
		test: 'score',
		suite: 'speedometer3',
		platform: 'macosx1500-aarch64-shippable',
		application: 'firefox',
		signatureId: 1,
		repository: 'mozilla-central',
		revision: 'abc123def456',
		jobId: 1000,
		machineName: 'macmini-m4-001',
		extraOptions: [],
		...overrides
	};
}

/** A run of measurements one day apart, most recent last. */
export function series(
	count: number,
	overrides: Partial<Measurement> = {},
	valueAt: (index: number) => number = () => 100
): Measurement[] {
	const start = new Date('2026-08-01T00:00:00Z').getTime();
	const day = 24 * 60 * 60 * 1000;
	return Array.from({ length: count }, (_, i) =>
		measurement({
			date: new Date(start + i * day),
			value: valueAt(i),
			revision: `rev${String(i).padStart(4, '0')}`,
			jobId: 1000 + i,
			...overrides
		})
	);
}
