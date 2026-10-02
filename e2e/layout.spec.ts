/**
 * Layout stability during user interactions.
 *
 * Both are behaviour over time rather than appearance at a moment: something
 * moves when it should not. A screenshot of either page at either instant looks
 * correct, and a screenshot diff would only say "these two images differ",
 * which is also what a legitimate data change says. What matters is the
 * relationship between two measurements, so that is what is asserted.
 */
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { documentTop, waitForChart, waitForLoaded } from './helpers';

/**
 * The header is one row of a three-column grid, and both items have to be on
 * it. The button comes first in source order and is placed in column 3, so
 * without an explicit `grid-row` auto-placement has already passed column 2 by
 * the time it reaches the title, which lands in an implicit *second* row.
 * `align-items: center` then centres each item within its own row rather than
 * within the bar: the button sat against the top edge and the title hung 6px
 * out of the bottom.
 *
 * Compares the space above each item with the space below it, so restyling the
 * bar -- a taller header, a different font, more padding on the button -- does
 * not fail it. Only being off-centre does.
 */
test('the header centres its title and its button vertically', async ({ page }) => {
	await page.goto('/');
	// This route disables SSR, so the layout header appears only after the
	// app mounts in the browser; wait before measuring it.
	await expect(page.locator('.top')).toBeVisible();

	const gaps = await page.evaluate(() => {
		const bar = document.querySelector('.top')!.getBoundingClientRect();
		const measure = (selector: string) => {
			const box = document.querySelector(selector)!.getBoundingClientRect();
			return { above: box.top - bar.top, below: bar.bottom - box.bottom };
		};
		return { title: measure('.top-title'), button: measure('.report-btn') };
	});

	// A pixel of slack: a box of odd height in a bar of even height cannot have
	// exactly equal gaps.
	expect(Math.abs(gaps.title.above - gaps.title.below), 'the title').toBeLessThanOrEqual(1);
	expect(Math.abs(gaps.button.above - gaps.button.below), 'the button').toBeLessThanOrEqual(1);
});

test('Job Debug: changing the range does not move the chart', async ({ page }) => {
	await page.goto('/speedometer_job_debug');
	await waitForLoaded(page);
	await waitForChart(page);

	const chart = page.locator('.chart-frame');
	const legend = page.locator('[aria-label="Machines"]');
	const legendHeight = () => legend.evaluate((e) => Math.round(e.getBoundingClientRect().height));

	const before = { chart: await documentTop(chart), legendHeight: await legendHeight() };

	// The legend is derived from the data, so a different range yields a
	// different set of machines and a different number of wrapped rows. Above
	// the chart, that moved the chart, the range picker and the table by up to
	// 161px on live data -- which reads as the page having scrolled.
	await page.getByRole('link', { name: '1 year', exact: true }).click();

	// The legend changing size is both the point of the test and the signal that
	// the new data has landed, so it is the wait rather than a closing
	// assertion. `waitForLoaded` cannot serve here: it means "no spinner", which
	// is also true in the moment between the click and the spinner mounting. As
	// a closing assertion this measured the old legend about one run in four
	// once responses were slowed to 400ms -- and blamed the fixture for it.
	await expect
		.poll(legendHeight, { message: 'the legend never changed size, so this proves nothing' })
		.not.toBe(before.legendHeight);
	await waitForChart(page);

	expect(await documentTop(chart), 'the chart moved when the legend reflowed').toBe(before.chart);
});

test('Job Debug: isolating a machine does not move the chart or the legend', async ({ page }) => {
	await page.goto('/speedometer_job_debug');
	await waitForLoaded(page);
	await waitForChart(page);

	const chart = page.locator('.chart-frame');
	const secondChip = page.locator('[aria-label="Machines"] a').nth(1);
	const thirdChip = page.locator('[aria-label="Machines"] a').nth(2);

	const chartBefore = await documentTop(chart);
	const clickedBefore = await secondChip.boundingBox();
	const neighbourBefore = await thirdChip.boundingBox();

	await secondChip.click();
	await waitForLoaded(page);
	await expect(secondChip).toHaveClass(/selected/);

	expect(await documentTop(chart)).toBe(chartBefore);

	// Selection is styled with colour and an inset shadow rather than weight or
	// size, so no chip resizes -- otherwise the ones after the clicked chip
	// shift out from under the cursor that just clicked it, and a second click
	// lands on a different machine than the one being pointed at.
	expect((await secondChip.boundingBox())?.width).toBeCloseTo(clickedBefore?.width ?? 0, 0);
	expect((await thirdChip.boundingBox())?.x).toBeCloseTo(neighbourBefore?.x ?? 0, 0);
});

