import { describe, expect, it } from 'vitest';
import { pairVideosWithReplicates, videoIndex } from './replicate-videos';
import type { TarEntry } from '$lib/api/targz';

const entry = (name: string): TarEntry => ({ name, data: new Uint8Array(0) });

/** Android filenames: `vid0_fenix.mp4` … , numbered from zero. */
const androidArchive = (count: number) =>
	Array.from({ length: count }, (_, i) => entry(`newssite-applink-startup/vid${i}_fenix.mp4`));

/** Browsertime filenames: `1.mp4` … , numbered from one. */
const browsertimeArchive = (count: number, scenario = 'amazon-nav-load') =>
	Array.from({ length: count }, (_, i) =>
		entry(
			`browsertime-videos-annotated/nav-bench/pages/www_amazon_ca/${scenario}/data/video/${i + 1}.mp4`
		)
	);

describe('videoIndex', () => {
	it('reads the replicate number out of an Android filename', () => {
		expect(videoIndex('newssite-applink-startup/vid7_fenix.mp4')).toBe(7);
	});

	it('reads the replicate number out of a browsertime filename', () => {
		expect(videoIndex('nav-bench/pages/www_bbc_com/bbc-nav-load/data/video/10.mp4')).toBe(10);
	});

	it('ignores numbers in the directory part of the path', () => {
		expect(videoIndex('run-2026-08/vid3_fenix.mp4')).toBe(3);
	});

	it('returns null when the name carries no number', () => {
		expect(videoIndex('run/recording.mp4')).toBeNull();
	});
});

describe('pairVideosWithReplicates', () => {
	it('pairs each video with its replicate value', () => {
		const videos = pairVideosWithReplicates(androidArchive(3), [1643.5, 1713.7, 1588.4]);

		expect(videos.map((v) => [v.index, v.value])).toEqual([
			[0, 1643.5],
			[1, 1713.7],
			[2, 1588.4]
		]);
	});

	it('orders by the number in the filename, not lexicographically', () => {
		const replicates = Array.from({ length: 11 }, (_, i) => 1000 + i);

		const videos = pairVideosWithReplicates(androidArchive(11), replicates);

		expect(videos.map((v) => v.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

		expect(videos[1].name).toContain('vid1_');
		expect(videos[1].value).toBe(1001);
	});

	it('handles one-based browsertime numbering, including the tenth video', () => {
		const replicates = [198.0, 204.1, 209.1, 211.2, 215.3, 219.4, 222.5, 226.6, 230.7, 234.8];

		const videos = pairVideosWithReplicates(browsertimeArchive(10), replicates, { indexBase: 1 });

		expect(videos.map((v) => v.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
		// `2.mp4` is the second replicate; a string sort would put `10.mp4` here.
		expect(videos[1].name).toMatch(/\/2\.mp4$/);
		expect(videos[1].value).toBe(204.1);
		expect(videos[9].name).toMatch(/\/10\.mp4$/);
		expect(videos[9].value).toBe(234.8);
	});

	it('falls back to archive order when the names are not numbered', () => {
		const entries = [entry('run/second.mp4'), entry('run/first.mp4')];

		const videos = pairVideosWithReplicates(entries, [10, 20]);

		expect(videos.map((v) => [v.name, v.value])).toEqual([
			['run/second.mp4', 10],
			['run/first.mp4', 20]
		]);
	});

	it('ignores the screenshots and logs that share the archive', () => {
		const entries = [
			entry('newssite-applink-startup/iter_0_startup_done.png'),
			entry('newssite-applink-startup/vid0_fenix.mp4'),
			entry('newssite-applink-startup/server.log')
		];

		expect(pairVideosWithReplicates(entries, [1]).map((v) => v.name)).toEqual([
			'newssite-applink-startup/vid0_fenix.mp4'
		]);
	});

	it('keeps a video that has no replicate value rather than dropping it', () => {
		const videos = pairVideosWithReplicates(androidArchive(3), [1643.5]);

		expect(videos.map((v) => v.value)).toEqual([1643.5, null, null]);
	});

	it('labels webm recordings with the right media type', () => {
		const videos = pairVideosWithReplicates([entry('run/vid0.webm'), entry('run/vid1.mp4')], []);

		expect(videos.map((v) => v.mimeType)).toEqual(['video/webm', 'video/mp4']);
	});
});
