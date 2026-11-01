/// <reference types="node" />
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { sveltekit } from '@sveltejs/kit/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig } from 'vitest/config';

// Leave BASE_PATH unset for the shared root and /performance/ deployments.
// Relative asset URLs let the same build serve both prefixes.
// SvelteKit rejects a value that does not start with a slash.
const base = (process.env.BASE_PATH ?? '') as '' | `/${string}`;

export default defineConfig({
	plugins: [
		sveltekit({
			preprocess: vitePreprocess(),
			// Static output: every route is prerendered to an HTML shell, and all
			// data is fetched client-side from Treeherder / Bugzilla / Redash. There
			// is no server at runtime.
			adapter: adapter({
				pages: 'build',
				assets: 'build',
				// No SPA fallback: every route is a real prerendered file, so an
				// unknown path should 404 rather than silently boot the app.
				fallback: undefined,
				strict: true
			}),
			paths: { base },
			prerender: { handleHttpError: 'fail', handleMissingId: 'fail' }
		})
	],
	test: {
		// Two projects, because most of what is worth testing here is pure
		// logic -- URL round-trips, signature selection, alert grouping, table
		// arithmetic -- and that should not pay for a DOM.
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'unit',
					environment: 'node',
					include: ['src/**/*.test.ts'],
					exclude: ['src/**/*.svelte.test.ts']
				}
			},
			{
				extends: './vite.config.ts',
				plugins: [svelteTesting()],
				test: {
					name: 'component',
					environment: 'jsdom',
					include: ['src/**/*.svelte.test.ts'],
					setupFiles: ['./src/tests/setup.ts']
				}
			}
		]
	}
});
