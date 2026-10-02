import { expect, test } from './fixtures';
import { waitForChart, waitForLoaded } from './helpers';

const rowNames = (page: import('@playwright/test').Page) =>
	page.locator('tbody tr th.test-name').allInnerTexts();

test.describe('JetStream subtest filter', () => {
	test('narrows the table to matching tests', async ({ page }) => {
		await page.goto('/jetstream');
		await expect(page.locator('tbody tr').first()).toBeVisible();
		await waitForLoaded(page);

		const before = await rowNames(page);
		expect(before.length).toBeGreaterThan(1);

		await page.getByLabel('Filter tests:').fill('wasm');

		await expect
			.poll(() => rowNames(page).then((names) => names.length))
			.toBeLessThan(before.length);

		for (const name of await rowNames(page)) {
			expect(name.toLowerCase()).toContain('wasm');
		}
	});

	test('the presets drive the box, and Exclude WebAssembly is the inverse', async ({ page }) => {
		await page.goto('/jetstream');
		await expect(page.locator('tbody tr').first()).toBeVisible();
		await waitForLoaded(page);

		// Polled rather than read straight after each click: applying a preset is
		// a URL navigation, so reading immediately can catch the previous render
		// and the assertion passes or fails on timing rather than on behaviour.
		const wasmRows = (names: string[]) => names.filter((n) => n.toLowerCase().includes('wasm'));

		await page.getByRole('link', { name: 'WebAssembly Only', exact: true }).click();
		await expect
			.poll(() => rowNames(page).then((n) => n.length > 0 && wasmRows(n).length === n.length))
			.toBe(true);
		const only = await rowNames(page);

		await page.getByRole('link', { name: 'Exclude WebAssembly', exact: true }).click();
		await expect
			.poll(() => rowNames(page).then((n) => n.length > 0 && wasmRows(n).length === 0))
			.toBe(true);
		const excluded = await rowNames(page);

		// Disjoint, which is the property that matters. The two polls above are
		// what make it meaningful: a filter matching nothing would also produce
		// disjoint sets.
		expect(only.filter((name) => excluded.includes(name))).toEqual([]);

		await page.getByRole('link', { name: 'All Tests', exact: true }).click();
		await expect.poll(() => rowNames(page).then((n) => n.length)).toBeGreaterThan(only.length);
	});

	test('survives a reload, because it lives in the URL', async ({ page }) => {
		await page.goto('/jetstream?filter=wasm');
		await expect(page.locator('tbody tr').first()).toBeVisible();
		await waitForLoaded(page);

		await expect(page.getByLabel('Filter tests:')).toHaveValue('wasm');
		for (const name of await rowNames(page)) {
			expect(name.toLowerCase()).toContain('wasm');
		}
	});
});

test.describe('Comparison table sorting', () => {
	test('clicking a header sorts, and clicking it again reverses', async ({ page }) => {
		await page.goto('/android');
		await expect(page.locator('tbody tr').first()).toBeVisible();
		await waitForLoaded(page);

		const header = page.getByRole('link', { name: /^Test Name/ });

		// Each direction is asserted as a property of the list itself rather than
		// against a snapshot taken before the other click. Comparing the two
		// snapshots looked equivalent and was not: rows are still arriving while
		// the first read happens, so the second list legitimately had two more
		// entries and the reversal comparison failed for a reason unrelated to
		// sorting.
		const sortedBy = (direction: 'asc' | 'desc') => async () => {
			const names = await rowNames(page);
			if (names.length < 2) return false;
			const ordered = [...names].sort((a, b) => a.localeCompare(b));
			if (direction === 'desc') ordered.reverse();
			return JSON.stringify(names) === JSON.stringify(ordered);
		};

		await header.click();
		await expect.poll(sortedBy('asc'), { message: 'not sorted ascending' }).toBe(true);

		await header.click();
		await expect.poll(sortedBy('desc'), { message: 'not sorted descending' }).toBe(true);
	});

	test('the sort is in the URL and announced to assistive tech', async ({ page }) => {
		await page.goto('/android?sort=test&dir=asc');
		await expect(page.locator('tbody tr').first()).toBeVisible();
		await waitForLoaded(page);

		const names = await rowNames(page);
		expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names);
		await expect(page.locator('th[aria-sort="ascending"]')).toHaveCount(1);
	});
});

test('NavBench loads all subtest charts', async ({ page }) => {
	await page.goto('/navbench');
	await expect(page.locator('tbody tr').first()).toBeVisible();
	await waitForLoaded(page);

	const before = await page.locator('canvas').count();

	await page.getByRole('link', { name: 'Load All Subtest Charts' }).click();
	await waitForLoaded(page);

	await expect.poll(() => page.locator('canvas').count()).toBeGreaterThan(before);
	await expect(page.getByRole('link', { name: 'Hide All Subtest Charts' })).toBeVisible();
});

