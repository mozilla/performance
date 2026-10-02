import { vi } from 'vitest';

/**
 * A `fetch` stub whose recorded calls are typed, so tests can assert on the
 * request URL and init without casting.
 */
export function stubFetch(
	handler: (url: string, init?: RequestInit) => Response | Promise<Response>
) {
	const spy = vi.fn((url: string, init?: RequestInit) => Promise.resolve(handler(url, init)));
	vi.stubGlobal('fetch', spy);
	return spy;
}

/** A stub that answers every request with the same JSON body. */
export function stubJson(body: unknown) {
	return stubFetch(() => Response.json(body));
}
