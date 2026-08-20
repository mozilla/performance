/**
 * Rendering reads the search query and sort order from page.url.searchParams;
 * keep this in the browser, as explained in speedometer/+page.ts. Inherited
 * `prerender` still emits a static HTML shell for this route.
 */
export const ssr = false;
