import { expect, test } from './fixtures';

interface HtmlUrl {
	file: string;
	/** Set by the page component; absent if the route did not match. */
	title: RegExp;
}

const HTML_URLS: HtmlUrl[] = [
	{ file: 'index.html', title: /^Performance Bugs$/ },
	{ file: 'speedometer.html', title: /^Speedometer 3 — / },
	{ file: 'speedometer_job_debug.html', title: /^Speedometer 3 Job Debug$/ },

	{ file: 'speedometer-experimental.html', title: /^Speedometer Experimental — / },
	{ file: 'jetstream.html', title: /^JetStream 3 — / },
	{ file: 'android.html', title: /^Android — / },
	{ file: 'navbench.html', title: /^Navigation Benchmark — / },
	{ file: 'networking.html', title: /^Firefox Networking$/ },
	{ file: 'memory.html', title: /^Firefox Memory — Desktop$/ },
	{ file: 'ml.html', title: /^Firefox AI Runtime$/ },
	// Anchored, so it cannot pass by matching the ML page's title as a prefix.
	{ file: 'ml-engine.html', title: /^Firefox AI Runtime Engines$/ }
];

for (const { file, title } of HTML_URLS) {
	test(`/${file} still resolves`, async ({ page }) => {
		const response = await page.goto(`/${file}`);

		// A real file, not an SPA fallback: there is no fallback configured, so a
		// 200 here means the build emitted this exact filename.
		expect(response?.status(), `/${file} was not served`).toBe(200);

		await expect(page).toHaveTitle(title);

		// The content column is populated, not just the shell. The title alone
		// would pass on a page that mounted and then threw on its first render.
		await expect(page.locator('main.content').locator('*').first()).toBeVisible();

		// And no redirect: the hook rewrites the route id, not the address bar, so
		// the URL the user shared is the URL they still see.
		expect(new URL(page.url()).pathname).toBe(`/${file}`);
	});
}

test('the extensionless spelling resolves to the same page', async ({ page }) => {
	// Both work, and both must: the sidebar emits the extensionless form, so
	// clicking through from an .html URL changes the spelling mid-session.
	await page.goto('/speedometer');
	await expect(page).toHaveTitle(/^Speedometer 3 — /);
	expect(new URL(page.url()).pathname).toBe('/speedometer');
});

test('query parameters survive the reroute', async ({ page }) => {
	// The hook only touches the pathname. If it ever reconstructed the URL
	// instead, this is what would silently disappear.
	await page.goto('/speedometer.html?os=windows&range=7');

	await expect(page).toHaveTitle(/^Speedometer 3 — /);
	await expect(page.getByRole('link', { name: '1 week', exact: true })).toHaveAttribute(
		'aria-current',
		'true'
	);
	expect(page.url()).toContain('os=windows');
});

test('state is shareable from an .html path', async ({ page }) => {
	await page.goto('/ml-engine.html');
	await expect(page).toHaveTitle(/^Firefox AI Runtime Engines$/);

	await page.getByLabel('Filter by EngineId:').selectOption('pdfjs');
	await expect.poll(() => new URL(page.url()).searchParams.get('engine')).toBe('pdfjs');
	expect(new URL(page.url()).pathname).toBe('/ml-engine.html');

	// And reloading that URL lands on the same view.
	await page.goto(page.url());
	await expect(page.locator('section.engine h2')).toHaveText('pdfjs');
});

test('parameter aliases select the requested state', async ({ page }) => {
	// The unit tests cover the alias table; this covers it being wired into the
	// page at all, which is the part they cannot see.
	await page.goto('/speedometer.html?repo=autoland&range=3months');

	await expect(page.getByRole('link', { name: '3 months', exact: true })).toHaveAttribute(
		'aria-current',
		'true'
	);
	await expect(page.getByRole('checkbox', { name: /autoland/i })).toBeChecked();
});

test('unknown routes are not served', async ({ page }) => {
	for (const gone of ['/unknown.html', '/unknown']) {
		const response = await page.request.get(gone);
		expect(response.status(), `${gone} is still being served`).toBeGreaterThanOrEqual(400);
	}
});

for (const { path, label, submenu } of [
	{ path: '/index.html', label: 'Performance Bugs', submenu: null },
	{ path: '/speedometer.html', label: 'Speedometer', submenu: 'Job Debug' },
	{ path: '/speedometer_job_debug.html', label: 'Job Debug', submenu: 'Experimental' },
	{ path: '/speedometer-experimental.html', label: 'Experimental', submenu: 'Job Debug' },
	{ path: '/ml.html', label: 'ML', submenu: 'Runtime Engines' },
	{ path: '/ml-engine.html', label: 'Runtime Engines', submenu: 'Runtime Engines' }
]) {
	test(`sidebar follows the resolved route at ${path}`, async ({ page }) => {
		await page.goto(path);
		await expect(page.locator('aside nav a.active')).toHaveText(label);
		if (submenu) {
			await expect(page.getByRole('link', { name: submenu, exact: true })).toBeVisible();
		}
	});
}
