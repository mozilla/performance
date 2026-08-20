import { describe, expect, it } from 'vitest';
import { measurement } from '../tests/factories';
import { BROWSERS, classify, groupByBrowser } from './browsers';

describe('classify', () => {
	it('separates Firefox from Nightly-as-Release by platform', () => {
		expect(classify(measurement({ application: 'firefox' }))?.key).toBe('firefox');
		expect(
			classify(
				measurement({
					application: 'firefox',
					platform: 'macosx1500-aarch64-nightlyasrelease'
				})
			)?.key
		).toBe('firefox-nar');
	});

	it('treats fenix as Firefox', () => {
		expect(
			classify(
				measurement({ application: 'fenix', platform: 'android-hw-s24-14-0-aarch64-shippable' })
			)?.key
		).toBe('firefox');
	});

	it.each([
		['chrome', 'chrome'],
		['chrome-m', 'chrome'],
		['custom-car', 'car'],
		['cstm-car-m', 'car'],
		['safari', 'safari'],
		['safari-tp', 'safari-tp']
	])('maps application %s to browser %s', (application, expected) => {
		expect(classify(measurement({ application }))?.key).toBe(expected);
	});

	// Instrumented variants must not be charted as base measurements.
	it('excludes nova variants from Firefox', () => {
		expect(
			classify(measurement({ application: 'firefox', extraOptions: ['nova'] }))
		).toBeUndefined();
	});

	it('excludes fission variants from fenix', () => {
		expect(
			classify(measurement({ application: 'fenix', extraOptions: ['fission'] }))
		).toBeUndefined();
	});

	it('keeps desktop Firefox with a fission option', () => {
		expect(classify(measurement({ application: 'firefox', extraOptions: ['fission'] }))?.key).toBe(
			'firefox'
		);
	});

	it('returns undefined for an unknown application', () => {
		expect(classify(measurement({ application: 'edge' }))).toBeUndefined();
	});
});

describe('groupByBrowser', () => {
	it('returns only browsers that have data, in declaration order', () => {
		const groups = groupByBrowser([
			measurement({ application: 'safari' }),
			measurement({ application: 'chrome' }),
			measurement({ application: 'firefox' })
		]);

		expect(groups.map((g) => g.browser.key)).toEqual(['firefox', 'chrome', 'safari']);
		expect(groups.every((g) => g.measurements.length === 1)).toBe(true);
	});

	it('drops measurements that match no browser', () => {
		const groups = groupByBrowser([
			measurement({ application: 'firefox' }),
			measurement({ application: 'firefox', extraOptions: ['nova'] })
		]);

		expect(groups).toHaveLength(1);
		expect(groups[0].measurements).toHaveLength(1);
	});

	it('returns nothing for no input', () => {
		expect(groupByBrowser([])).toEqual([]);
	});
});

describe('BROWSERS', () => {
	it('has a unique key and colour per browser', () => {
		expect(new Set(BROWSERS.map((b) => b.key)).size).toBe(BROWSERS.length);
		expect(new Set(BROWSERS.map((b) => b.color)).size).toBe(BROWSERS.length);
	});

	// A measurement must not match two definitions, or groupByBrowser would
	// silently assign it to whichever came first.
	it('has mutually exclusive predicates', () => {
		const samples = [
			measurement({ application: 'firefox' }),
			measurement({ application: 'firefox', platform: 'linux2404-64-nightlyasrelease' }),
			measurement({ application: 'fenix' }),
			measurement({ application: 'chrome' }),
			measurement({ application: 'chrome-m' }),
			measurement({ application: 'custom-car' }),
			measurement({ application: 'cstm-car-m' }),
			measurement({ application: 'safari' }),
			measurement({ application: 'safari-tp' })
		];

		for (const sample of samples) {
			expect(BROWSERS.filter((b) => b.matches(sample)).length).toBeLessThanOrEqual(1);
		}
	});
});
