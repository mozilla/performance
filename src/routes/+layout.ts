// Emit static HTML for every route. Each page also sets ssr = false, so these
// files contain app shells; components render and fetch data in the browser.
export const prerender = true;

// Emit flat .html files. The reroute hook resolves their URLs in the client.
export const trailingSlash = 'never';
