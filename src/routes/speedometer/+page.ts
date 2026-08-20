/**
 * Components read page.url.searchParams during rendering, which SvelteKit
 * forbids during prerendering. Render them in the browser so they can use the
 * current URL's query state.
 *
 * `prerender` is inherited from the root layout and still emits an HTML shell
 * for this route. Static hosting itself does not require disabling SSR.
 */
export const ssr = false;
