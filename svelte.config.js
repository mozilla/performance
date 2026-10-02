import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// Leave BASE_PATH unset for the shared root and /performance/ deployments.
// Relative asset URLs let the same build serve both prefixes.
const base = process.env.BASE_PATH ?? '';

/** @type {import('@sveltejs/kit').Config} */
export default {
	preprocess: vitePreprocess(),
	kit: {
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
		prerender: {
			handleHttpError: 'fail',
			handleMissingId: 'fail'
		}
	}
};
