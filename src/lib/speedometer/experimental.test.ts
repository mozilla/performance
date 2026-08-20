import { describe, expect, it } from 'vitest';
import { signature } from '../../tests/factories';
import { axisLabel } from './chart';
import {
	experimentalNaming,
	experimentalSubtests,
	experimentalTestKey,
	experimentalTests,
	OVERALL_TEST,
	SPEEDOMETER_EXPERIMENTAL
} from './experimental';
import { parseSpeedometerState, speedometerHref } from './state';
import { SPEEDOMETER3 } from './suite';

// As Treeherder returns them: the suite summary has no test name, and units
// and directions vary per test.
const signatures = [
	signature({ test: undefined, measurement_unit: 'score', lower_is_better: false }),
	signature({ test: 'powerUsage_gpu', measurement_unit: 'uWh' }),
	signature({ test: 'cpuTime', measurement_unit: 'ms' }),
	signature({ test: 'TodoMVC-Emoji/total', measurement_unit: 'ms' }),
	signature({ test: 'TodoMVC-Emoji/prepare', measurement_unit: 'ms' }),
	signature({ test: 'ChatRoom-React/total', measurement_unit: 'ms' }),
	signature({ test: 'score', measurement_unit: 'score', lower_is_better: false })
];

describe('experimentalTests', () => {
	it('names the suite summary, which Treeherder leaves unnamed', () => {
		expect(experimentalTestKey(undefined)).toBe(OVERALL_TEST);
		expect(experimentalTestKey('')).toBe(OVERALL_TEST);
		expect(experimentalTestKey('cpuTime')).toBe('cpuTime');
	});

	it('lists the overall first, then workloads, then metrics', () => {
		expect(experimentalTests(signatures)).toEqual([
			OVERALL_TEST,
			'ChatRoom-React/total',
			'TodoMVC-Emoji/prepare',
			'TodoMVC-Emoji/total',
			'cpuTime',
			'powerUsage_gpu',
			'score'
		]);
	});

	it('charts only the workload totals as subtests', () => {
		expect(experimentalSubtests(signatures)).toEqual([
			'ChatRoom-React/total',
			'TodoMVC-Emoji/total'
		]);
	});
});

describe('experimentalNaming', () => {
	const naming = experimentalNaming(signatures);

	it('takes the unit from the signature', () => {
		expect(naming.unit('cpuTime')).toBe(' ms');
		expect(naming.unit('powerUsage_gpu')).toBe(' uWh');
		expect(naming.unit(OVERALL_TEST)).toBe('');
	});

	// Upstream decided by name that only the overall is a score, which charted
	// `score` and `score-internal` upside down.
	it('takes the direction from the signature', () => {
		expect(naming.lowerIsBetter(OVERALL_TEST)).toBe(false);
		expect(naming.lowerIsBetter('score')).toBe(false);
		expect(naming.lowerIsBetter('cpuTime')).toBe(true);
	});

	it('reads lower-is-better into the null Treeherder sends for most tests', () => {
		const fromJson = experimentalNaming([
			{ ...signature({ test: 'cpuTime' }), lower_is_better: null as unknown as undefined }
		]);
		expect(fromJson.lowerIsBetter('cpuTime')).toBe(true);
	});

	it('labels workloads without their /total suffix', () => {
		expect(naming.label('TodoMVC-Emoji/total')).toBe('TodoMVC-Emoji');
		expect(naming.label('TodoMVC-Emoji/prepare')).toBe('TodoMVC-Emoji/prepare');
		expect(naming.label(OVERALL_TEST)).toBe('Overall Score');
	});

	it('gives each kind of figure an axis label', () => {
		expect(axisLabel(naming, OVERALL_TEST)).toBe('Score (Higher is better)');
		expect(axisLabel(naming, 'cpuTime')).toBe('Time (ms)');
		expect(axisLabel(naming, 'powerUsage_gpu')).toBe('Value (uWh)');
	});
});

describe('the Speedometer Experimental URL', () => {
	const at = (search: string) => new URL(`https://example.org/speedometer-experimental${search}`);
	const schema = SPEEDOMETER_EXPERIMENTAL.schema;

	it('defaults to upstream’s Windows, autoland and the overall score', () => {
		expect(parseSpeedometerState(at(''), schema)).toMatchObject({
			os: 'windows',
			repository: 'autoland',
			subtest: OVERALL_TEST
		});
	});

	it('offers only the platforms the suite runs on', () => {
		expect(parseSpeedometerState(at('?os=android-s24'), schema).os).toBe('windows');
		expect(parseSpeedometerState(at('?os=linux'), schema).os).toBe('linux');
	});

	// mozilla-central is a choice here rather than the default, so it has to
	// be written out; upstream's links say `repository=mozilla-central`.
	it('writes mozilla-central to the URL and leaves autoland out', () => {
		expect(speedometerHref(at(''), { repository: 'mozilla-central' }, schema)).toContain(
			'repository=mozilla-central'
		);
		expect(
			speedometerHref(at('?repository=mozilla-central'), { repository: 'autoland' }, schema)
		).not.toContain('repository');
	});

	it('leaves Speedometer 3’s defaults alone', () => {
		const url = new URL('https://example.org/speedometer');
		expect(parseSpeedometerState(url, SPEEDOMETER3.schema)).toMatchObject({
			os: 'osxm4',
			repository: 'mozilla-central',
			subtest: 'score'
		});
	});
});
