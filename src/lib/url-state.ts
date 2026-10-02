/**
 * Typed URL state. Controls read query parameters and apply patches that keep
 * unrelated fields and the hash intact. Default values are omitted from URLs.
 */
export interface Field<T> {
	/** Value used when the parameter is absent or unparseable. */
	default: T;
	parse(raw: string | null): T;
	/** Return null to omit the parameter entirely (used for default values). */
	serialize(value: T): string | null;
}

/**
 * `Field<any>` rather than `Field<unknown>`: `Field` is invariant in `T`
 * (`parse` returns it, `serialize` accepts it), so a `Field<string>` is not
 * assignable to a `Field<unknown>`. `any` is what makes a heterogeneous schema
 * expressible; the per-field types are recovered by `StateOf`.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export type Schema = Record<string, Field<any>>;

export type StateOf<S extends Schema> = {
	[K in keyof S]: S[K] extends Field<infer T> ? T : never;
};

/**
 * A string parameter.
 *
 * Two overloads so that an unconstrained field widens to `string` -- otherwise
 * `str('score')` would infer `Field<'score'>` and reject every other subtest --
 * while a field with an allowed list keeps the union, so a typo in a patch is
 * a compile error.
 */
export function str(defaultValue: string): Field<string>;
export function str<T extends string>(defaultValue: T, allowed: readonly T[]): Field<T>;
export function str(defaultValue: string, allowed?: readonly string[]): Field<string> {
	return {
		default: defaultValue,
		parse: (raw) => {
			if (raw === null) return defaultValue;
			if (allowed && !allowed.includes(raw)) return defaultValue;
			return raw;
		},
		serialize: (value) => (value === defaultValue ? null : value)
	};
}

/** A boolean flag, present as `?flag=1` when true (or false, if default is true). */
export function bool(defaultValue = false): Field<boolean> {
	return {
		default: defaultValue,
		parse: (raw) => {
			if (raw === null) return defaultValue;
			return raw === '1' || raw === 'true';
		},
		serialize: (value) => (value === defaultValue ? null : value ? '1' : '0')
	};
}

/** A number, falling back to the default when absent or not finite. */
export function num(defaultValue: number, allowed?: readonly number[]): Field<number> {
	return {
		default: defaultValue,
		parse: (raw) => {
			if (raw === null) return defaultValue;
			const parsed = Number(raw);
			if (!Number.isFinite(parsed)) return defaultValue;
			if (allowed && !allowed.includes(parsed)) return defaultValue;
			return parsed;
		},
		serialize: (value) => (value === defaultValue ? null : String(value))
	};
}

/**
 * A set of strings serialised as a comma-separated list, e.g. the hidden chart
 * series. Order is normalised so that two equivalent states produce the same
 * URL.
 */
export function stringSet(defaultValue: readonly string[] = []): Field<ReadonlySet<string>> {
	const defaults = new Set(defaultValue);
	const canonical = (set: ReadonlySet<string>) => [...set].sort().join(',');
	return {
		default: defaults,
		parse: (raw) => {
			if (raw === null) return defaults;
			const parts = raw
				.split(',')
				.map((s) => decodeURIComponent(s.trim()))
				.filter(Boolean);
			return new Set(parts);
		},
		serialize: (value) =>
			canonical(value) === canonical(defaults)
				? null
				: [...value].sort().map(encodeURIComponent).join(',')
	};
}

/** Read the full state for `schema` out of a URL's query string. */
export function parseState<S extends Schema>(schema: S, url: URL): StateOf<S> {
	const out = {} as Record<string, unknown>;
	for (const [key, field] of Object.entries(schema)) {
		out[key] = field.parse(url.searchParams.get(key));
	}
	return out as StateOf<S>;
}

/**
 * Produce the URL for `current` with `patch` applied. Unmentioned keys keep
 * their current value; keys whose value equals the schema default are removed
 * from the query string entirely.
 *
 * Returns a path + query string suitable for both `<a href>` and `goto()`.
 */
export function patchUrl<S extends Schema>(
	schema: S,
	url: URL,
	patch: Partial<StateOf<S>>
): string {
	const next = { ...parseState(schema, url), ...patch };
	const target = new URL(url.href);

	for (const [key, field] of Object.entries(schema)) {
		const serialized = field.serialize(next[key as keyof StateOf<S>]);
		if (serialized === null) {
			target.searchParams.delete(key);
		} else {
			target.searchParams.set(key, serialized);
		}
	}

	// Keep params the schema does not know about (e.g. analytics tags) rather
	// than dropping them, but sort for a stable, diffable URL.
	target.searchParams.sort();
	return `${target.pathname}${target.search}${target.hash}`;
}