test.describe('JetStream alerts and range (P2, P5)', () => {
	test('the all-subtest alerts toggle is offered on the score and not on a subtest', async ({
		page
	}) => {
		await page.goto('/jetstream');
		await waitForLoaded(page);
		await expect(page.getByText('Show all subtest alerts')).toBeVisible();

		// Same page, a subtest selected: the toggle has nothing to apply to.
		await page.goto('/jetstream?test=Air');
		await waitForLoaded(page);
		await expect(page.getByText('Show all subtest alerts')).toHaveCount(0);
	});

	test('defaults to a year, unlike every other page', async ({ page }) => {
		await page.goto('/jetstream');
		await waitForLoaded(page);

		await expect(page.getByRole('link', { name: '1 year', exact: true })).toHaveAttribute(
			'aria-current',
			'true'
		);
	});

	test('accepts month-based range aliases', async ({ page }) => {
		await page.goto('/jetstream?range=1');
		await waitForLoaded(page);

		await expect(page.getByRole('link', { name: '1 month', exact: true })).toHaveAttribute(
			'aria-current',
			'true'
		);
	});
});

test.describe('ML Runtime Engines page', () => {
	test('renders one section per engine, with its charts and stats', async ({ page }) => {
		await page.goto('/ml-engine');
		await waitForLoaded(page);

		// The fixture publishes five engine ids, one of which is null.
		await expect.poll(() => page.locator('section.engine').count()).toBe(5);
		await waitForChart(page);

		const first = page.locator('section.engine').first();
		await expect(first.getByRole('heading', { name: 'Engine creation' })).toBeVisible();
		await expect(first.getByRole('heading', { name: 'Inference' })).toBeVisible();
		await expect(first.getByText('Failure rate')).toHaveCount(2);

		// `pdfjs` is the fixture's engine with null failure counts on both
		// sides, which is how the upstream FULL JOIN reports "nothing failed".
		// 0%, not a blank or a NaN, is the assertion that the null became a zero
		// count rather than an unusable value.
		const pdfjs = page.locator('section.engine', { has: page.getByText('pdfjs', { exact: true }) });
		await expect(pdfjs.locator('.card').first().locator('dd').last()).toHaveText('0%');
	});

	test('the null engine id is named rather than rendered as "null"', async ({ page }) => {
		await page.goto('/ml-engine');
		await waitForLoaded(page);

		// Polled, not read once. Every page sets `ssr = false`, so the served
		// HTML is an empty shell with no spinner in it -- which means
		// `waitForLoaded` can be satisfied *before* client rendering has started, and a
		// single `allInnerTexts()` then reads an empty list and the assertion
		// fails on scheduling rather than on behaviour. Caught exactly that way,
		// once, under a full parallel run.
		const headings = page.locator('section.engine h2');
		await expect.poll(() => headings.count()).toBe(5);

		const texts = await headings.allInnerTexts();
		expect(texts).toContain('(unattributed)');
		expect(texts).not.toContain('null');
	});

	test('a failures-only engine says so instead of drawing an empty chart', async ({ page }) => {
		// The fixture's null-id rows carry counts and null percentiles, which is
		// how the upstream FULL JOIN reports an engine that never succeeded. An
		// all-null dataset handed to Chart.js draws axes over an empty grid and
		// is indistinguishable from a chart whose data never arrived.
		await page.goto('/ml-engine?engine=(unattributed)');
		await waitForLoaded(page);

		const section = page.locator('section.engine');
		await expect(section).toHaveCount(1);
		await expect(section.getByText(/no latency to plot/i)).toBeVisible();
		await expect(section.locator('canvas')).toHaveCount(0);

		// The counts are still there; that is the point of not hiding the engine.
		await expect(section.getByText('Failure rate')).toHaveCount(2);
	});

	test('the filter narrows to one engine and lives in the URL', async ({ page }) => {
		await page.goto('/ml-engine');
		await waitForLoaded(page);

		await page.getByLabel('Filter by EngineId:').selectOption('pdfjs');

		await expect.poll(() => page.locator('section.engine').count()).toBe(1);
		await expect(page.locator('section.engine h2')).toHaveText('pdfjs');
		expect(new URL(page.url()).searchParams.get('engine')).toBe('pdfjs');

		await page.reload();
		await waitForLoaded(page);
		await expect(page.locator('section.engine h2')).toHaveText('pdfjs');
	});

	test('an engine that is no longer in the window says so', async ({ page }) => {
		// Rather than resetting to all engines, which makes a stale bookmark
		// look like it worked.
		await page.goto('/ml-engine?engine=engine-that-retired');
		await waitForLoaded(page);

		await expect(page.getByText(/No engine called/)).toBeVisible();
		await expect(page.locator('section.engine')).toHaveCount(0);
	});
});
