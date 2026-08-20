import type { ChartAnnotation } from '$lib/annotations';

export type Platform = 'desktop' | 'android';
export type Channel = 'release' | 'nightly';

export interface LegendEntry {
	term: string;
	definition: string;
}

export interface ChartConfig {
	url: string;
	title: string;
	description?: string;
	legend?: LegendEntry[];
	chartType?: 'stackedArea' | 'pie';
	/** Which CSV column holds the value; long-format files need this. */
	valueColumn?: string;
	labelColumn?: string;
	/** Force long-format parsing rather than sniffing it. */
	format?: 'long';
	/** Series draw order; anything not listed is dropped. */
	seriesOrder?: string[];
	/** Display names for series whose raw key is not presentable. */
	seriesLabels?: Record<string, string>;
	/** Series drawn de-emphasised behind the headline one. */
	fadedSeries?: string[];
	unit?: string;
	yMin?: number;
}

export const CHARTS: Record<string, ChartConfig> = {
	'dns-desktop': {
		url: 'https://sql.telemetry.mozilla.org/api/queries/112861/results.csv?api_key=h1RVeaRfWTQXKaN9LZwcH7GVv8T82WeVBWfzAxD8',
		valueColumn: 'percentage_7d_avg',
		chartType: 'stackedArea',
		title: 'DNS Resolution Method',
		description: 'Percentage of navigations by DNS resolver type',
		legend: [
			{
				term: 'DoH',
				definition: 'DNS over HTTPS via Trusted Recursive Resolver'
			},
			{
				term: 'os_resolver',
				definition: 'System DNS resolver'
			}
		]
	},
	'http-desktop': {
		url: 'https://sql.telemetry.mozilla.org/api/queries/113403/results.csv?api_key=sJ7dVgzAsACPSW93F0k0UAN6Ak7EQI05pSxrAdBK',
		valueColumn: 'percentage_7d_moving_avg',
		seriesOrder: ['HTTP/2', 'HTTP/1.1', 'HTTP/3', 'Unknown'],
		chartType: 'stackedArea',
		title: 'HTTP Protocol Version',
		description: 'Percentage of navigations by HTTP version'
	},
	'https-desktop': {
		url: 'https://sql.telemetry.mozilla.org/api/queries/115307/results.csv?api_key=gZ9Cq7UwYxpNCcp5BDWHwri0tmSJdMRTcBP6DM6b',
		chartType: 'pie',
		labelColumn: 'metric_key',
		valueColumn: 'percentage',
		title: 'HTTPS/HTTP',
		description: 'Percentage of navigations by URL scheme'
	},
	'dns-lookup-desktop': {
		url: 'https://sql.telemetry.mozilla.org/api/queries/121688/results.csv?api_key=zhnbWXs4e8ArSumpkVDHzFmVBcsFcDIzAHRAqcfK',
		valueColumn: 'ma_7day',
		unit: 'ms',
		seriesOrder: ['DoH-p95', 'os_resolver-p95', 'DoH-p75', 'os_resolver-p75'],
		yMin: 0,
		title:
			'DNS Lookup Time - <a href="https://support.mozilla.org/en-US/kb/firefox-dns-over-https" target="_blank">DoH</a> and OS resolver',
		description: 'USA & Canada (DoH Rollout Countries), P75 &amp; P95, 7-day avg'
	},
	'ttrs-desktop': {
		url: 'https://sql.telemetry.mozilla.org/api/queries/114600/results.csv?api_key=Q9JtXttDKz4R5s3XmovMEuDC0bc4mL319MJwe3MJ',
		valueColumn: 'P75_7day_average_ms',
		unit: 'ms',
		format: 'long',
		seriesOrder: ['overall', '1', '2', '3'],
		seriesLabels: {
			'1': 'HTTP/1.1',
			'2': 'HTTP/2',
			'3': 'HTTP/3',
			overall: 'Overall'
		},
		fadedSeries: ['1', '2', '3'],
		yMin: 0,
		title: 'Time to Request Start',
		description:
			'By HTTP protocol version. Includes DNS lookup and connection establishment with TLS (75th percentile, 7-day avg)'
	},
	'fcp-desktop': {
		url: 'https://sql.telemetry.mozilla.org/api/queries/114620/results.csv?api_key=qRcfwtuiZ3Aa0zfTtfTIvUEV2k9c2ms3XV2h169O',
		valueColumn: 'P75_7day_average_ms',
		unit: 'ms',
		format: 'long',
		seriesOrder: ['overall', '1', '2', '3'],
		seriesLabels: {
			'1': 'HTTP/1.1',
			'2': 'HTTP/2',
			'3': 'HTTP/3',
			overall: 'Overall'
		},
		fadedSeries: ['1', '2', '3'],
		yMin: 0,
		title:
			'<a href="https://developer.mozilla.org/en-US/docs/Glossary/First_contentful_paint" target="_blank">First Contentful Paint</a>',
		description: 'By HTTP protocol version (75th percentile, 7-day avg)'
	},
	'lcp-desktop': {
		url: 'https://sql.telemetry.mozilla.org/api/queries/114621/results.csv?api_key=4BjDAkj3ld1Q86Wk6HMH95QYUoszWR2MpwfQRkgF',
		valueColumn: 'P75_7day_average_ms',
		unit: 'ms',
		format: 'long',
		seriesOrder: ['overall', '1', '2', '3'],
		seriesLabels: {
			'1': 'HTTP/1.1',
			'2': 'HTTP/2',
			'3': 'HTTP/3',
			overall: 'Overall'
		},
		fadedSeries: ['1', '2', '3'],
		yMin: 0,
		title:
			'<a href="https://developer.mozilla.org/en-US/docs/Web/API/LargestContentfulPaint" target="_blank">Largest Contentful Paint</a>',
		description: 'By HTTP protocol version (75th percentile, 7-day avg)'
	},
	'http-android': {
		url: 'https://sql.telemetry.mozilla.org/api/queries/115321/results.csv?api_key=jNpImN72C4cKOMJHi1ngGQckwctxKlgh0Wqjbx8Z',
		valueColumn: 'percentage_7d_moving_avg',
		seriesOrder: ['HTTP/2', 'HTTP/1.1', 'HTTP/3', 'Unknown'],
		chartType: 'stackedArea',
		format: 'long',
		title: 'HTTP Protocol Version',
		description: 'Percentage of navigations by HTTP version'
	},
	'https-android': {
		url: 'https://sql.telemetry.mozilla.org/api/queries/115320/results.csv?api_key=2l7AfwYmlWGtk0hUQPO3oA0kHvUNILxOjYZqLEQN',
		chartType: 'pie',
		labelColumn: 'metric_key',
		valueColumn: 'percentage',
		title: 'HTTPS/HTTP',
		description: 'Percentage of navigations by URL scheme'
	},
	'dns-lookup-android': {
		url: 'https://sql.telemetry.mozilla.org/api/queries/115329/results.csv?api_key=GRqbVlXLCtCTA4vdU4Qqbe4nm9jw2wFAKTirZRxf',
		valueColumn: 'value_7day_average_ms',
		unit: 'ms',
		seriesOrder: ['p95', 'p75'],
		yMin: 0,
		title: 'DNS Lookup Time',
		description: 'P75 &amp; P95, 7-day avg'
	},
	'ttrs-android': {
		url: 'https://sql.telemetry.mozilla.org/api/queries/115316/results.csv?api_key=gOm1naQJ8JgSmE9cOIcyyWz1Jrq49HWCKmrMtEGS',
		valueColumn: 'P75_7day_average_ms',
		unit: 'ms',
		format: 'long',
		seriesOrder: ['overall', '1', '2', '3'],
		seriesLabels: {
			'1': 'HTTP/1.1',
			'2': 'HTTP/2',
			'3': 'HTTP/3',
			overall: 'Overall'
		},
		fadedSeries: ['1', '2', '3'],
		yMin: 0,
		title: 'Time to Request Start',
		description:
			'By HTTP protocol version. Includes DNS lookup and connection establishment with TLS (P75, 7-day avg)'
	},
	'fcp-android': {
		url: 'https://sql.telemetry.mozilla.org/api/queries/115318/results.csv?api_key=4L0j3xrAfOEKBwO6p9tL0GCbRUQiDs4TKaQa5HJ8',
		valueColumn: 'P75_7day_average_ms',
		unit: 'ms',
		format: 'long',
		seriesOrder: ['overall', '1', '2', '3'],
		seriesLabels: {
			'1': 'HTTP/1.1',
			'2': 'HTTP/2',
			'3': 'HTTP/3',
			overall: 'Overall'
		},
		fadedSeries: ['1', '2', '3'],
		yMin: 0,
		title:
			'<a href="https://developer.mozilla.org/en-US/docs/Glossary/First_contentful_paint" target="_blank">First Contentful Paint</a>',
		description: 'By HTTP protocol version (P75, 7-day avg)'
	},
	'lcp-android': {
		url: 'https://sql.telemetry.mozilla.org/api/queries/115319/results.csv?api_key=F4sp1gB3fHqDtfqqjzNyHGabVY6RdgKg00M6JHyJ',
		valueColumn: 'P75_7day_average_ms',
		unit: 'ms',
		format: 'long',
		seriesOrder: ['overall', '1', '2', '3'],
		seriesLabels: {
			'1': 'HTTP/1.1',
			'2': 'HTTP/2',
			'3': 'HTTP/3',
			overall: 'Overall'
		},
		fadedSeries: ['1', '2', '3'],
		yMin: 0,
		title:
			'<a href="https://developer.mozilla.org/en-US/docs/Web/API/LargestContentfulPaint" target="_blank">Largest Contentful Paint</a>',
		description: 'By HTTP protocol version (P75, 7-day avg)'
	},
	'nettype-android': {
		url: 'https://sql.telemetry.mozilla.org/api/queries/115600/results.csv?api_key=IiyQ7NIj4wRVz86YhpE3elJW6ybv21wnmpq1e9ej',
		valueColumn: 'percentage_7d_avg',
		chartType: 'stackedArea',
		format: 'long',
		title: 'Network Type',
		description: 'By network connection type (note: less than 365 days of data)'
	},
	'tls-desktop': {
		url: 'https://sql.telemetry.mozilla.org/api/queries/113419/results.csv?api_key=HtwisXPokpZeNBBJVdUK5kqGOuYj2EdIglQqCD5C',
		valueColumn: 'P75_7day_average_ms',
		unit: 'ms',
		yMin: 0,
		title: 'TLS Handshake Time',
		description: '75th percentile, 7-day avg (note: this probe has less than 365 days of data)'
	},
	'tls-android': {
		url: 'https://sql.telemetry.mozilla.org/api/queries/115579/results.csv?api_key=h6xuQmN6t0hLVl64Ujiy1H9R1kKyThQNJIqDe5CR',
		valueColumn: 'P75_7day_average_ms',
		unit: 'ms',
		yMin: 0,
		title: 'TLS Handshake Time',
		description: 'P75, 7-day avg (note: this probe has less than 365 days of data)'
	},
	'dns-desktop-nightly': {
		url: 'https://sql.telemetry.mozilla.org/api/queries/115473/results.csv?api_key=1BZfEQvxvUmEYUlqIWnsWpOonlf9o8weg0NOE3SO',
		valueColumn: 'percentage_7d_avg',
		chartType: 'stackedArea',
		title: 'DNS Resolution Method',
		description: 'Percentage of navigations by DNS resolver type',
		legend: [
			{
				term: 'DoH',
				definition: 'DNS over HTTPS via Trusted Recursive Resolver'
			},
			{
				term: 'os_resolver',
				definition: 'System DNS resolver'
			}
		]
	},
	'http-desktop-nightly': {
		url: 'https://sql.telemetry.mozilla.org/api/queries/115477/results.csv?api_key=dXO1b47uzGRjvLCEDa1cVjxtZdLYECb0g41u8V5Q',
		valueColumn: 'percentage_7d_moving_avg',
		seriesOrder: ['HTTP/2', 'HTTP/1.1', 'HTTP/3', 'Unknown'],
		chartType: 'stackedArea',
		title: 'HTTP Protocol Version',
		description: 'Percentage of navigations by HTTP version'
	},
	'https-desktop-nightly': {
		url: 'https://sql.telemetry.mozilla.org/api/queries/115479/results.csv?api_key=0nB29PJJSp8IhgSVkBYK0B0He4jaYAO5wCARUVYm',
		chartType: 'pie',
		labelColumn: 'metric_key',
		valueColumn: 'percentage',
		title: 'HTTPS/HTTP',
		description: 'Percentage of navigations by URL scheme'
	},
	'dns-lookup-desktop-nightly': {
		url: 'https://sql.telemetry.mozilla.org/api/queries/121686/results.csv?api_key=xpA2aVZKs1aCceiqKrHcrr7FOiV1HSGhjYbDtKAe',
		valueColumn: 'ma_7day',
		unit: 'ms',
		seriesOrder: ['DoH-p95', 'os_resolver-p95', 'DoH-p75', 'os_resolver-p75'],
		yMin: 0,
		title:
			'DNS Lookup Time (US, Canada) - <a href="https://support.mozilla.org/en-US/kb/firefox-dns-over-https" target="_blank">DoH</a> and OS resolver',
		description: 'P75 &amp; P95, 7-day avg'
	},
	'ttrs-desktop-nightly': {
		url: 'https://sql.telemetry.mozilla.org/api/queries/115484/results.csv?api_key=ogGOU2XSgp98OAJOjPJbuNE0I6nO2SxE9POcgZlu',
		valueColumn: 'P75_7day_average_ms',
		unit: 'ms',
		format: 'long',
		seriesOrder: ['overall', '1', '2', '3'],
		seriesLabels: {
			'1': 'HTTP/1.1',
			'2': 'HTTP/2',
			'3': 'HTTP/3',
			overall: 'Overall'
		},
		fadedSeries: ['1', '2', '3'],
		yMin: 0,
		title: 'Time to Request Start',
		description:
			'By HTTP protocol version. Includes DNS lookup and connection establishment with TLS (75th percentile, 7-day avg)'
	},
	'fcp-desktop-nightly': {
		url: 'https://sql.telemetry.mozilla.org/api/queries/115488/results.csv?api_key=oBM38JJp8JtFXFGyFucjNcoTvdiExHiLuPIkiGy4',
		valueColumn: 'P75_7day_average_ms',
		unit: 'ms',
		format: 'long',
		seriesOrder: ['overall', '1', '2', '3'],
		seriesLabels: {
			'1': 'HTTP/1.1',
			'2': 'HTTP/2',
			'3': 'HTTP/3',
			overall: 'Overall'
		},
		fadedSeries: ['1', '2', '3'],
		yMin: 0,
		title:
			'<a href="https://developer.mozilla.org/en-US/docs/Glossary/First_contentful_paint" target="_blank">First Contentful Paint</a>',
		description: 'By HTTP protocol version (75th percentile, 7-day avg)'
	},
	'lcp-desktop-nightly': {
		url: 'https://sql.telemetry.mozilla.org/api/queries/115494/results.csv?api_key=JWsnteAJVkGCWf5IVVN8dhg5XKqeILz8en48DhBa',
		valueColumn: 'P75_7day_average_ms',
		unit: 'ms',
		format: 'long',
		seriesOrder: ['overall', '1', '2', '3'],
		seriesLabels: {
			'1': 'HTTP/1.1',
			'2': 'HTTP/2',
			'3': 'HTTP/3',
			overall: 'Overall'
		},
		fadedSeries: ['1', '2', '3'],
		yMin: 0,
		title:
			'<a href="https://developer.mozilla.org/en-US/docs/Web/API/LargestContentfulPaint" target="_blank">Largest Contentful Paint</a>',
		description: 'By HTTP protocol version (75th percentile, 7-day avg)'
	},
	'dns-android-nightly': {
		url: 'https://sql.telemetry.mozilla.org/api/queries/115475/results.csv?api_key=tqT4rlqAXhoXOAlQadjRUBPos97TzijdNwVe6FGu',
		valueColumn: 'percentage_7d_avg',
		chartType: 'stackedArea',
		title: 'DNS Resolution Method (US, Canada)',
		description: 'Percentage of navigations by DNS resolver type',
		legend: [
			{
				term: 'DoH',
				definition: 'DNS over HTTPS via Trusted Recursive Resolver'
			},
			{
				term: 'os_resolver',
				definition: 'System DNS resolver'
			}
		]
	},
	'http-android-nightly': {
		url: 'https://sql.telemetry.mozilla.org/api/queries/115478/results.csv?api_key=mdB5BRu2YAVhwjLRBsay3JtfoDjQGQMYM4rEY9qO',
		valueColumn: 'percentage_7d_moving_avg',
		seriesOrder: ['HTTP/2', 'HTTP/1.1', 'HTTP/3', 'Unknown'],
		chartType: 'stackedArea',
		format: 'long',
		title: 'HTTP Protocol Version',
		description: 'Percentage of navigations by HTTP version'
	},
	'https-android-nightly': {
		url: 'https://sql.telemetry.mozilla.org/api/queries/115480/results.csv?api_key=ro8Rrg80wEgP2GVazmMJT3JXhRCMOc9Eg59AJs4q',
		chartType: 'pie',
		labelColumn: 'metric_key',
		valueColumn: 'percentage',
		title: 'HTTPS/HTTP',
		description: 'Percentage of navigations by URL scheme'
	},
	'dns-lookup-android-nightly': {
		url: 'https://sql.telemetry.mozilla.org/api/queries/121687/results.csv?api_key=9oyXbO2mR2oO8hk6DudyhBXaf3RA7iL6H4MCxSM2',
		valueColumn: 'ma_7day',
		unit: 'ms',
		seriesOrder: ['DoH-p95', 'os_resolver-p95', 'DoH-p75', 'os_resolver-p75'],
		yMin: 0,
		title:
			'DNS Lookup Time (US, Canada) - <a href="https://support.mozilla.org/en-US/kb/firefox-dns-over-https" target="_blank">DoH</a> and OS resolver',
		description: 'P75 &amp; P95, 7-day avg'
	},
	'ttrs-android-nightly': {
		url: 'https://sql.telemetry.mozilla.org/api/queries/115485/results.csv?api_key=yToxAAgYHaol9r0bqjFK2peUE9LczQYeYIXPsRCJ',
		valueColumn: 'P75_7day_average_ms',
		unit: 'ms',
		format: 'long',
		seriesOrder: ['overall', '1', '2', '3'],
		seriesLabels: {
			'1': 'HTTP/1.1',
			'2': 'HTTP/2',
			'3': 'HTTP/3',
			overall: 'Overall'
		},
		fadedSeries: ['1', '2', '3'],
		yMin: 0,
		title: 'Time to Request Start',
		description:
			'By HTTP protocol version. Includes DNS lookup and connection establishment with TLS (P75, 7-day avg)'
	},
	'fcp-android-nightly': {
		url: 'https://sql.telemetry.mozilla.org/api/queries/115489/results.csv?api_key=Tsj13u2heYTuhvCme1NYBFCONi0aR0xSfnCdgBGJ',
		valueColumn: 'P75_7day_average_ms',
		unit: 'ms',
		format: 'long',
		seriesOrder: ['overall', '1', '2', '3'],
		seriesLabels: {
			'1': 'HTTP/1.1',
			'2': 'HTTP/2',
			'3': 'HTTP/3',
			overall: 'Overall'
		},
		fadedSeries: ['1', '2', '3'],
		yMin: 0,
		title:
			'<a href="https://developer.mozilla.org/en-US/docs/Glossary/First_contentful_paint" target="_blank">First Contentful Paint</a>',
		description: 'By HTTP protocol version (P75, 7-day avg)'
	},
	'lcp-android-nightly': {
		url: 'https://sql.telemetry.mozilla.org/api/queries/115497/results.csv?api_key=53L4FZG6MjG43b98tEo6yO3tEkOdcoArzrGYpQgq',
		valueColumn: 'P75_7day_average_ms',
		unit: 'ms',
		format: 'long',
		seriesOrder: ['overall', '1', '2', '3'],
		seriesLabels: {
			'1': 'HTTP/1.1',
			'2': 'HTTP/2',
			'3': 'HTTP/3',
			overall: 'Overall'
		},
		fadedSeries: ['1', '2', '3'],
		yMin: 0,
		title:
			'<a href="https://developer.mozilla.org/en-US/docs/Web/API/LargestContentfulPaint" target="_blank">Largest Contentful Paint</a>',
		description: 'By HTTP protocol version (P75, 7-day avg)'
	},
	'nettype-android-nightly': {
		url: 'https://sql.telemetry.mozilla.org/api/queries/115599/results.csv?api_key=L42nQDKyAlEQupIOyRjaxqNsbfi8upafmsuehf3x',
		valueColumn: 'percentage_7d_avg',
		chartType: 'stackedArea',
		format: 'long',
		title: 'Network Type',
		description: 'By network connection type (note: less than 365 days of data)'
	},
	'tls-desktop-nightly': {
		url: 'https://sql.telemetry.mozilla.org/api/queries/115601/results.csv?api_key=7l9oLH68G9V7defdsezWMtg8tybno6L6UuBtZUZW',
		valueColumn: 'P75_7day_average_ms',
		unit: 'ms',
		yMin: 0,
		title: 'TLS Handshake Time',
		description: '75th percentile, 7-day avg (note: this probe has less than 365 days of data)'
	},
	'tls-android-nightly': {
		url: 'https://sql.telemetry.mozilla.org/api/queries/115576/results.csv?api_key=HBT8JqUv0YTmEtsfIIdgAUfe8NXSRhfShp7i2ULk',
		valueColumn: 'P75_7day_average_ms',
		unit: 'ms',
		yMin: 0,
		title: 'TLS Handshake Time',
		description: 'P75, 7-day avg (note: this probe has less than 365 days of data)'
	}
};

