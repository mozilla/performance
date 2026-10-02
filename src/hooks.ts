/**
 * Resolve .html URLs to extensionless routes without changing the address bar.
 * Preserve the path prefix: SvelteKit removes the app base after rerouting.
 */
import type { Reroute } from '@sveltejs/kit';

export const reroute: Reroute = ({ url }) => {
	if (!url.pathname.endsWith('.html')) return;
	const path = url.pathname.slice(0, -'.html'.length);

	// `/index.html` is the root, not a route called `index`. Without this it
	// strips to `/index`, which matches nothing, and the page renders the shell
	// with an empty content area rather than the Bugs dashboard.
	return path.endsWith('/index') ? path.slice(0, -'index'.length) : path;
};
