/** A single entry in the left-hand navigation. */
export interface NavItem {
	label: string;
	/** Route path, relative to the app base. External links are absolute URLs. */
	href: string;
	/** Font Awesome class, e.g. `fa-solid fa-gauge-high`. */
	icon: string;
	external?: boolean;
	/** Rendered indented under the parent, e.g. Speedometer -> Job Debug. */
	children?: NavItem[];
}

export const NAV: NavItem[] = [
	{ label: 'Performance Bugs', href: '/', icon: 'fa-solid fa-bug' },
	{
		label: 'Speedometer',
		href: '/speedometer',
		icon: 'fa-solid fa-gauge-high',

		children: [
			{ label: 'Job Debug', href: '/speedometer_job_debug', icon: 'fa-solid fa-arrow-right' },
			{ label: 'Experimental', href: '/speedometer-experimental', icon: 'fa-solid fa-arrow-right' }
		]
	},
	{ label: 'JetStream', href: '/jetstream', icon: 'fa-solid fa-wind' },
	{ label: 'Android', href: '/android', icon: 'fa-brands fa-android' },
	{ label: 'Navigation Benchmark', href: '/navbench', icon: 'fa-solid fa-compass' },
	{ label: 'Networking', href: '/networking', icon: 'fa-solid fa-network-wired' },
	{ label: 'Memory', href: '/memory', icon: 'fa-solid fa-memory' },
	{
		label: 'ML',
		href: '/ml',
		icon: 'fa-solid fa-hexagon-nodes',

		children: [{ label: 'Runtime Engines', href: '/ml-engine', icon: 'fa-solid fa-arrow-right' }]
	},
	{
		label: 'Experiments',
		href: 'https://protosaur.dev/perf-reports/',
		icon: 'fa-solid fa-chart-line',
		external: true
	},
	{
		label: 'Documentation',
		href: '',
		icon: 'fa-solid fa-book',
		children: [
			{
				label: 'Reporting a Performance Problem',
				href: 'https://firefox-source-docs.mozilla.org/performance/reporting_a_performance_problem.html',
				icon: '',
				external: true
			},
			{
				label: 'Running Performance Tests',
				href: 'https://firefox-source-docs.mozilla.org/testing/perfdocs/mach-try-perf.html',
				icon: '',
				external: true
			},
			{
				label: 'Firefox Profiler',
				href: 'https://profiler.firefox.com/',
				icon: '',
				external: true
			},
			{
				label: 'Performance Triage',
				href: 'https://wiki.mozilla.org/Performance/Triage',
				icon: '',
				external: true
			}
		]
	}
];
