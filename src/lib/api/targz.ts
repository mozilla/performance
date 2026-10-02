const BLOCK_SIZE = 512;

/** Offsets within a tar header block (POSIX ustar). */
const HEADER = {
	name: 0,
	size: 124,
	typeFlag: 156,
	magic: 257,
	prefix: 345
} as const;

export interface TarEntry {
	name: string;
	/** File contents, as a view onto the archive buffer rather than a copy. */
	data: Uint8Array;
}

const decoder = new TextDecoder();

function readString(block: Uint8Array, offset: number, length: number): string {
	const field = block.subarray(offset, offset + length);
	const end = field.indexOf(0);
	return decoder.decode(end === -1 ? field : field.subarray(0, end));
}

/**
 * A numeric header field. Tar stores these as NUL- or space-terminated octal.
 *
 * The GNU base-256 extension for sizes over 8 GiB is not handled: the archives
 * this reads are job artifacts of a few tens of megabytes, and silently
 * mis-reading a size is worse than not supporting it, so it throws.
 */
function readOctal(block: Uint8Array, offset: number, length: number): number {
	if (block[offset] & 0x80) {
		throw new Error('tar: base-256 numeric fields are not supported');
	}
	const text = readString(block, offset, length).trim();
	if (text === '') return 0;
	const value = parseInt(text, 8);
	if (!Number.isFinite(value)) throw new Error(`tar: bad numeric field "${text}"`);
	return value;
}

function isZeroBlock(block: Uint8Array): boolean {
	return block.every((byte) => byte === 0);
}

/** Round a length up to the next whole number of 512-byte blocks. */
function padded(size: number): number {
	return Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE;
}

/**
 * The `path` override from a PAX extended header, if it has one.
 *
 * PAX records are `"<length> <key>=<value>\n"`, where `<length>` counts the
 * whole record including itself. GNU tar emits one of these before *every*
 * entry to carry a sub-second mtime, so this path is hit constantly rather
 * than only for long filenames -- an unpacker that treats the `././@PaxHeader`
 * entry as a real file (as a naive one does) returns an archive that is half
 * bogus entries.
 */
function paxPath(data: Uint8Array): string | undefined {
	const text = decoder.decode(data);
	let cursor = 0;

	while (cursor < text.length) {
		const space = text.indexOf(' ', cursor);
		if (space === -1) break;

		const length = Number(text.slice(cursor, space));
		if (!Number.isFinite(length) || length <= 0) break;

		const record = text.slice(space + 1, cursor + length).replace(/\n$/, '');
		const equals = record.indexOf('=');
		if (equals !== -1 && record.slice(0, equals) === 'path') {
			return record.slice(equals + 1);
		}

		cursor += length;
	}

	return undefined;
}

/**
 * The regular files in a tar archive, in archive order.
 *
 * Directories, symlinks and metadata entries are skipped; the extended headers
 * that carry a long filename (PAX `path`, GNU `L`) are applied to the entry
 * that follows them.
 */
export function untar(archive: ArrayBuffer | Uint8Array): TarEntry[] {
	const bytes = archive instanceof Uint8Array ? archive : new Uint8Array(archive);
	const entries: TarEntry[] = [];

	// Set by an extended header, consumed by the next real entry.
	let pendingName: string | undefined;
	let offset = 0;

	while (offset + BLOCK_SIZE <= bytes.length) {
		const header = bytes.subarray(offset, offset + BLOCK_SIZE);
		// Two zero blocks mark the end, but one is enough to stop on: nothing
		// valid follows, and some writers pad with more than two.
		if (isZeroBlock(header)) break;

		const magic = readString(header, HEADER.magic, 5);
		if (magic !== 'ustar') {
			throw new Error(`tar: not a ustar header at offset ${offset}`);
		}

		const size = readOctal(header, HEADER.size, 12);
		const typeFlag = String.fromCharCode(header[HEADER.typeFlag] || 0x30);
		const dataStart = offset + BLOCK_SIZE;
		const data = bytes.subarray(dataStart, dataStart + size);
		offset = dataStart + padded(size);

		// 'x' is a PAX record for the next entry, 'g' one for the whole archive;
		// 'L' is GNU tar's older long-name form, whose data is the raw name.
		if (typeFlag === 'x' || typeFlag === 'g') {
			pendingName = paxPath(data) ?? pendingName;
			continue;
		}
		if (typeFlag === 'L') {
			pendingName = decoder.decode(data).replace(/\0+$/, '');
			continue;
		}

		// '0' is a regular file and '\0' is the pre-POSIX spelling of the same.
		const isFile = typeFlag === '0' || typeFlag === '\0';
		const name = pendingName ?? joinName(header);
		pendingName = undefined;

		if (isFile) entries.push({ name, data });
	}

	return entries;
}

function joinName(header: Uint8Array): string {
	const prefix = readString(header, HEADER.prefix, 155);
	const name = readString(header, HEADER.name, 100);
	return prefix ? `${prefix}/${name}` : name;
}

/** Inflate a gzip stream. Throws if the body is not gzip. */
export async function decompressGzip(
	body: ReadableStream<Uint8Array<ArrayBuffer>>
): Promise<ArrayBuffer> {
	const inflated = body.pipeThrough(new DecompressionStream('gzip'));
	return new Response(inflated).arrayBuffer();
}

/** Fetch a `.tar.gz` and return its regular files. */
export async function fetchTarGz(url: string, signal?: AbortSignal): Promise<TarEntry[]> {
	const response = await fetch(url, { signal });
	if (!response.ok || !response.body) {
		throw new Error(`${response.status} ${response.statusText} for ${url}`);
	}
	return untar(await decompressGzip(response.body));
}
