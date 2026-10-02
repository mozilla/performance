import { describe, expect, it } from 'vitest';
import { reroute } from './hooks';

const routeFor = (href: string) =>
	(reroute as (event: { url: URL }) => string | undefined)({ url: new URL(href) });

describe('reroute', () => {
	it('maps .html paths to extensionless routes', () => {
		expect(routeFor('https://performance.mozilla.org/speedometer.html')).toBe('/speedometer');
	});

	it('maps /index.html to the root rather than a route called index', () => {
		expect(routeFor('https://performance.mozilla.org/index.html')).toBe('/');
	});

	it('leaves extensionless paths alone, so the router matches them directly', () => {
		expect(routeFor('https://performance.mozilla.org/speedometer')).toBeUndefined();
		expect(routeFor('https://performance.mozilla.org/')).toBeUndefined();
	});

	it('ignores the query string and hash', () => {
		expect(routeFor('https://performance.mozilla.org/speedometer.html?os=windows&range=90#c')).toBe(
			'/speedometer'
		);
	});

	it('does not invent routes for unknown paths', () => {
		// These 404 at the server before any of this runs, since the files are
		// gone. Recorded so that the hook is not later blamed for it.
		expect(routeFor('https://performance.mozilla.org/js.html')).toBe('/js');
	});

	describe('under a path prefix', () => {
		// The site is reachable at two prefixes at once. SvelteKit sets the return
		// value as `url.pathname` and strips `base` afterwards, so the prefix has
		// to survive rerouting -- dropping it would break
		// mozilla.github.io/performance/ specifically, which is the origin the
		// canonical hostname proxies to.
		it('preserves the prefix on an ordinary page', () => {
			expect(routeFor('https://mozilla.github.io/performance/memory.html')).toBe(
				'/performance/memory'
			);
		});

		it('leaves the prefix as the whole path for /index.html', () => {
			expect(routeFor('https://mozilla.github.io/performance/index.html')).toBe('/performance/');
		});
	});
});
