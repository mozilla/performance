/**
 * Deterministic stand-ins for every upstream the dashboard talks to.
 *
 * Everything here is generated from the app's own configuration rather than
 * captured, so a chart config gaining a series or a query id does not silently
 * leave a fixture behind -- and generated from a fixed clock, so the same run
 * produces the same pixels a year from now.
 *
 * The important part is `unmatched`: any request to an origin the app does not
 * serve itself, that no route below claims, is recorded and failed. A test that
 * asserts it is empty is asserting the page made no request this file does not
 * know about, which is what makes "no console errors" mean something.
 */
import { expect, test as base, type Page, type Route } from '@playwright/test';
import { MOZPERFTEST_FRAMEWORK, TESTS as ANDROID_TESTS } from '../src/lib/android/config';
import { FRAMEWORK } from '../src/lib/api/treeherder';
import { OTHER_ENGINE } from '../src/lib/ml/engine';
import { CHARTS as NETWORKING_CHARTS } from '../src/lib/networking/config';
import {
	CHANNEL_URLS,
	PROCESSES as MEMORY_PROCESSES,
	SECTIONS as MEMORY_SECTIONS
} from '../src/lib/memory/config';

/** Fixed clock. Every generated date is relative to this. */
export const NOW = Date.UTC(2026, 7, 21, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

/** Deterministic pseudo-random in [0, 1), so charts look like data. */
function noise(seed: number): number {
	let x = (seed * 2654435761) | 0;
	x ^= x << 13;
	x ^= x >>> 17;
	x ^= x << 5;
	return ((x >>> 0) % 100_000) / 100_000;
}

// --- Treeherder -----------------------------------------------------------

interface SignatureSpec {
	id: number;
	suite: string;
	test?: string;
	application: string;
	extra_options?: string[];
	measurement_unit?: string;
	lower_is_better?: boolean;
}

/**
 * Suites upstream publishes for Firefox only -- there is no Chrome
 * counterpart. The one piece of the Android catalogue that is not derivable
 * from the app's own config, because the app does not know it.
 */
const FENIX_ONLY = new Set(['applink-startup-navigation-start']);

/** Speedometer metrics the Android page charts besides the overall score. */
const ANDROID_SPEEDOMETER_METRICS = ANDROID_TESTS.filter(
	(test) => test.suite === 'speedometer3' && test.test !== 'score'
).map((test) => test.test);

/**
 * The signature catalogue, by framework. Matches the real suites and test names
 * on each platform, because the app selects by exactly those.
 */
function signaturesFor(framework: number, platform: string): SignatureSpec[] {
	const android = platform.startsWith('android');
	let id = 1000;
	const next = () => ++id;

	if (framework === FRAMEWORK.browsertime) {
		const browsers = android
			? ['fenix', 'chrome-m', 'cstm-car-m']
			: ['firefox', 'chrome', 'custom-car', 'safari', 'safari-tp'];

		const out: SignatureSpec[] = [];
		for (const application of browsers) {
			// Speedometer: the overall score plus two subtests, enough for the
			// breakdown table to have rows without generating twenty series.
			for (const test of ['score', 'TodoMVC-Vue/total', 'Editor-TipTap/total']) {
				out.push({ id: next(), suite: 'speedometer3', test, application });

				out.push({
					id: next(),
					suite: 'speedometer3',
					test,
					application,
					extra_options: ['gecko-profile']
				});
			}
			if (android) {
				// The extra Speedometer metrics the Android page charts, taken from
				// its catalogue so a metric added there gets a signature here.
				for (const test of ANDROID_SPEEDOMETER_METRICS) {
					out.push({ id: next(), suite: 'speedometer3', test, application });
				}
			}
			if (!android) {
				out.push({ id: next(), suite: 'jetstream3', test: 'score', application });
			}
			// Speedometer Experimental: the unnamed overall, a workload and a power
			// figure, so the page has a score, a time and a third unit to show.
			// Safari does not run it.
			if (!android && !application.startsWith('safari')) {
				const suite = 'speedometer-experimental';
				out.push(
					{ id: next(), suite, application, measurement_unit: 'score', lower_is_better: false },
					{ id: next(), suite, test: 'ChatRoom-React/total', application, measurement_unit: 'ms' },
					{ id: next(), suite, test: 'powerUsage_gpu', application, measurement_unit: 'uWh' }
				);
			}
		}

		// Nav Bench: Firefox only, autoland only, one overall plus two sites.
		if (!android) {
			out.push({ id: next(), suite: 'nav-bench-overall', application: 'firefox' });
			for (const test of ['amazon-nav-load-score', 'bbc-nav-subnav-score']) {
				out.push({ id: next(), suite: 'nav-bench-overall', test, application: 'firefox' });
			}
		}

		return out;
	}

	// The Android startup tests, one signature per (catalogue entry, browser).
	// Read off the catalogue rather than retyped, so a test added to the page
	// has data here instead of quietly charting nothing.
	if (framework === MOZPERFTEST_FRAMEWORK && android) {
		const out: SignatureSpec[] = [];
		for (const { suite, test, framework: testFramework } of ANDROID_TESTS) {
			if (testFramework !== MOZPERFTEST_FRAMEWORK) continue;
			const applications = FENIX_ONLY.has(suite) ? ['fenix'] : ['fenix', 'chrome-m'];
			for (const application of applications) {
				out.push({ id: next(), suite, test, application });
			}
		}
		return out;
	}

	return [];
}

function signatureResponse(framework: number, platform: string) {
	const body: Record<string, unknown> = {};
	for (const spec of signaturesFor(framework, platform)) {
		// Ids must be unique per (framework, platform) pair, since the app pools
		// signatures across platforms and keys measurements by id.
		const id = spec.id + framework * 100_000 + platform.length * 1_000;
		body[`hash${id}`] = {
			id,
			framework_id: framework,
			signature_hash: `hash${id}`,
			machine_platform: platform,
			suite: spec.suite,
			test: spec.test,
			application: spec.application,
			extra_options: spec.extra_options ?? [],
			measurement_unit: spec.measurement_unit,
			lower_is_better: spec.lower_is_better,
			repository: undefined
		};
	}
	return body;
}

/**
 * How many distinct machines a range's worth of data came from.
 *
 * Deliberately different per range. Job Debug's legend is one chip per machine
 * and wraps, so this is what makes its height change when the range changes --
 * which is the condition the layout regression test needs to exist before it
 * can assert that the chart below it stays put. Without it that test would pass
 * for the wrong reason.
 */
function machineCount(days: number): number {
	if (days >= 365) return 26;
	if (days >= 90) return 12;
	return 4;
}

/** One series: daily points with a mild upward trend. */
function seriesResponse(signatureId: number, days: number) {
	const count = Math.min(days, 120);
	const machines = machineCount(days);

	const data = Array.from({ length: count }, (_, i) => {
		const at = NOW - (count - 1 - i) * DAY;
		return {
			job_id: 500_000_000 + signatureId * 100 + i,
			id: signatureId * 1000 + i,
			value: 100 + (signatureId % 40) + noise(signatureId + i) * 8 + i * 0.05,
			push_timestamp: new Date(at).toISOString().replace('Z', ''),
			push_id: 2_000_000 + i,
			revision: `${signatureId}`.padStart(6, '0') + `${i}`.padStart(34, 'a'),
			machine_name: `stub-worker-${String(i % machines).padStart(3, '0')}`
		};
	});

	return [{ signature_id: signatureId, framework_id: 13, suite: 'stub', data }];
}

// --- Redash ---------------------------------------------------------------

const csv = (rows: string[][]) =>
	rows
		.map((row) => row.map((cell) => (/[",\n]/.test(cell) ? `"${cell}"` : cell)).join(','))
		.join('\n');

const isoDay = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString().slice(0, 10);

/**
 * A CSV for one networking chart, generated from that chart's own config so the
 * column the chart reads is the column the fixture provides.
 */
function networkingCsv(queryId: string): string {
	const config = Object.values(NETWORKING_CHARTS).find((chart) => chart.url.includes(queryId));
	if (!config) return csv([['date', 'value']]);

	const days = 20;
	const categories = config.seriesOrder?.length ? config.seriesOrder : ['a', 'b'];

	if (config.format === 'long' || config.valueColumn) {
		const valueColumn = config.valueColumn ?? 'value';
		const labelColumn = config.labelColumn ?? 'category';
		const rows = [['date', labelColumn, valueColumn]];
		for (let d = days; d > 0; d--) {
			categories.forEach((category, index) => {
				rows.push([isoDay(d), category, (20 + index * 15 + noise(d + index) * 5).toFixed(2)]);
			});
		}
		return csv(rows);
	}

	const rows = [['date', ...categories]];
	for (let d = days; d > 0; d--) {
		rows.push([
			isoDay(d),
			...categories.map((_, index) => (20 + index * 15 + noise(d + index) * 5).toFixed(2))
		]);
	}
	return csv(rows);
}

/**
 * The memory CSV: date, process, version, then every probe's p75/p95 column.
 *
 * Columns come from the app's own probe list, so a probe added to SECTIONS is
 * covered without editing this. Process names come from PROCESSES for the same
 * reason -- and because a chart with no rows for the selected process renders
 * an empty state rather than a canvas, which is exactly the failure a fixture
 * with plausible-looking but wrong process names would produce.
 */
function memoryCsv(): string {
	const columns = MEMORY_SECTIONS.flatMap((section) =>
		section.probes.flatMap((probe) => [probe.p75, probe.p95])
	);
	const rows = [['date', 'process', 'version', ...columns]];

	for (const process of MEMORY_PROCESSES) {
		for (let d = 20; d > 0; d--) {
			const values = columns.map((_, index) =>
				(100 + index * 5 + noise(d + index) * 10).toFixed(1)
			);
			// Two rows per day, as the release CSV has: one with no version, which
			// parseMemoryRows pools under ALL and which the default display mode
			// reads, and one attributed to a major version for the version mode.
			// Emitting only the versioned rows leaves the default view empty --
			// which is what the page correctly showed when this fixture did.
			rows.push([isoDay(d), process, '', ...values]);
			rows.push([isoDay(d), process, d > 10 ? '141' : '142', ...values]);
		}
	}

	return csv(rows);
}

// --- Static JSON ----------------------------------------------------------

function bugzillaData() {
	const bug = (id: number, component: string, severity: string, op_sys: string | null) => ({
		id,
		summary: `Stub bug ${id}, with a comma and <b>markup</b>`,
		component,
		severity,
		priority: 'P2',
		status: 'NEW',
		op_sys,
		keywords: ['perf'],
		creation_time: new Date(NOW - id * DAY).toISOString(),
		last_change_time: new Date(NOW - id * DAY).toISOString()
	});

	const group = (start: number, severity: string) => ({
		bugs: [
			bug(start, 'DOM: Copy & Paste and Drag & Drop', severity, 'Windows'),
			bug(start + 1, 'Graphics', severity, 'macOS'),
			bug(start + 2, 'Networking', severity, null)
		]
	});

	return {
		high: group(100, 'S2'),
		medium: group(200, 'S3'),
		low: group(300, 'S4'),
		untriaged: group(400, '--'),
		needinfo: group(500, 'S3'),
		regressions: group(600, 'S2'),
		triageGeneral: group(700, 'S3'),
		triageMemory: group(800, 'S3'),
		triageNavigation: group(900, 'S3'),
		triageResponsiveness: group(1000, 'S3'),
		triageStartup: group(1100, 'S3')
	};
}

/**
 * The ML dataset, in its *raw* shape.
 *
 * Deliberately pre-normalisation: the suite is `browser_ml_smart_tab_perf.js`
 * and the tests carry their `SMART-TAB-EMBEDDING-` prefixes, so the fixture
 * exercises `normalizeRows` rather than bypassing it. A fixture that emitted
 * the post-rename names would pass even if the renaming broke.
 */
function mlData() {
	const rows = [];
	const tests = [
		'SMART-TAB-EMBEDDING-cold-start-initialization-latency',
		'SMART-TAB-EMBEDDING-model-run-latency',
		'SMART-TAB-EMBEDDING-peak-memory-usage',
		'SMART-TAB-TOPIC-cold-start-initialization-latency',
		'SMART-TAB-TOPIC-model-run-latency',
		'SMART-TAB-TOPIC-peak-memory-usage'
	];

	for (const test of tests) {
		for (const platform of ['windows11-64-24h2-hw-ref-shippable', 'windows11-64-24h2-shippable']) {
			for (let d = 20; d > 0; d--) {
				rows.push({
					date: isoDay(d),
					test,
					suite: 'browser_ml_smart_tab_perf.js',
					platform,
					repository: 'mozilla-central',
					value: 200 + noise(d + test.length) * 40
				});
			}
		}
	}

	return { query_result: { data: { rows } } };
}

/**
 * The engine telemetry dataset, in its published shape.
 *
 * The shape is the point here rather than the values, so every case the real
 * file contains is represented: a null `engine_id`, the `__other__` overflow
 * bucket, an engine whose successes and failures both exist, one with no
 * failures at all, and a day whose percentiles are null because nothing
 * succeeded. Latencies keep the real ratio between engine creation and
 * inference -- hundreds of ms against fractions of one -- because that ratio is
 * what the log axis exists for, and a fixture with both series in the same
 * decade would pass whatever the axis did.
 */
function mlEngineData() {
	const rows = [];
	const engines = [OTHER_ENGINE, 'pdfjs', 'smart-tab-topic-engine', 'webextension', null];

	for (const engineId of engines) {
		for (let d = 7; d > 0; d--) {
			// The real file's null-id rows are failure events with no engineId
			// extra, so they carry counts and nothing else.
			const unattributed = engineId === null;
			const creation = 300 + noise(d + (engineId?.length ?? 0)) * 900;

			rows.push({
				date: isoDay(d),
				engine_id: engineId,
				engine_creation_p5: unattributed ? null : creation * 0.4,
				engine_creation_p50: unattributed ? null : creation,
				engine_creation_p75: unattributed ? null : creation * 1.3,
				engine_creation_p99: unattributed ? null : creation * 4,
				inference_p5: unattributed ? null : 0.5,
				inference_p50: unattributed ? null : 0.9 + noise(d) * 80,
				inference_p75: unattributed ? null : 120,
				inference_p99: unattributed ? null : 400,
				engine_creation_success_count: unattributed ? null : Math.round(2000 + noise(d) * 800),
				inference_success_count: unattributed ? null : Math.round(2500 + noise(d) * 900),
				// `pdfjs` never fails, which is what makes a null on the failure
				// side of the upstream FULL JOIN reachable from the fixture.
				engine_creation_failure_count: engineId === 'pdfjs' ? null : Math.round(noise(d) * 900),
				inference_failure_count:
					engineId === 'pdfjs' ? null : Math.round(noise(d + 1) * (unattributed ? 6000 : 40))
			});
		}
	}

	return { query_result: { data: { rows } } };
}

// --- Taskcluster ----------------------------------------------------------

/**
 * A tar.gz built in-process, so the artifact path is exercised end to end --
 * gzip, the tar reader, the video pairing and the blob URL -- without a 25MB
 * download or a binary blob checked into the repository.
 */
async function buildArchive(paths: string[]): Promise<Buffer> {
	const BLOCK = 512;
	const encoder = new TextEncoder();
	const blocks: Uint8Array[] = [];

	for (const path of paths) {
		// A tiny but real payload; the test only checks it reaches the <video>.
		const data = encoder.encode(`stub video ${path}`);

		const header = new Uint8Array(BLOCK);
		const put = (text: string, offset: number) => header.set(encoder.encode(text), offset);
		put(path.slice(0, 100), 0);
		put('000644 ', 100);
		put(data.length.toString(8).padStart(11, '0') + '\0', 124);
		put('0', 156);
		put('ustar\0', 257);
		put('00', 263);
		put('        ', 148);
		const sum = header.reduce((total, byte) => total + byte, 0);
		put(sum.toString(8).padStart(6, '0') + '\0 ', 148);

		blocks.push(header, data, new Uint8Array((BLOCK - (data.length % BLOCK)) % BLOCK));
	}

	blocks.push(new Uint8Array(BLOCK), new Uint8Array(BLOCK));

	const total = blocks.reduce((sum, block) => sum + block.length, 0);
	const tar = new Uint8Array(total);
	let offset = 0;
	for (const block of blocks) {
		tar.set(block, offset);
		offset += block.length;
	}

	const gzipped = new Response(
		new Blob([tar as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'))
	);
	return Buffer.from(await gzipped.arrayBuffer());
}

/** Ten replicate values, matching the ten recordings in each stub archive. */
const REPLICATES = Array.from({ length: 10 }, (_, i) => 1500 + i * 12.5);

/** Task ids, one per harness; see the jobs route for why they differ. */
const MOZPERFTEST_TASK = 'StubMozperftestTaskAA';
const BROWSERTIME_TASK = 'StubBrowsertimeTaskBB';

/** The Android suites that publish a recording archive, per the catalogue. */
const ANDROID_SUITES = ANDROID_TESTS.filter((test) => test.hasVideo).map((test) => test.suite);

const ANDROID_VIDEOS = (suite: string) =>
	Array.from({ length: 10 }, (_, i) => `${suite}/vid${i}_fenix.mp4`);

const NAVBENCH_VIDEOS = ['amazon-nav-load', 'bbc-nav-subnav'].flatMap((scenario) =>
	Array.from(
		{ length: 10 },
		(_, i) =>
			`browsertime-videos-annotated/nav-bench/pages/site/${scenario}/data/video/${i + 1}.mp4`
	)
);

// --- Wiring ---------------------------------------------------------------

export interface Stubs {
	/** Requests to an external origin that no route below claimed. */
	readonly unmatched: string[];
	/** Console errors and page errors seen since the page opened. */
	readonly consoleErrors: string[];
}

const json = (route: Route, body: unknown) =>
	route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });

const text = (route: Route, body: string, contentType = 'text/csv') =>
	route.fulfill({ contentType, body });

export async function stubApis(page: Page): Promise<Stubs> {
	const unmatched: string[] = [];
	const consoleErrors: string[] = [];

	page.on('console', (message) => {
		if (message.type() === 'error') consoleErrors.push(message.text());
	});
	page.on('pageerror', (error) => consoleErrors.push(String(error)));

	// Registered first, and therefore lowest priority: Playwright matches routes
	// in reverse registration order, so everything below overrides this. Any
	// external request none of them claims is recorded and failed rather than
	// allowed through, so a new upstream shows up as a test failure instead of a
	// live dependency that makes the suite flaky.
	await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => {
		unmatched.push(route.request().url());
		return route.abort('blockedbyclient');
	});

	// Treeherder signatures.
	await page.route(
		/treeherder\.mozilla\.org\/api\/project\/[^/]+\/performance\/signatures/,
		(route) => {
			const url = new URL(route.request().url());
			const framework = Number(url.searchParams.get('framework'));
			const platform = url.searchParams.get('platform') ?? '';
			return json(route, signatureResponse(framework, platform));
		}
	);

	// Treeherder series.
	await page.route(/treeherder\.mozilla\.org\/api\/performance\/summary/, (route) => {
		const url = new URL(route.request().url());
		const signature = Number(url.searchParams.get('signature'));
		const days = Number(url.searchParams.get('interval')) / (24 * 60 * 60);
		return json(route, seriesResponse(signature, days || 30));
	});

	// Alerts: none. Alert rendering has its own unit tests; what a browser test
	// adds here is only that the request is made and the empty case renders.
	await page.route(/treeherder\.mozilla\.org\/api\/performance\/alertsummary/, (route) =>
		json(route, { results: [] })
	);

	// Job -> Taskcluster task. The two harnesses get different task ids, keyed
	// off the repository in the URL, so each can publish the artifact list it
	// really would: Android runs mozperftest on mozilla-central, NavBench runs
	// browsertime on autoland. Serving one merged list instead would let a page
	// pass by picking up the other harness's measurement file.
	await page.route(/treeherder\.mozilla\.org\/api\/project\/([^/]+)\/jobs\//, (route) => {
		const autoland = route.request().url().includes('/project/autoland/');
		return json(route, {
			taskcluster_metadata: {
				task_id: autoland ? BROWSERTIME_TASK : MOZPERFTEST_TASK,
				retry_id: 0
			}
		});
	});

	// Taskcluster artifact listings, one per harness.
	await page.route(new RegExp(`queue/v1/task/${MOZPERFTEST_TASK}/runs/\\d+/artifacts$`), (route) =>
		json(route, {
			artifacts: [
				// A decoy with the same prefix, as the real jobs publish.
				{
					name: 'public/build/perfherder-data-mozharness-actions.json',
					contentType: 'application/json'
				},
				{ name: 'public/build/perfherder-data-1234abcd.json', contentType: 'application/json' },
				...ANDROID_SUITES.map((suite) => ({
					name: `public/build/${suite}.tgz`,
					contentType: 'application/x-compressed-tar'
				})),
				{ name: 'public/logs/live.log', contentType: 'text/plain' }
			]
		})
	);

	await page.route(new RegExp(`queue/v1/task/${BROWSERTIME_TASK}/runs/\\d+/artifacts$`), (route) =>
		json(route, {
			artifacts: [
				{
					name: 'public/build/perfherder-data-mozharness-actions.json',
					contentType: 'application/json'
				},
				{
					name: 'public/fetch/perfherder-data-fetch-content.json',
					contentType: 'application/json'
				},
				{ name: 'public/test_info/perfherder-data.json', contentType: 'application/json' },
				{
					name: 'public/test_info/browsertime-videos-annotated.tgz',
					contentType: 'application/octet-stream'
				},
				{ name: 'public/logs/live.log', contentType: 'text/plain' }
			]
		})
	);

	// The measurement artifact, in both harnesses' shapes.
	await page.route(/artifacts\/public\/build\/perfherder-data-[0-9a-f]+\.json$/, (route) =>
		json(route, {
			// One subtest per catalogue entry, so the suite and test names the page
			// looks for are the ones served, by construction.
			suites: ANDROID_TESTS.filter((test) => test.hasVideo).map((test) => ({
				name: test.suite,
				unit: test.unit,
				subtests: [{ name: test.test, value: 1500, replicates: REPLICATES }]
			}))
		})
	);

	await page.route(/artifacts\/public\/test_info\/perfherder-data\.json$/, (route) =>
		json(route, {
			suites: [
				{
					name: 'nav-bench-overall',
					value: 200,
					unit: 'score',
					subtests: [
						{ name: 'amazon-nav-load-score', value: 198, replicates: REPLICATES },
						{ name: 'bbc-nav-subnav-score', value: 181, replicates: REPLICATES }
					]
				}
			]
		})
	);

	// The video archives.
	await page.route(/artifacts\/public\/build\/([\w.-]+)\.tgz$/, async (route) => {
		const suite = /public\/build\/([\w.-]+)\.tgz/.exec(route.request().url())![1];
		await route.fulfill({
			contentType: 'application/x-compressed-tar',
			body: await buildArchive(ANDROID_VIDEOS(suite))
		});
	});

	await page.route(
		/artifacts\/public\/test_info\/browsertime-videos-annotated\.tgz$/,
		async (route) => {
			await route.fulfill({
				contentType: 'application/octet-stream',
				body: await buildArchive(NAVBENCH_VIDEOS)
			});
		}
	);

	// Redash.
	await page.route(/sql\.telemetry\.mozilla\.org\/api\/queries\/(\d+)\/results\.csv/, (route) => {
		const queryId = /queries\/(\d+)\//.exec(route.request().url())![1];
		const memoryQuery = Object.values(CHANNEL_URLS).some((url) => url.includes(queryId));
		return text(route, memoryQuery ? memoryCsv() : networkingCsv(queryId));
	});

	// Static snapshots.
	await page.route(/performance-data\/.*bugzilla-data-all\.json$/, (route) =>
		json(route, bugzillaData())
	);

	await page.route(/performance-data\/.*ml-data\.json$/, (route) => json(route, mlData()));

	await page.route(/performance-data\/.*ml-engine-data\.json$/, (route) =>
		json(route, mlEngineData())
	);

	await page.route(/performance-data\/.*jetstream-data\.json\.gz$/, async (route) => {
		const rows = [];
		// `wasm-hashset` earns its place: the subtest filter's presets are
		// WebAssembly-shaped, so without a test whose name contains "wasm" the
		// filter could only ever be tested against an empty result.
		for (const test of ['score', 'Air', 'Box2D', 'wasm-hashset-Average']) {
			for (const application of ['firefox', 'chrome', 'safari']) {
				for (let d = 20; d > 0; d--) {
					rows.push({
						date: isoDay(d),
						test,
						suite: 'jetstream3',
						platform: 'macosx1500-aarch64-shippable',
						application,
						value: 200 + noise(d) * 30
					});
				}
			}
		}
		const body = JSON.stringify({ query_result: { data: { rows } } });
		const gzipped = new Response(
			new Blob([body]).stream().pipeThrough(new CompressionStream('gzip'))
		);
		await route.fulfill({
			contentType: 'application/gzip',
			body: Buffer.from(await gzipped.arrayBuffer())
		});
	});

	// Fonts and icons: not worth a network round trip, and Google Fonts is a
	// third party we should not be contacting from a test run.
	await page.route(/fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com/, (route) =>
		text(route, '/* stub */', 'text/css')
	);

	return { unmatched, consoleErrors };
}

/**
 * `test` with the stubs installed and checked automatically.
 *
 * Every spec imports this rather than Playwright's own `test`. The fixture is
 * `auto`, so a test cannot forget to stub -- forgetting meant quietly talking
 * to the real Treeherder -- and the two assertions that were repeated at the
 * end of each test now run at teardown for all of them.
 *
 * That is what lets a page be covered by one specific test rather than by a
 * specific test plus a "renders" test whose only unique contribution was these
 * two lines.
 */
export const test = base.extend<{ stubs: Stubs }>({
	stubs: [
		async ({ page }, use) => {
			const stubs = await stubApis(page);
			await use(stubs);
			expect(stubs.consoleErrors, 'console errors').toEqual([]);
			expect(stubs.unmatched, 'requests no fixture claimed').toEqual([]);
		},
		{ auto: true }
	]
});

export { expect } from '@playwright/test';
