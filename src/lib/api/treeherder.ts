import { fetchJson } from './http';

const TREEHERDER = 'https://treeherder.mozilla.org';

/** Repositories the dashboards read from. */
export type Repository = 'mozilla-central' | 'autoland';

/** Treeherder's numeric id for autoland, used by the alert summary endpoint. */
export const AUTOLAND_REPOSITORY_ID = 77;

/** Perfherder framework ids. */
export const FRAMEWORK = {
	talos: 1,
	raptor: 10,
	browsertime: 13
} as const;

export interface PerfSignature {
	id: number;
	framework_id: number;
	signature_hash: string;
	machine_platform: string;
	suite: string;
	test?: string;
	application?: string;
	lower_is_better?: boolean;
	has_subtests?: boolean;
	extra_options?: string[];
	measurement_unit?: string;
	/** Not part of the API response; attached by us so a signature knows its origin. */
	repository?: Repository;
}

export interface PerfDataPoint {
	job_id: number;
	id: number;
	value: number;
	push_timestamp: string | number;
	push_id: number;
	revision: string;
	machine_name?: string;
}

interface PerfSummaryResponse {
	signature_id: number;
	framework_id: number;
	suite: string;
	test?: string;
	data: PerfDataPoint[];
}

/** A data point normalised for charting: dates parsed, signature metadata inlined. */
export interface Measurement {
	date: Date;
	value: number;
	test: string;
	suite: string;
	platform: string;
	application: string;
	signatureId: number;
	repository: Repository;
	revision: string;
	jobId: number;
	machineName?: string;
	extraOptions: string[];
}

export function selectCanonicalSignatures(signatures: PerfSignature[]): PerfSignature[] {
	const canonicalKey = (sig: PerfSignature) =>
		[sig.application, sig.machine_platform, sig.suite, sig.test].join('|');

	const isMoreCanonical = (candidate: PerfSignature, current: PerfSignature) => {
		const candidateOptions = (candidate.extra_options ?? []).length;
		const currentOptions = (current.extra_options ?? []).length;
		if (candidateOptions !== currentOptions) {
			return candidateOptions < currentOptions;
		}
		// Deterministic tie-break: prefer the most recently created signature.
		return candidate.id > current.id;
	};

	const canonical = new Map<string, PerfSignature>();
	for (const sig of signatures) {
		const key = canonicalKey(sig);
		const current = canonical.get(key);
		if (!current || isMoreCanonical(sig, current)) {
			canonical.set(key, sig);
		}
	}
	return [...canonical.values()];
}

export interface SignatureQuery {
	repository: Repository;
	framework: number;
	platform: string;
}

/**
 * All performance signatures for a (repository, framework, platform).
 *
 * The endpoint returns an object keyed by signature hash rather than an array,
 * and omits the id from the value in some Treeherder versions, so the hash is
 * folded in here.
 */
export async function fetchSignatures(
	query: SignatureQuery,
	signal?: AbortSignal
): Promise<PerfSignature[]> {
	const url =
		`${TREEHERDER}/api/project/${query.repository}/performance/signatures/` +
		`?framework=${query.framework}&platform=${encodeURIComponent(query.platform)}`;

	const response = await fetchJson<Record<string, PerfSignature>>(url, { signal });

	return Object.entries(response).map(([hash, sig]) => ({
		...sig,
		signature_hash: sig.signature_hash ?? hash,
		repository: query.repository
	}));
}

export interface SeriesQuery {
	signature: PerfSignature;
	/** Defaults to the signature's own framework, which is what it was found in. */
	framework?: number;
	/** Time window in days. */
	days: number;
	replicates: boolean;
}

/** The measurement series for one signature, normalised into `Measurement`s. */
export async function fetchSeries(
	query: SeriesQuery,
	signal?: AbortSignal
): Promise<Measurement[]> {
	const { signature, days, replicates } = query;
	const framework = query.framework ?? signature.framework_id;
	const repository = signature.repository ?? 'mozilla-central';
	const interval = days * 24 * 60 * 60;

	const url =
		`${TREEHERDER}/api/performance/summary/` +
		`?repository=${repository}&signature=${signature.id}&framework=${framework}` +
		`&interval=${interval}&all_data=true${replicates ? '&replicates=true' : ''}`;

	// Per-push data: not cached, since it changes continuously and the same URL
	// is rarely requested twice within a session.
	const response = await fetchJson<PerfSummaryResponse[]>(url, { signal, cache: false });

	const series = response[0]?.data;
	if (!Array.isArray(series)) return [];

	return series.map((point) => ({
		// Treeherder has returned push_timestamp both as an ISO string and as
		// epoch seconds depending on endpoint version; handle both.
		date: new Date(
			typeof point.push_timestamp === 'string' ? point.push_timestamp : point.push_timestamp * 1000
		),
		value: point.value,
		test: signature.test ?? '',
		suite: signature.suite,
		platform: signature.machine_platform,
		application: signature.application ?? '',
		signatureId: signature.id,
		repository,
		revision: point.revision,
		jobId: point.job_id,
		machineName: point.machine_name,
		extraOptions: signature.extra_options ?? []
	}));
}

