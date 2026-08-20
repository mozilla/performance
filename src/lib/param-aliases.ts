/** Normalize query aliases while preserving unrelated parameters. */
export interface ParamAliases {
	/** Alias -> canonical parameter name. */
	rename?: Readonly<Record<string, string>>;
	/** Unsupported parameters to remove. */
	drop?: readonly string[];
}

/**
 * Canonical names take precedence when both spellings are present.
 * Returns the input URL unchanged when no normalization is needed; otherwise
 * returns a copy with aliases and unsupported parameters removed.
 */
export function normalizeParams(url: URL, { rename, drop }: ParamAliases): URL {
	const renames = Object.entries(rename ?? {}).filter(
		([from, to]) => url.searchParams.has(from) && !url.searchParams.has(to)
	);
	const drops = (drop ?? []).filter((key) => url.searchParams.has(key));
	const stale = Object.keys(rename ?? {}).filter((from) => url.searchParams.has(from));

	if (renames.length === 0 && drops.length === 0 && stale.length === 0) return url;

	const normalized = new URL(url.href);
	for (const [from, to] of renames) {
		normalized.searchParams.set(to, url.searchParams.get(from)!);
	}
	// After the copy, not during it: an alias whose canonical name was already
	// present is still stale and still has to go.
	for (const key of [...stale, ...drops]) {
		normalized.searchParams.delete(key);
	}
	return normalized;
}
