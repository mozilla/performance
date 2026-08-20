export interface Resource<T> {
	readonly value: T | undefined;
	readonly error: unknown;
	readonly loading: boolean;
}

/**
 * Run an async loader when its synchronous reactive dependencies change.
 * Read individual $derived fields before awaiting, rather than the entire
 * parsed URL state, to avoid reloading when unrelated controls change.
 * Each rerun aborts the previous signal and discards its late results.
 * The last value remains available while loading or after a failed request.
 */
export function resource<T>(fn: (signal: AbortSignal) => Promise<T>): Resource<T> {
	let value = $state.raw<T | undefined>(undefined);
	let error = $state.raw<unknown>(undefined);
	let loading = $state(true);

	$effect(() => {
		const controller = new AbortController();
		const { signal } = controller;
		loading = true;

		fn(signal).then(
			(result) => {
				if (signal.aborted) return;
				value = result;
				error = undefined;
				loading = false;
			},
			(cause) => {
				if (signal.aborted) return;
				error = cause;
				loading = false;
			}
		);

		return () => controller.abort();
	});

	return {
		get value() {
			return value;
		},
		get error() {
			return error;
		},
		get loading() {
			return loading;
		}
	};
}