export interface ChartGroup {
	title: string;
	charts: string[];
}

/** Which charts appear, and in what grouping, for each platform/channel view. */
export const LAYOUT: Record<string, ChartGroup[]> = {
	'desktop:release': [
		{ title: 'Protocol', charts: ['dns-desktop', 'http-desktop', 'https-desktop'] },
		{
			title: 'Performance',
			charts: ['dns-lookup-desktop', 'tls-desktop', 'ttrs-desktop', 'fcp-desktop', 'lcp-desktop']
		}
	],
	'desktop:nightly': [
		{
			title: 'Protocol',
			charts: ['dns-desktop-nightly', 'http-desktop-nightly', 'https-desktop-nightly']
		},
		{
			title: 'Performance',
			charts: [
				'dns-lookup-desktop-nightly',
				'tls-desktop-nightly',
				'ttrs-desktop-nightly',
				'fcp-desktop-nightly',
				'lcp-desktop-nightly'
			]
		}
	],
	'android:release': [
		{ title: 'Protocol', charts: ['http-android', 'https-android', 'nettype-android'] },
		{
			title: 'Performance',
			charts: ['dns-lookup-android', 'tls-android', 'ttrs-android', 'fcp-android', 'lcp-android']
		}
	],
	'android:nightly': [
		{
			title: 'Protocol',
			charts: [
				'dns-android-nightly',
				'http-android-nightly',
				'https-android-nightly',
				'nettype-android-nightly'
			]
		},
		{
			title: 'Performance',
			charts: [
				'dns-lookup-android-nightly',
				'tls-android-nightly',
				'ttrs-android-nightly',
				'fcp-android-nightly',
				'lcp-android-nightly'
			]
		}
	]
};

