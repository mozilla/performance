/**
 * JSON requests share a URL-keyed promise cache and a concurrency limit.
 * Successful cached responses last for the page lifetime; failures are evicted.
 * Use cache: false for changing measurements and pass the loader's abort signal.
 */
import { createLimiter } from '$lib/limit';

const inFlight = new Map<string, Promise<unknown>>();

/**
 * Cap on concurrent requests. The alert path fans out to roughly 40 requests
 * for the Overall Score view (20 subtests × 2 platforms), each of which can
 * spawn follow-ups for reassigned summaries; firing those at once is unkind to
 * Treeherder and gets slower, not faster, past a handful.
 */
const limit = createLimiter(8);

export class HttpError extends Error {
	constructor(
		readonly url: string,
		readonly status: number,
		readonly statusText: string
	) {
		super(`${status} ${statusText} for ${url}`);
		this.name = 'HttpError';
	}
}

export interface FetchJsonOptions {
	signal?: AbortSignal;
	/**
	 * Set false for responses that change per push (performance data) rather
	 * than per deploy (signature lists).
	 */
	cache?: boolean;
}

export async function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
	const { signal, cache = true } = options;

	if (cache) {
		const existing = inFlight.get(url);
		if (existing) return existing as Promise<T>;
	}

	// Deliberately not passing `signal` to fetch() for cached entries: one
	// caller aborting must not poison the shared promise for the others. The
	// caller's own abort is honoured by resource(), which drops late results.
	const request = limit(() => fetch(url, cache ? undefined : { signal })).then((response) => {
		if (!response.ok) {
			if (cache) inFlight.delete(url);
			throw new HttpError(url, response.status, response.statusText);
		}
		return response.json() as Promise<T>;
	});

	if (cache) {
		inFlight.set(url, request);
		// A failed request should not be cached as a permanent failure.
		request.catch(() => inFlight.delete(url));
	}

	return request;
}

/** Clear the response cache. Only needed by tests and a manual "reload" action. */
export function clearHttpCache(): void {
	inFlight.clear();
}
