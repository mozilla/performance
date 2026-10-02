import { describe, expect, it } from 'vitest';
import { decompressGzip, untar } from './targz';

const BLOCK = 512;
const encoder = new TextEncoder();

interface HeaderOptions {
	name: string;
	size: number;
	typeFlag?: string;
	prefix?: string;
}

function header({ name, size, typeFlag = '0', prefix = '' }: HeaderOptions): Uint8Array {
	const block = new Uint8Array(BLOCK);
	const put = (text: string, offset: number) => block.set(encoder.encode(text), offset);

	put(name, 0);
	put('000644 ', 100); // mode
	put(size.toString(8).padStart(11, '0') + '\0', 124);
	put(typeFlag, 156);
	put('ustar\0', 257);
	put('00', 263);
	if (prefix) put(prefix, 345);

	// Checksum, computed with the field itself read as spaces. The reader does
	// not verify it, but a real archive has one and a future reader might.
	block.set(encoder.encode('        '), 148);
	const sum = block.reduce((total, byte) => total + byte, 0);
	put(sum.toString(8).padStart(6, '0') + '\0 ', 148);

	return block;
}

/** An entry: header block plus its data padded to a block boundary. */
function entry(options: HeaderOptions, data: Uint8Array | string = ''): Uint8Array[] {
	const bytes = typeof data === 'string' ? encoder.encode(data) : data;
	const padding = new Uint8Array((BLOCK - (bytes.length % BLOCK)) % BLOCK);
	return [header({ ...options, size: bytes.length }), bytes, padding];
}

function archive(...parts: Uint8Array[][]): Uint8Array {
	// Real archives end with two zero blocks.
	const blocks = [...parts.flat(), new Uint8Array(BLOCK), new Uint8Array(BLOCK)];
	const total = blocks.reduce((sum, block) => sum + block.length, 0);
	const out = new Uint8Array(total);
	let offset = 0;
	for (const block of blocks) {
		out.set(block, offset);
		offset += block.length;
	}
	return out;
}

/** A PAX record: "<total length> <key>=<value>\n", length counting itself. */
function paxRecord(key: string, value: string): string {
	const withoutLength = ` ${key}=${value}\n`.length;
	let length = withoutLength + 1;
	// The length digits are part of the length, so adding one can carry.
	while (String(length).length + withoutLength !== length) {
		length = String(length).length + withoutLength;
	}
	return `${length} ${key}=${value}\n`;
}

const text = (data: Uint8Array) => new TextDecoder().decode(data);

describe('untar', () => {
	it('reads a plain file entry', () => {
		const bytes = archive(entry({ name: 'notes.txt', size: 0 }, 'hello'));

		const entries = untar(bytes);

		expect(entries).toHaveLength(1);
		expect(entries[0].name).toBe('notes.txt');
		expect(text(entries[0].data)).toBe('hello');
	});

	it('reads several entries, including one spanning multiple blocks', () => {
		const long = 'x'.repeat(BLOCK + 7);
		const bytes = archive(
			entry({ name: 'a.txt', size: 0 }, 'a'),
			entry({ name: 'big.bin', size: 0 }, long),
			entry({ name: 'b.txt', size: 0 }, 'b')
		);

		const entries = untar(bytes);

		expect(entries.map((e) => e.name)).toEqual(['a.txt', 'big.bin', 'b.txt']);
		expect(text(entries[1].data)).toBe(long);
		expect(text(entries[2].data)).toBe('b');
	});

	it('skips directory entries', () => {
		const bytes = archive(
			entry({ name: 'run/', size: 0, typeFlag: '5' }),
			entry({ name: 'run/vid0.mp4', size: 0 }, 'video')
		);

		expect(untar(bytes).map((e) => e.name)).toEqual(['run/vid0.mp4']);
	});

	/**
	 * The case that makes a naive reader wrong. GNU tar writes a `././@PaxHeader`
	 * entry before *every* member to record a sub-second mtime, so a reader that
	 * ignores the type flag returns one bogus entry per real file -- and for the
	 * Android archives, half of what it returns would be named `././@PaxHeader`.
	 */
	it('does not emit PAX metadata entries as files', () => {
		const bytes = archive(
			entry({ name: '././@PaxHeader', size: 0, typeFlag: 'x' }, paxRecord('mtime', '1787296022.3')),
			entry({ name: 'run/vid0_fenix.mp4', size: 0 }, 'video')
		);

		const entries = untar(bytes);

		expect(entries).toHaveLength(1);
		expect(entries[0].name).toBe('run/vid0_fenix.mp4');
	});

	it('applies a PAX path override to the entry that follows it', () => {
		const long = `run/${'deep/'.repeat(30)}vid0.mp4`;
		const bytes = archive(
			entry({ name: '././@PaxHeader', size: 0, typeFlag: 'x' }, paxRecord('path', long)),
			// Truncated name in the header, as tar writes it when using PAX.
			entry({ name: long.slice(0, 100), size: 0 }, 'video')
		);

		expect(untar(bytes).map((e) => e.name)).toEqual([long]);
	});

	it('applies a GNU long-name header to the entry that follows it', () => {
		const long = `run/${'deep/'.repeat(30)}vid1.mp4`;
		const bytes = archive(
			entry({ name: '././@LongLink', size: 0, typeFlag: 'L' }, `${long}\0`),
			entry({ name: long.slice(0, 100), size: 0 }, 'video')
		);

		expect(untar(bytes).map((e) => e.name)).toEqual([long]);
	});

	it('joins the ustar prefix field onto the name', () => {
		const bytes = archive(
			entry({ name: 'vid0.mp4', size: 0, prefix: 'newssite-applink-startup' }, 'video')
		);

		expect(untar(bytes).map((e) => e.name)).toEqual(['newssite-applink-startup/vid0.mp4']);
	});

	it('stops at the end-of-archive blocks rather than reading past them', () => {
		const bytes = new Uint8Array(BLOCK * 8);
		bytes.set(archive(entry({ name: 'a.txt', size: 0 }, 'a')), 0);
		// Whatever follows the zero blocks is not an entry. (Some producers pad
		// the archive out to a fixed block factor with garbage.)
		bytes.set(encoder.encode('junk'), BLOCK * 5);

		expect(untar(bytes).map((e) => e.name)).toEqual(['a.txt']);
	});

	it('rejects data that is not a tar archive rather than returning nonsense', () => {
		const bytes = new Uint8Array(BLOCK * 2);
		bytes.set(encoder.encode('<!DOCTYPE html><html>error page</html>'), 0);

		expect(() => untar(bytes)).toThrow(/not a ustar header/);
	});

	it('reports unsupported base-256 sizes instead of mis-reading them', () => {
		const block = header({ name: 'huge.bin', size: 0 });
		block[124] = 0x80;

		expect(() => untar(archive([block]))).toThrow(/base-256/);
	});

	it('returns entries as views, not copies, of the archive buffer', () => {
		const bytes = archive(entry({ name: 'a.txt', size: 0 }, 'hello'));

		const [only] = untar(bytes);

		expect(only.data.buffer).toBe(bytes.buffer);
	});
});

describe('decompressGzip', () => {
	it('round-trips an archive through gzip', async () => {
		const bytes = archive(entry({ name: 'run/vid0.mp4', size: 0 }, 'video bytes'));

		const gzipped = new Response(
			new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'))
		);
		const inflated = await decompressGzip(gzipped.body!);

		expect(untar(inflated).map((e) => e.name)).toEqual(['run/vid0.mp4']);
	});
});
