export interface Limiter {
	<T>(task: () => Promise<T>): Promise<T>;
	/** Tasks currently running. Exposed for tests. */
	readonly active: number;
	/** Tasks waiting for a slot. Exposed for tests. */
	readonly pending: number;
}

export function createLimiter(concurrency: number): Limiter {
	if (concurrency < 1) throw new RangeError('concurrency must be at least 1');

	const queue: Array<() => void> = [];
	let active = 0;

	const next = () => {
		if (active >= concurrency) return;
		const start = queue.shift();
		if (!start) return;
		active++;
		start();
	};

	const release = () => {
		active--;
		next();
	};

	const limit = <T>(task: () => Promise<T>): Promise<T> =>
		new Promise<T>((resolve, reject) => {
			queue.push(() => {
				// The slot is released *before* the caller's promise settles, not
				// in a .finally() after it. Otherwise a caller awaiting its own
				// task observes the limiter still holding the slot, and the next
				// queued task has not started -- which is exactly the batching
				// behaviour this is meant to avoid.
				//
				// The async wrapper means a synchronous throw in `task` is turned
				// into a rejection and still releases the slot.
				(async () => task())().then(
					(value) => {
						release();
						resolve(value);
					},
					(error) => {
						release();
						reject(error);
					}
				);
			});
			next();
		});

	Object.defineProperties(limit, {
		active: { get: () => active },
		pending: { get: () => queue.length }
	});

	return limit as Limiter;
}
