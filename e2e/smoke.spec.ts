/**
 * One pass over the routes nothing else opens: they load, they draw, and they
 * did nothing unexpected.
 *
 * Only the routes with no test of their own are listed. Speedometer, Job Debug,
 * Android and Memory are each opened by a specific test here or in
 * `layout.spec.ts` that waits for the same chart, so a second "renders" case
 * for them was another browser test for no more coverage. The console-error and
 * unmatched-request checks that were its other reason to exist now run at
 * teardown for every test -- see `fixtures.ts`.
 *
 * Deliberately shallow. Per-page behaviour is tested against pure functions in
 * `src/`, where it is faster and the failures are legible; what a browser adds
 * is the part those cannot see -- that the wiring runs, that Chart.js actually
 * receives the data, and that nothing throws on the way.
 */
import { expect, test } from './fixtures';
import { waitForChart, waitForLoaded } from './helpers';

interface RouteCase {
	name: string;
	path: string;
	/** Text that only appears once the page's own content has rendered. */
	heading: RegExp;
	/** A DOM assertion that can only pass if the page's data arrived. */
	evidence(page: import('@playwright/test').Page): Promise<void>;
}

const rows = (page: import('@playwright/test').Page, atLeast: number) =>
	expect(page.locator('tbody tr').first())
		.toBeVisible()
		.then(async () => {
			expect(await page.locator('tbody tr').count()).toBeGreaterThanOrEqual(atLeast);
		});

const ROUTES: RouteCase[] = [
	{
		name: 'Performance Bugs',
		path: '/',
		heading: /Untriaged/i,
		evidence: (page) => rows(page, 1)
	},
	{
		name: 'JetStream',
		path: '/jetstream',
		heading: /higher is better/,
		evidence: (page) => rows(page, 1)
	},
	{
		name: 'Speedometer Experimental',
		path: '/speedometer-experimental',
		heading: /Overall Score \(higher is better\)/,
		// The overall, the workload and the power figure: one row per test the
		// signatures list, which is the discovery upstream does not do.
		evidence: async (page) => {
			await rows(page, 3);
			await expect(page.locator('tbody')).toContainText('uWh');
		}
	},
	{
		name: 'Navigation Benchmark',
		path: '/navbench',
		heading: /Navigation Benchmark/,
		evidence: (page) => rows(page, 1)
	},
	{
		name: 'Networking',
		path: '/networking',
		heading: /Firefox Networking/,
		evidence: (page) => expect(page.locator('canvas').first()).toBeVisible()
	},
	{
		name: 'ML',
		path: '/ml',
		heading: /ML|Inference/,
		evidence: (page) => expect(page.locator('canvas').first()).toBeVisible()
	}
];

for (const route of ROUTES) {
	test(`${route.name} renders`, async ({ page }) => {
		await page.goto(route.path);
		await expect(page.getByText(route.heading).first()).toBeVisible();
		await waitForLoaded(page);
		await route.evidence(page);

		// Not a screenshot. A canvas that exists, is the right size and is blank
		// is exactly what a page whose data never arrived looks like.
		await waitForChart(page);
	});
}

test('the sidebar links to every route and none of them 404', async ({ page }) => {
	await page.goto('/');

	const links = page.locator('nav a[href^="/"]');
	await expect.poll(() => links.count()).toBeGreaterThanOrEqual(5);

	const hrefs = await links.evaluateAll((all) => all.map((link) => link.getAttribute('href')!));

	for (const href of new Set(hrefs)) {
		const response = await page.request.get(href);
		expect(response.status(), href).toBe(200);
	}
});

test('changing the range does not refetch the breakdown table', async ({ page }) => {
	const summaries: string[] = [];
	page.on('request', (request) => {
		if (request.url().includes('/api/performance/summary/')) summaries.push(request.url());
	});

	await page.goto('/speedometer');
	// Wait for the table itself, not just for the spinners to clear: there is an
	// instant before the table's own spinner mounts when neither is on screen.
	await expect(page.locator('tbody tr').first()).toBeVisible();
	await waitForLoaded(page);
	const rowsBefore = await page.locator('tbody tr').count();
	expect(rowsBefore).toBeGreaterThan(1);

	// "1 week", not "1 month", on purpose: the table's window is a fixed 30 days,
	// so a 1-month chart request carries the same `interval` and there would be
	// no way to tell the two apart in the request log.
	summaries.length = 0;
	await page.getByRole('link', { name: '1 week', exact: true }).click();
	const seconds = (days: number) => days * 24 * 60 * 60;
	const matching = (days: number) =>
		summaries.filter((url) => url.includes(`interval=${seconds(days)}`)).length;

	// The chart refetching is the signal that the click has been acted on, so it
	// is the wait rather than a closing assertion. `waitForLoaded` cannot serve
	// here: it means "no spinner", which is also true in the moment between the
	// click and the spinner mounting -- and read that early, an empty request
	// log says nothing at all.
	await expect.poll(() => matching(7), { message: 'the chart never refetched' }).toBeGreaterThan(0);
	await waitForChart(page);

	// Every state field lives in one URL, so a resource that reads the parsed
	// state object depends on all of it and re-runs whenever any of it changes.
	// That made a range click refetch all 21 signatures behind the table and
	// blank it, which is both a wasted fan-out and a visible flash on a part of
	// the page the click had nothing to do with.
	expect(matching(30), 'the table refetched on a range change').toBe(0);

	// And the table is still there afterwards.
	expect(await page.locator('tbody tr').count()).toBe(rowsBefore);
});

test('switching Memory process does not refetch the CSV', async ({ page }) => {
	const csvRequests: string[] = [];
	page.on('request', (request) => {
		if (request.url().includes('results.csv')) csvRequests.push(request.url());
	});

	await page.goto('/memory');
	await expect(page.locator('canvas').first()).toBeVisible();
	await waitForLoaded(page);

	// Same shape as the Speedometer case above: the process is a display choice
	// over data already in hand, so changing it must not go back to Redash for
	// six months of a twenty-column CSV.
	csvRequests.length = 0;
	await page.getByRole('link', { name: 'Content (tab)', exact: true }).click();
	await waitForLoaded(page);
	await expect(page.locator('canvas').first()).toBeVisible();

	expect(csvRequests, 'the CSV was refetched on a process change').toEqual([]);
});

test('a chart page survives being driven faster than it can load', async ({ page }) => {
	await page.goto('/speedometer');
	await waitForLoaded(page);

	for (const label of ['1 week', '1 year', '1 month', '3 months']) {
		await page.getByRole('link', { name: label, exact: true }).click();
	}

	await waitForLoaded(page);

	// The last click wins, whatever order the responses arrived in.
	await expect(page).toHaveURL(/\/speedometer$/);
	await expect(page.getByRole('link', { name: '3 months', exact: true })).toHaveAttribute(
		'aria-current',
		'true'
	);
});
