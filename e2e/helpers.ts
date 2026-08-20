/**
 * Waiting on conditions rather than on the clock.
 *
 * Every helper here answers a question about the page's state. The ad-hoc
 * checking these replace waited a guessed number of seconds and then looked,
 * which means a slow response and a broken page produce the same result.
 */
import { expect, type Locator, type Page } from '@playwright/test';

/** No spinner is on screen. Spinners carry role="status". */
export async function waitForLoaded(page: Page): Promise<void> {
	await expect(page.locator('[role="status"]')).toHaveCount(0);
}

/**
 * How much of a chart canvas has been drawn on, as a fraction of its pixels.
 *
 * Reading the pixels rather than reaching into Chart.js keeps the assertion
 * independent of the library, and it is the question actually worth asking:
 * a canvas can exist, be correctly sized and be empty. That is exactly what a
 * page whose data never arrived looks like, and it is also what a screenshot
 * of one looks like next to a chart that has not finished animating -- which
 * is why this is a number and not an image.
 */
export async function canvasInk(canvas: Locator): Promise<number> {
	return canvas.evaluate((element) => {
		const canvasElement = element as HTMLCanvasElement;
		const context = canvasElement.getContext('2d', { willReadFrequently: true });
		if (!context || canvasElement.width === 0) return 0;

		const { data } = context.getImageData(0, 0, canvasElement.width, canvasElement.height);

		// The first pixel is the background wherever a chart has margins, which
		// Chart.js always does. Anything differing from it is drawn content.
		const [r0, g0, b0, a0] = data;
		let drawn = 0;
		// Every 16th pixel: enough to distinguish "blank" from "a scatter plot"
		// without moving a megabyte of pixels per assertion.
		for (let i = 0; i < data.length; i += 4 * 16) {
			if (data[i] !== r0 || data[i + 1] !== g0 || data[i + 2] !== b0 || data[i + 3] !== a0) {
				drawn++;
			}
		}

		return drawn / (data.length / (4 * 16));
	});
}

/** Wait until a chart canvas has actually been drawn on. */
export async function waitForChart(page: Page, index = 0): Promise<void> {
	const canvas = page.locator('canvas').nth(index);
	await expect(canvas).toBeVisible();
	await expect
		.poll(() => canvasInk(canvas), { message: 'the chart canvas stayed blank' })
		.toBeGreaterThan(0.01);
}

/** The y offset of an element in the document, for layout-stability checks. */
export async function documentTop(locator: Locator): Promise<number> {
	return locator.evaluate((element) => Math.round(element.getBoundingClientRect().top + scrollY));
}
