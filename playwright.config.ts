import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
	testDir: 'e2e',
	// Nothing here should ever need a timing guess: every wait is on a condition.
	// A test that needs longer than this is stuck, not slow.
	timeout: 30_000,
	expect: { timeout: 10_000 },
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: 0,
	reporter: process.env.CI ? 'list' : [['list']],

	use: {
		baseURL: `http://localhost:${PORT}`,
		trace: 'retain-on-failure'
	},

	projects: [
		{
			name: 'chromium',
			// The viewport goes after the device spread, not in the top-level
			// `use`: a project's `use` wins, and `devices['Desktop Chrome']`
			// carries a viewport of its own that would silently override it.
			use: {
				...devices['Desktop Chrome'],
				// A wide viewport: the sidebar has breakpoints at 64rem and 44rem,
				// and the layout assertions are about the content column.
				viewport: { width: 1440, height: 1000 }
			}
		}
	],

	// Playwright starts the preview server and waits for it to answer, rather
	// than the port being started by hand in another terminal and the test
	// sleeping in the hope that it is up.
	webServer: {
		command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
		url: `http://localhost:${PORT}/`,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
		stdout: 'ignore',
		stderr: 'pipe'
	}
});
