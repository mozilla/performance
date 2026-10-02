/**
 * Data loading for the Speedometer routes.
 *
 * Plain async functions taking state and an AbortSignal. The reactivity lives
 * in the route, which wraps these in `resource()`; keeping it out of here means
 * they can be tested directly.
 */
import {
	fetchSeries,
	fetchSignatures,
	type Measurement,
	type PerfSignature,
	type Repository,
	selectCanonicalSignatures
} from '$lib/api/treeherder';
import { isSafariApplication } from '$lib/browsers';
import { type AlertData, fetchAlertsForTest, mergeAlertData } from './alerts';
import {
	ALL_TESTS,
	platformByKey,
	SCORE_TEST,
	SPEEDOMETER_FRAMEWORK,
	SPEEDOMETER_SUITE,
	SUBTESTS
} from './config';

/** Days of history loaded for the breakdown table, regardless of chart range. */
export const TABLE_WINDOW_DAYS = 30;

/** Days of history searched for alerts. */
export const ALERT_WINDOW_DAYS = 90;

const isFirefoxApp = (sig: PerfSignature) =>
	sig.application === 'firefox' || sig.application === 'fenix';

export interface SignatureOptions {
	platforms?: string[];
	/** Shorthand for `include: sig => sig.suite === suite`. */
	suite?: string;
	/** Which signatures to keep. Overrides `suite` when both are given. */
	include?(signature: PerfSignature): boolean;
	/** Defaults to browsertime. Android also reads mozperftest (15). */
	framework?: number;
	/**
	 * An extra platform to read Safari signatures from, on top of `platforms`.
	 * See `PlatformConfig.safariPlatform`.
	 */
	safariPlatform?: string;
}

export async function loadSignatures(
	platformKey: string,
	repository: Repository,
	signal?: AbortSignal,
	options: SignatureOptions = {}
): Promise<PerfSignature[]> {
	const suite = options.suite ?? SPEEDOMETER_SUITE;
	const include = options.include ?? ((sig: PerfSignature) => sig.suite === suite);
	const framework = options.framework ?? SPEEDOMETER_FRAMEWORK;
	const platforms = options.platforms ?? platformByKey(platformKey).platforms;

	const perPlatform = platforms.map(async (platform) => {
		const [own, central] = await Promise.all([
			fetchSignatures({ repository, framework, platform }, signal),
			repository === 'mozilla-central'
				? Promise.resolve<PerfSignature[]>([])
				: fetchSignatures({ repository: 'mozilla-central', framework, platform }, signal)
		]);

		const firefox = own.filter((sig) => include(sig) && isFirefoxApp(sig));
		// When the selected repository *is* mozilla-central, `own` already
		// holds the competitor signatures, so there is no second request.
		const competitors = (repository === 'mozilla-central' ? own : central).filter(
			(sig) => include(sig) && !isFirefoxApp(sig)
		);

		return [...firefox, ...competitors];
	});

	// Safari's current platform, on top of the Safari signatures already found
	// above on the old one, so the chart keeps the history.
	const safariPlatform = options.safariPlatform;
	const safari = safariPlatform
		? fetchSignatures(
				{ repository: 'mozilla-central', framework, platform: safariPlatform },
				signal
			).then((all) => all.filter((sig) => include(sig) && isSafariApplication(sig.application)))
		: Promise.resolve<PerfSignature[]>([]);

	const found = await Promise.all([...perPlatform, safari]);
	return selectCanonicalSignatures(found.flat());
}

/**
 * Fetch and flatten the series for a set of signatures.
 *
 * `framework` is optional because a signature already knows the framework it
 * was found in; Android needs that, since its catalogue spans two.
 */
export async function loadMeasurements(
	signatures: readonly PerfSignature[],
	days: number,
	replicates: boolean,
	signal?: AbortSignal,
	framework?: number
): Promise<Measurement[]> {
	const series = await Promise.all(
		signatures.map((signature) =>
			fetchSeries({ signature, framework, days, replicates }, signal).catch(
				// One dead signature should not blank the whole chart.
				() => [] as Measurement[]
			)
		)
	);

	return series.flat();
}

/** Signatures backing the breakdown table: every displayed test. */
export function tableSignatures(signatures: readonly PerfSignature[]): PerfSignature[] {
	return signatures.filter((sig) => sig.test !== undefined && ALL_TESTS.includes(sig.test));
}

/** Signatures backing the main chart: just the selected test. */
export function chartSignatures(
	signatures: readonly PerfSignature[],
	test: string
): PerfSignature[] {
	return signatures.filter((sig) => sig.test === test);
}

/**
 * Alerts for the chart.
 *
 * The Overall Score chart aggregates every subtest's alerts, so it fans out to
 * subtests × platforms requests; the concurrency limiter in http.ts keeps that
 * from stampeding. Subtest charts fetch only their own.
 */
export async function loadAlerts(
	platformKey: string,
	test: string,
	signal?: AbortSignal
): Promise<AlertData> {
	const { platforms } = platformByKey(platformKey);
	const tests = test === SCORE_TEST ? SUBTESTS : [test];

	const parts = await Promise.all(
		platforms.flatMap((platform) =>
			tests.map((each) =>
				fetchAlertsForTest(each, platform, ALERT_WINDOW_DAYS, signal).catch((): AlertData => ({
					alerts: [],
					summaries: new Map()
				}))
			)
		)
	);

	return mergeAlertData(parts);
}

export function availableSubtests(signatures: readonly PerfSignature[]): string[] {
	const present = new Set(signatures.map((sig) => sig.test));
	return SUBTESTS.filter((test) => present.has(test));
}