test('Android: an open recording panel does not displace the chart', async ({ page }) => {
	await page.goto('/android');
	await waitForLoaded(page);
	await waitForChart(page);

	const chart = page.locator('.chart-frame');
	const chartBefore = await documentTop(chart);

	await page.goto('/android?job=586889877');
	await expect(page.locator('video')).toBeVisible();

	expect(await documentTop(chart), 'the chart moved when the panel opened').toBe(chartBefore);
});

test('Android: the recording is playable and labelled with its own replicate', async ({ page }) => {
	await page.goto('/android?job=586889877');
	await expect(page.locator('video')).toBeVisible();

	const options = page.locator('.video-slot select option');
	await expect(options).toHaveCount(10);

	// The pairing bug, end to end: with a string sort the tenth entry would be
	// the second in the list and carry replicate 2's value.
	await expect(options.nth(9)).toHaveText(/Replicate 10/);

	await expect(page.locator('.video-slot .caption')).toHaveText(/Replicate 1:.*vid0_fenix\.mp4/);
});

test('NavBench: recordings are grouped by site and open on the charted one', async ({ page }) => {
	await page.goto('/navbench?test=bbc-nav-subnav-score&job=586846438');
	await expect(page.locator('video')).toBeVisible();

	const selects = page.locator('.video-slot select');
	await expect(selects).toHaveCount(2);

	// Opens the site whose chart was clicked, not the first alphabetically.
	await expect(selects.first()).toHaveValue('bbc-nav-subnav');

	await expect(page.locator('.video-slot .caption')).toHaveText(/Replicate 1: .* — 1\.mp4$/);

	const replicates = page.locator('.video-slot select').nth(1).locator('option');
	await expect(replicates).toHaveCount(10);
	await expect(replicates.nth(9)).toHaveText(/Replicate 10/);
});

/**
 * Scroll behaviour of the link-based controls.
 *
 * Every control here is a real link, so SvelteKit scrolls to the top on click
 * like a browser does -- which threw the page to the top when you picked a
 * range on a chart you were already looking at. `data-sveltekit-noscroll`
 * suppresses it, but the attribute is the mechanism, not the behaviour: a
 * control that suppressed the reset some other way would be equally correct.
 * So these click the real thing and look at where the page ended up.
 */
const SCROLL_CASES: Array<{ name: string; path: string; control(page: Page): Locator }> = [
	{
		name: 'the range picker',
		path: '/speedometer',
		control: (page) => page.getByRole('link', { name: '1 month', exact: true })
	},
	{
		name: 'the machine legend',
		path: '/speedometer_job_debug',
		control: (page) => page.locator('[aria-label="Machines"] a').nth(1)
	}
	// The platform picker is deliberately absent: it sits at the very top of the
	// page, so `click()` scrolls the page up to reach it and the test measures
	// Playwright rather than the app. It is checked in the component test
	// instead, which is the one place a mechanism assertion earns its keep.
];

for (const { name, path, control } of SCROLL_CASES) {
	test(`${name} does not scroll the page to the top`, async ({ page }) => {
		await page.goto(path);
		await waitForLoaded(page);
		await waitForChart(page);

		// Scrolled as far down as possible while leaving the control itself in
		// view. Not a fixed offset: `click()` scrolls the page to reach a control
		// that is off screen, so a control near the top of the page would be
		// scrolled to the top by the click itself and the test would blame the
		// app for it.
		const target = await control(page).evaluate((element) => {
			const top = element.getBoundingClientRect().top + window.scrollY;
			const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
			return Math.max(0, Math.min(top - 20, maxScroll));
		});
		await page.evaluate((y) => window.scrollTo(0, y), target);

		const before = await page.evaluate(() => window.scrollY);
		expect(before, 'the page is too short to scroll, so this proves nothing').toBeGreaterThan(0);

		await control(page).click();
		await waitForLoaded(page);
		await waitForChart(page);

		// Compared against the clamp rather than against `before`: a shorter range
		// can legitimately make the page shorter, and the browser then pins the
		// scroll to the new bottom. What must not happen is a jump to the top.
		const maxScroll = await page.evaluate(() =>
			Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
		);
		expect(await page.evaluate(() => window.scrollY)).toBe(Math.min(before, maxScroll));
	});
}

test('picking a subtest in the breakdown table does scroll back to the chart', async ({ page }) => {
	await page.goto('/speedometer');
	await waitForLoaded(page);
	await waitForChart(page);

	const subtest = page.locator('tbody tr .test-name a').nth(1);
	await subtest.scrollIntoViewIfNeeded();
	expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

	await subtest.click();

	// Polled, not read once after `waitForLoaded`: the scroll reset happens when
	// the navigation completes, and when the data for the new subtest is already
	// in hand no spinner ever mounts, so "no spinner on screen" can be true
	// before the navigation has finished. Reading once made this pass or fail on
	// which of the two won the race.
	await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});
