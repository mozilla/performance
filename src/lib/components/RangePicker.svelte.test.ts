import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import PlatformPicker from './PlatformPicker.svelte';
import RangePicker from './RangePicker.svelte';

/**
 * The scroll rule is tested by behaviour, not by attribute, in
 * `e2e/layout.spec.ts` -- clicking each control and looking at where the page
 * ends up. Asserting that `data-sveltekit-noscroll` is present says nothing
 * about whether the page actually stays put, and fails on a change that
 * suppressed the reset some other way and worked fine.
 *
 * The platform picker is the exception, and gets the attribute assertion below,
 * because it sits at the very top of the page: Playwright scrolls the page up
 * in order to click it, so an end-to-end version of this measures the test
 * runner rather than the app.
 */
describe('PlatformPicker scroll suppression', () => {
	it('keeps every option inside a noscroll region', () => {
		const { container } = render(PlatformPicker, {
			props: { selected: 'osxm4', href: (key: string) => `/speedometer/?os=${key}` }
		});

		const region = container.querySelector('[data-sveltekit-noscroll]');
		expect(region).not.toBeNull();

		const links = container.querySelectorAll('a');
		expect(links.length).toBeGreaterThan(0);
		for (const link of links) expect(region!.contains(link)).toBe(true);
	});
});

describe('RangePicker rendering', () => {
	const props = { selected: 30, href: (days: number) => `/speedometer/?range=${days}` };

	it('renders one link per range with the right href', () => {
		const { container } = render(RangePicker, { props });
		const links = [...container.querySelectorAll('a')];

		expect(links.map((a) => a.getAttribute('href'))).toEqual([
			'/speedometer/?range=7',
			'/speedometer/?range=30',
			'/speedometer/?range=90',
			'/speedometer/?range=365'
		]);
	});

	it('marks the selected range for assistive technology', () => {
		const { container } = render(RangePicker, { props });
		const current = container.querySelector('a[aria-current]');

		expect(current?.textContent?.trim()).toBe('1 month');
	});
});
