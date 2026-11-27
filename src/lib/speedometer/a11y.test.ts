import { describe, expect, it } from 'vitest';
import { classify } from '#lib/browsers.js';
import { measurement } from '../../tests/factories';
import {
	A11Y_SUITE,
	a11ySchema,
	buildImpactTable,
	formatSlowdown,
	gapColor,
	impactTooltip,
	pairImpacts,
	slowdown
} from './a11y';
import { parseSpeedometerState, speedometerSchema } from './state';

const HOUR = 60 * 60 * 1000;
const at = (hours: number) => new Date(Date.UTC(2026, 10, 25) + hours * HOUR);

const baseline = (value: number, extra: Parameters<typeof measurement>[0] = {}) =>
	measurement({ suite: 'speedometer3', value, signatureId: 1, ...extra });
const accessible = (value: number, extra: Parameters<typeof measurement>[0] = {}) =>
	measurement({ suite: A11Y_SUITE, value, signatureId: 2, ...extra });

describe('slowdown', () => {
	it('reads a lower score as slower', () => {
		expect(slowdown('score', 30, 20)).toBeCloseTo(0.5);
	});

	it('reads a longer time as slower', () => {
		expect(slowdown('TodoMVC-Vue/total', 20, 30)).toBeCloseTo(0.5);
	});
});

describe('pairImpacts', () => {
	it('pairs runs on the same push', () => {
		const [point] = pairImpacts([
			baseline(27.71, { revision: 'r1', date: at(0) }),
			accessible(21.27, { revision: 'r1', date: at(0) })
		]);
		expect(point.value).toBeCloseTo(27.71 / 21.27 - 1);
		expect(point).toMatchObject({
			baseline: 27.71,
			accessible: 21.27,
			baselineRevision: 'r1',
			approximate: false,
			signatureId: 2
		});
	});

	// browsers.ts files Firefox's accessibility runs as Nightly (a11y), and has
	// nothing for Nightly-as-Release's; both are compared as the plain browser.
	it('pairs and labels Firefox’s runs as the browser they compare', () => {
		const nar = { platform: 'windows11-64-24h2-nightlyasrelease' };
		const points = pairImpacts([
			baseline(30),
			accessible(20),
			baseline(30, nar),
			accessible(20, nar)
		]);
		expect(points.map((point) => classify(point)?.key).sort()).toEqual(['firefox', 'firefox-nar']);
	});

	it('prefers the same push to a nearer one', () => {
		const [point] = pairImpacts([
			baseline(30, { revision: 'r1', date: at(0) }),
			baseline(10, { revision: 'r2', date: at(5) }),
			accessible(20, { revision: 'r1', date: at(5) })
		]);
		expect(point.baselineRevision).toBe('r1');
	});

	it('falls back to the nearest push within the window, and says so', () => {
		const [point] = pairImpacts([
			baseline(30, { revision: 'far', date: at(-20) }),
			baseline(32, { revision: 'near', date: at(3) }),
			accessible(20, { revision: 'r1', date: at(0) })
		]);
		expect(point).toMatchObject({ baselineRevision: 'near', approximate: true });
	});

	it('drops a run with no baseline within the window', () => {
		expect(
			pairImpacts([
				baseline(30, { revision: 'r0', date: at(-30) }),
				accessible(20, { revision: 'r1', date: at(0) })
			])
		).toEqual([]);
	});

	it('averages retriggers on a push', () => {
		const [point] = pairImpacts([
			baseline(28, { revision: 'r1', jobId: 1 }),
			baseline(32, { revision: 'r1', jobId: 2 }),
			accessible(20, { revision: 'r1', jobId: 3 })
		]);
		expect(point.baseline).toBe(30);
	});

	it('never pairs across browsers or tests', () => {
		expect(
			pairImpacts([
				baseline(30, { application: 'chrome' }),
				baseline(30, { test: 'TodoMVC-Vue/total' }),
				accessible(20)
			])
		).toEqual([]);
	});
});

describe('buildImpactTable', () => {
	const pair = (application: string, test: string, before: number, after: number) => [
		baseline(before, { application, test }),
		accessible(after, { application, test })
	];

	const table = buildImpactTable(
		pairImpacts([
			...pair('firefox', 'score', 30, 20),
			...pair('chrome', 'score', 30, 24),
			...pair('firefox', 'TodoMVC-Vue/total', 10, 12),
			...pair('chrome', 'TodoMVC-Vue/total', 10, 11)
		])
	);

	it('shows each browser’s slowdown, overall first', () => {
		expect(table.rows.map((row) => row.label)).toEqual(['Overall Score', 'TodoMVC-Vue']);
		expect(table.rows[0].values.firefox.formatted).toBe('+50%');
		expect(table.rows[0].values.chrome.formatted).toBe('+25%');
	});

	it('shows how much more Firefox slows down, in percentage points', () => {
		expect(table.rows[0].diffs.chrome).toMatchObject({ formatted: '+25 pp', color: 'red' });
		expect(table.rows[1].diffs.chrome.formatted).toBe('+10 pp');
		expect(table.rows[0].diffs.car.formatted).toBe('N/A');
	});

	it('has no Safari columns', () => {
		expect(table.valueColumns.map((column) => column.key)).toEqual([
			'firefox',
			'firefox-nar',
			'chrome',
			'car'
		]);
		expect(table.diffColumns.map((column) => column.key)).toEqual(['chrome', 'car']);
	});
});

describe('formatting', () => {
	it('signs slowdowns', () => {
		expect(formatSlowdown(0.3027)).toBe('+30.3%');
		expect(formatSlowdown(-0.01)).toBe('-1%');
		expect(formatSlowdown(null)).toBe('N/A');
	});

	it('colours gaps by how much worse Firefox is', () => {
		expect(gapColor(-0.03)).toBe('green');
		expect(gapColor(0.01)).toBe('black');
		expect(gapColor(0.03)).toBe('#b38f00');
		expect(gapColor(0.06)).toBe('red');
	});

	it('names the baseline’s push when it is not the same one', () => {
		const [exact] = pairImpacts([
			baseline(27.71, { revision: 'abcdef123' }),
			accessible(21.27, { revision: 'abcdef123' })
		]);
		expect(impactTooltip('Firefox', exact)).toBe('Firefox: +30.3% (SP3 27.71, a11y 21.27, abcdef)');

		const [near] = pairImpacts([
			baseline(27.71, { revision: '123456789', date: at(1) }),
			accessible(21.27, { revision: 'abcdef123', date: at(0) })
		]);
		expect(impactTooltip('Firefox', near)).toContain('SP3 27.71 from 123456');
	});
});

describe('the Speedometer 3 Accessibility URL', () => {
	const url = (search: string) => new URL(`https://example.org/speedometer-a11y${search}`);

	it('defaults to Windows, mozilla-central and the overall score', () => {
		expect(parseSpeedometerState(url(''), a11ySchema)).toMatchObject({
			os: 'windows',
			repository: 'mozilla-central',
			subtest: 'score'
		});
	});

	it('offers only the platforms the suite runs on', () => {
		expect(parseSpeedometerState(url('?os=android-s24'), a11ySchema).os).toBe('windows');
		expect(parseSpeedometerState(url('?os=android-a55'), a11ySchema).os).toBe('android-a55');
	});

	it('ignores autoland, which the suite does not run on', () => {
		expect(parseSpeedometerState(url('?repository=autoland'), a11ySchema).repository).toBe(
			'mozilla-central'
		);
		const sp3 = new URL('https://example.org/speedometer?repository=autoland');
		expect(parseSpeedometerState(sp3, speedometerSchema).repository).toBe('autoland');
	});
});
