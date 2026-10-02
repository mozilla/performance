/**
 * Pairing a job's screen recordings with its replicate values.
 *
 * Shared by Android and Navigation Benchmark. The two pages get their archives
 * from differently-named artifacts and group them differently -- Android has one
 * recording per replicate, NavBench has one per replicate per site/scenario --
 * but the pairing rule and the failure modes are the same.
 */
import type { TarEntry } from '$lib/api/targz';

const VIDEO_EXTENSIONS = ['.mp4', '.webm'];

export interface ReplicateVideo {
	/** Replicate number, zero-based after `indexBase` is applied. */
	index: number;
	/** Path within the archive, shown when a video has no replicate value. */
	name: string;
	/** The measured value for this replicate, or null if the job recorded none. */
	value: number | null;
	data: Uint8Array;
	mimeType: string;
}

/** A set of recordings the user picks between, e.g. one site+scenario. */
export interface VideoGroup {
	key: string;
	label: string;
	videos: ReplicateVideo[];
}

export function isVideo(entry: TarEntry): boolean {
	return VIDEO_EXTENSIONS.some((extension) => entry.name.toLowerCase().endsWith(extension));
}

function mimeType(name: string): string {
	return name.toLowerCase().endsWith('.webm') ? 'video/webm' : 'video/mp4';
}

/**
 * The replicate number in a video's filename: 7 from `vid7_fenix.mp4`, 3 from
 * browsertime's `3.mp4`.
 *
 * Returns null when the name carries no number, which is the signal to fall
 * back to archive order.
 */
export function videoIndex(name: string): number | null {
	// Extension first: `.mp4` and `.webm` both end in a digit, so searching the
	// whole filename finds 4 in `recording.mp4`.
	const file = name.slice(name.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');
	const match = /(\d+)/.exec(file);
	return match ? Number(match[1]) : null;
}

export interface PairingOptions {
	/**
	 * What the first replicate is numbered in this producer's filenames.
	 * Android's mozperftest harness writes `vid0_fenix.mp4`; browsertime writes
	 * `1.mp4`. Explicit rather than inferred from the lowest number present,
	 * because an archive missing its first recording would then shift every
	 * remaining one by a replicate.
	 */
	indexBase?: number;
}

export function pairVideosWithReplicates(
	entries: readonly TarEntry[],
	replicates: readonly number[],
	options: PairingOptions = {}
): ReplicateVideo[] {
	const indexBase = options.indexBase ?? 0;

	const videos = entries.filter(isVideo);
	const indices = videos.map((entry) => videoIndex(entry.name));
	const numbered = indices.every((index) => index !== null);

	const ordered = numbered
		? videos
				.map((entry, position) => ({ entry, index: indices[position]! - indexBase }))
				.sort((a, b) => a.index - b.index)
		: videos.map((entry, position) => ({ entry, index: position }));

	return ordered.map(({ entry, index }) => ({
		index,
		name: entry.name,
		value: replicates[index] ?? null,
		data: entry.data,
		mimeType: mimeType(entry.name)
	}));
}

export class NoVideoError extends Error {}