export interface Alert {
	id: number;
	amount_pct: number;
	is_regression: boolean;
	/** 3 means "invalid"; those are filtered out before display. */
	status: number;
	related_summary_id: number | null;
	series_signature: PerfSignature;
}

export interface AlertSummary {
	id: number;
	push_timestamp: number;
	repository: string;
	alerts: Alert[];
}

interface AlertSummaryListResponse {
	results: AlertSummary[];
}

/** Alert summaries touching a given signature, within `days`. */
export async function fetchAlertSummaries(
	signatureId: number,
	days: number,
	signal?: AbortSignal
): Promise<AlertSummary[]> {
	const url =
		`${TREEHERDER}/api/performance/alertsummary/` +
		`?alerts__series_signature=${signatureId}&repository=${AUTOLAND_REPOSITORY_ID}` +
		`&limit=100&timerange=${days * 24 * 60 * 60}`;

	const response = await fetchJson<AlertSummaryListResponse>(url, { signal });
	return response.results ?? [];
}

/** A single alert summary by id, used to follow reassignment links. */
export async function fetchAlertSummary(
	summaryId: number,
	signal?: AbortSignal
): Promise<AlertSummary> {
	return fetchJson<AlertSummary>(`${TREEHERDER}/api/performance/alertsummary/${summaryId}/`, {
		signal
	});
}

interface JobResponse {
	taskcluster_metadata?: { task_id: string; retry_id: number };
}

export interface TaskRef {
	taskId: string;
	/** Which run of the task; artifact URLs are per-run, not per-task. */
	retryId: number;
}

/**
 * The Taskcluster task a job ran as.
 *
 * `/performance/summary/` does not include it, so it is resolved lazily for the
 * single job the user clicked, rather than for every point up front.
 */
export async function fetchTaskRef(
	repository: Repository,
	jobId: number,
	signal?: AbortSignal
): Promise<TaskRef | undefined> {
	const job = await fetchJson<JobResponse>(
		`${TREEHERDER}/api/project/${repository}/jobs/${jobId}/`,
		{ signal }
	);
	const metadata = job.taskcluster_metadata;
	return metadata ? { taskId: metadata.task_id, retryId: metadata.retry_id ?? 0 } : undefined;
}

// --- Outbound links -------------------------------------------------------

export function perfherderGraphsUrl(
	series: Array<{ repository: Repository; signatureId: number; framework: number }>,
	timerangeSeconds = 7_776_000
): string {
	const params = series
		.map((s) => `series=${s.repository},${s.signatureId},1,${s.framework}`)
		.join('&');
	return (
		`${TREEHERDER}/perfherder/graphs?highlightAlerts=1&highlightChangelogData=1` +
		`&highlightCommonAlerts=0&timerange=${timerangeSeconds}&${params}`
	);
}

/**
 * The same series in perfherder2, a newer graph viewer for Treeherder data.
 *
 * Not part of Treeherder, but what the Speedometer Experimental page links to
 * upstream (6221d70). Its series parameter has no visibility flag: it is
 * `repository,signature,framework`, where Treeherder's is
 * `repository,signature,1,framework`.
 */
export function perfherder2Url(
	series: Array<{ repository: Repository; signatureId: number; framework: number }>
): string {
	const params = series
		.map((s) => `series=${s.repository},${s.signatureId},${s.framework}`)
		.join('&');
	return `https://perfherder2.netlify.app/?${params}`;
}

export function perfherderAlertUrl(summaryId: number): string {
	return `${TREEHERDER}/perfherder/alerts?id=${summaryId}`;
}

export function taskclusterTaskUrl(taskId: string): string {
	return `https://firefox-ci-tc.services.mozilla.com/tasks/${taskId}`;
}

/** Treeherder's job view, scrolled to one task run on one push. */
export function treeherderJobUrl(repository: Repository, revision: string, task: TaskRef): string {
	return (
		`${TREEHERDER}/jobs?repo=${repository}&revision=${revision}` +
		`&group_state=expanded&selectedTaskRun=${task.taskId}.${task.retryId}`
	);
}

export function pushlogUrl(repository: Repository, fromRev: string, toRev: string): string {
	const path = repository === 'autoland' ? 'integration/autoland' : 'mozilla-central';
	return `https://hg-edge.mozilla.org/${path}/pushloghtml?fromchange=${fromRev}&tochange=${toRev}`;
}