export const PLATFORMS: Platform[] = ['desktop', 'android'];
export const CHANNELS: Channel[] = ['release', 'nightly'];

export function layoutFor(platform: Platform, channel: Channel): ChartGroup[] {
	return LAYOUT[`${platform}:${channel}`] ?? [];
}

export interface Annotation extends ChartAnnotation {
	platform?: Platform;
	channel?: Channel;
	chart?: string;
}

/** Landmarks worth marking on the timeline, mostly bug landings. */
export const ANNOTATIONS: Annotation[] = [
	{
		date: '2025-09-16',
		label: 'Bug 2003257',
		description: 'HTTP/1.1 used for ~25% more top level document loads as of Fx 143',
		url: 'https://bugzilla.mozilla.org/show_bug.cgi?id=2003257',
		platform: 'desktop',
		channel: 'release',
		chart: 'http-desktop'
	},
	{
		date: '2025-08-07',
		label: 'Bug 1913165',
		description: 'Add networking segmentation to the pageload event',
		url: 'https://bugzilla.mozilla.org/show_bug.cgi?id=1913165',
		platform: 'android',
		channel: 'nightly',
		chart: 'nettype-android-nightly'
	},
	{
		date: '2025-09-16',
		label: 'Bug 1913165',
		description: 'Add networking segmentation to the pageload event',
		url: 'https://bugzilla.mozilla.org/show_bug.cgi?id=1913165',
		platform: 'android',
		channel: 'release',
		chart: 'nettype-android'
	},
	{
		date: '2026-05-20',
		label: 'Bug 2039555',
		description: 'Enabled Happy Eyeballs v3 (HEv3) on nightly',
		url: 'https://bugzilla.mozilla.org/show_bug.cgi?id=2039555',
		platform: 'desktop',
		channel: 'nightly',
		chart: 'dns-lookup-desktop-nightly'
	},
	{
		date: '2026-05-20',
		label: 'Bug 2039555',
		description: 'Enabled Happy Eyeballs v3 (HEv3) on nightly',
		url: 'https://bugzilla.mozilla.org/show_bug.cgi?id=2039555',
		platform: 'android',
		channel: 'nightly',
		chart: 'dns-lookup-android-nightly'
	},
	{
		date: '2026-05-20',
		label: 'Bug 2039555',
		description: 'Enabled Happy Eyeballs v3 (HEv3) on nightly',
		url: 'https://bugzilla.mozilla.org/show_bug.cgi?id=2039555',
		platform: 'android',
		channel: 'nightly',
		chart: 'ttrs-android-nightly'
	},
	{
		date: '2026-05-20',
		label: 'Bug 2039555',
		description: 'Enabled Happy Eyeballs v3 (HEv3) on nightly',
		url: 'https://bugzilla.mozilla.org/show_bug.cgi?id=2039555',
		platform: 'android',
		channel: 'nightly',
		chart: 'tls-android-nightly'
	},
	{
		date: '2026-05-20',
		label: 'Bug 2039555',
		description: 'Enabled Happy Eyeballs v3 (HEv3) on nightly',
		url: 'https://bugzilla.mozilla.org/show_bug.cgi?id=2039555',
		platform: 'desktop',
		channel: 'nightly',
		chart: 'http-desktop-nightly'
	},
	{
		date: '2026-05-20',
		label: 'Bug 2039555',
		description: 'Enabled Happy Eyeballs v3 (HEv3) on nightly',
		url: 'https://bugzilla.mozilla.org/show_bug.cgi?id=2039555',
		platform: 'android',
		channel: 'nightly',
		chart: 'http-android-nightly'
	},
	{
		date: '2026-06-26',
		label: 'Bug 2049334',
		description: 'Fixed ~300ms cold HTTP/3 connection delay on Android (GSO EIO fallback)',
		url: 'https://bugzilla.mozilla.org/show_bug.cgi?id=2049334',
		platform: 'android',
		channel: 'nightly',
		chart: 'ttrs-android-nightly'
	},
	{
		date: '2026-06-26',
		label: 'Bug 2049334',
		description: 'Fixed ~300ms cold HTTP/3 connection delay on Android (GSO EIO fallback)',
		url: 'https://bugzilla.mozilla.org/show_bug.cgi?id=2049334',
		platform: 'android',
		channel: 'nightly',
		chart: 'tls-android-nightly'
	},
	{
		date: '2026-07-15',
		label: 'Bug 2054882',
		description:
			'Report connectEnd at early-data send for accepted 0-RTT (fixes time_to_request_start regression)',
		url: 'https://bugzilla.mozilla.org/show_bug.cgi?id=2054882',
		platform: 'desktop',
		channel: 'nightly',
		chart: 'ttrs-desktop-nightly'
	},
	{
		date: '2026-07-15',
		label: 'Bug 2054882',
		description:
			'Report connectEnd at early-data send for accepted 0-RTT (fixes time_to_request_start regression)',
		url: 'https://bugzilla.mozilla.org/show_bug.cgi?id=2054882',
		platform: 'android',
		channel: 'nightly',
		chart: 'ttrs-android-nightly'
	},
	{
		date: '2026-07-08',
		label: 'Bug 2047648',
		description:
			'Report real DNS-resolution end for Happy Eyeballs (fixes inflated dns_lookup_time)',
		url: 'https://bugzilla.mozilla.org/show_bug.cgi?id=2047648',
		platform: 'desktop',
		channel: 'nightly',
		chart: 'dns-lookup-desktop-nightly'
	},
	{
		date: '2026-07-08',
		label: 'Bug 2047648',
		description:
			'Report real DNS-resolution end for Happy Eyeballs (fixes inflated dns_lookup_time)',
		url: 'https://bugzilla.mozilla.org/show_bug.cgi?id=2047648',
		platform: 'android',
		channel: 'nightly',
		chart: 'dns-lookup-android-nightly'
	},
	{
		date: '2026-05-29',
		label: 'Bug 2042702',
		description: 'Moved pageload event to page destruction for more accurate LCP',
		url: 'https://bugzilla.mozilla.org/show_bug.cgi?id=2042702',
		platform: 'desktop',
		channel: 'nightly',
		chart: 'lcp-desktop-nightly'
	},
	{
		date: '2026-05-29',
		label: 'Bug 2042702',
		description: 'Moved pageload event to page destruction for more accurate LCP',
		url: 'https://bugzilla.mozilla.org/show_bug.cgi?id=2042702',
		platform: 'android',
		channel: 'nightly',
		chart: 'lcp-android-nightly'
	},
	{
		date: '2026-07-21',
		label: 'Bug 2042702',
		description: 'Moved pageload event to page destruction for more accurate LCP (Fx 153)',
		url: 'https://bugzilla.mozilla.org/show_bug.cgi?id=2042702',
		platform: 'desktop',
		channel: 'release',
		chart: 'lcp-desktop'
	},
	{
		date: '2026-07-21',
		label: 'Bug 2042702',
		description: 'Moved pageload event to page destruction for more accurate LCP (Fx 153)',
		url: 'https://bugzilla.mozilla.org/show_bug.cgi?id=2042702',
		platform: 'android',
		channel: 'release',
		chart: 'lcp-android'
	}
];
