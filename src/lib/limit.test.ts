import { describe, expect, it } from 'vitest';
import { createLimiter } from './limit';

/** A promise plus the ability to settle it from the test. */
function deferred<T = void>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

describe('createLimiter', () => {
	it('rejects a concurrency below one', () => {
		expect(() => createLimiter(0)).toThrow(RangeError);
	});

	it('resolves with the task result', async () => {
		const limit = createLimiter(2);
		await expect(limit(async () => 42)).resolves.toBe(42);
	});

	it('runs at most `concurrency` tasks at once', async () => {
		const limit = createLimiter(2);
		const gates = [deferred(), deferred(), deferred()];

		const runs = gates.map((gate) => limit(() => gate.promise));
		await Promise.resolve();

		expect(limit.active).toBe(2);
		expect(limit.pending).toBe(1);

		gates[0].resolve();
		await runs[0];

		expect(limit.active).toBe(2);
		expect(limit.pending).toBe(0);

		gates[1].resolve();
		gates[2].resolve();
		await Promise.all(runs);

		expect(limit.active).toBe(0);
	});

	it('starts a queued task as soon as a slot frees, not in batches', async () => {
		const limit = createLimiter(1);
		const started: number[] = [];
		const gates = [deferred(), deferred()];

		const runs = gates.map((gate, i) =>
			limit(() => {
				started.push(i);
				return gate.promise;
			})
		);

		await Promise.resolve();
		expect(started).toEqual([0]);

		gates[0].resolve();
		await runs[0];
		expect(started).toEqual([0, 1]);

		gates[1].resolve();
		await Promise.all(runs);
	});

	it('releases the slot when a task rejects', async () => {
		const limit = createLimiter(1);

		await expect(limit(async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
		expect(limit.active).toBe(0);
		await expect(limit(async () => 'ok')).resolves.toBe('ok');
	});

	it('releases the slot when a task throws synchronously', async () => {
		const limit = createLimiter(1);

		await expect(
			limit(() => {
				throw new Error('sync boom');
			})
		).rejects.toThrow('sync boom');
		expect(limit.active).toBe(0);
		await expect(limit(async () => 'ok')).resolves.toBe('ok');
	});

	it('runs every queued task', async () => {
		const limit = createLimiter(3);
		const results = await Promise.all(Array.from({ length: 20 }, (_, i) => limit(async () => i)));

		expect(results).toEqual(Array.from({ length: 20 }, (_, i) => i));
		expect(limit.active).toBe(0);
	});
});
