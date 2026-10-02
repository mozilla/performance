import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stubFetch, stubJson } from '../../tests/fetch-mock';
import { clearHttpCache, fetchJson, HttpError } from './http';

describe('fetchJson', () => {
	beforeEach(() => clearHttpCache());
	afterEach(() => vi.unstubAllGlobals());

	it('returns parsed JSON', async () => {
		stubJson({ ok: 1 });
		await expect(fetchJson('https://example.org/a')).resolves.toEqual({ ok: 1 });
	});

	it('shares one request between concurrent callers of the same URL', async () => {
		const spy = stubJson({ ok: 1 });

		await Promise.all([fetchJson('https://example.org/a'), fetchJson('https://example.org/a')]);

		expect(spy).toHaveBeenCalledTimes(1);
	});

	it('reuses the cached response for later callers', async () => {
		const spy = stubJson({ ok: 1 });

		await fetchJson('https://example.org/a');
		await fetchJson('https://example.org/a');

		expect(spy).toHaveBeenCalledTimes(1);
	});

	it('does not share between different URLs', async () => {
		const spy = stubJson({ ok: 1 });

		await Promise.all([fetchJson('https://example.org/a'), fetchJson('https://example.org/b')]);

		expect(spy).toHaveBeenCalledTimes(2);
	});

	it('bypasses the cache when asked', async () => {
		const spy = stubJson({ ok: 1 });

		await fetchJson('https://example.org/a', { cache: false });
		await fetchJson('https://example.org/a', { cache: false });

		expect(spy).toHaveBeenCalledTimes(2);
	});

	it('throws HttpError with the status for a non-ok response', async () => {
		stubFetch(() => new Response('nope', { status: 503, statusText: 'Nope' }));

		await expect(fetchJson('https://example.org/a')).rejects.toBeInstanceOf(HttpError);
	});

	// A transient failure must not become a permanent cached failure.
	it('evicts a failed request so it can be retried', async () => {
		let call = 0;
		const spy = stubFetch(() =>
			call++ === 0
				? new Response('nope', { status: 500, statusText: 'Error' })
				: Response.json({ ok: 1 })
		);

		await expect(fetchJson('https://example.org/a')).rejects.toThrow();
		await expect(fetchJson('https://example.org/a')).resolves.toEqual({ ok: 1 });
		expect(spy).toHaveBeenCalledTimes(2);
	});

	// One caller walking away must not cancel the shared request for the
	// others, so a cached request deliberately does not forward its signal.
	it('does not let one caller abort a shared request', async () => {
		const spy = stubJson({ ok: 1 });

		const controller = new AbortController();
		const first = fetchJson('https://example.org/a', { signal: controller.signal });
		const second = fetchJson('https://example.org/a');
		controller.abort();

		await expect(second).resolves.toEqual({ ok: 1 });
		await expect(first).resolves.toEqual({ ok: 1 });
		expect(spy.mock.calls[0][1]).toBeUndefined();
	});

	it('forwards the signal for uncached requests', async () => {
		const spy = stubJson({ ok: 1 });

		const controller = new AbortController();
		await fetchJson('https://example.org/a', { signal: controller.signal, cache: false });

		expect(spy.mock.calls[0][1]).toMatchObject({ signal: controller.signal });
	});
});
