import { FRAMEWORK } from '$lib/api/treeherder';

export const MOZPERFTEST_FRAMEWORK = 15;

export interface DeviceConfig {
	key: string;
	label: string;
	/** Full device name, for the chart subtitle. */
	description: string;
	platform: string;
}

export const DEVICES: readonly DeviceConfig[] = [
	{
		key: 'a55',
		label: 'A55',
		description: 'Samsung Galaxy A55 (Android 14)',
		platform: 'android-hw-a55-14-0-aarch64-shippable'
	},
	{
		key: 'p6',
		label: 'P6',
		description: 'Google Pixel 6 (Android 13)',
		platform: 'android-hw-p6-13-0-aarch64-shippable'
	},
	{
		key: 's24',
		label: 'S24',
		description: 'Samsung Galaxy S24 (Android 14)',
		platform: 'android-hw-s24-14-0-aarch64-shippable'
	}
];

export const DEVICE_KEYS = DEVICES.map((device) => device.key);
export const DEFAULT_DEVICE = 'a55';

export function deviceByKey(key: string): DeviceConfig {
	return DEVICES.find((device) => device.key === key) ?? DEVICES[0];
}

export interface AndroidTest {
	key: string;
	label: string;
	/** Treeherder suite and test, used to select signatures and alerts. */
	suite: string;
	test: string;
	framework: number;
	unit: string;
	lowerIsBetter: boolean;
	/**
	 * Whether the job publishes a `<suite>.tgz` of per-replicate screen
	 * recordings. Only the applink, homeview and tab restore tests do.
	 */
	hasVideo: boolean;
}

/**
 * The tests offered on the page, in display order.
 *
 * Suite and test names verified against the live framework-15 and framework-13
 * signature lists for all three devices.
 */
export const TESTS: readonly AndroidTest[] = [
	{
		key: 'newssite-applink-startup',
		label: 'NewsSite applink startup',
		suite: 'newssite-applink-startup',
		test: 'applink_startup',
		framework: MOZPERFTEST_FRAMEWORK,
		unit: 'ms',
		lowerIsBetter: true,
		hasVideo: true
	},
	{
		key: 'shopify-applink-startup',
		label: 'Shopify applink startup',
		suite: 'shopify-applink-startup',
		test: 'applink_startup',
		framework: MOZPERFTEST_FRAMEWORK,
		unit: 'ms',
		lowerIsBetter: true,
		hasVideo: true
	},
	{
		key: 'homeview-startup',
		label: 'Homeview startup',
		suite: 'homeview-startup',
		test: 'homeview_startup',
		framework: MOZPERFTEST_FRAMEWORK,
		unit: 'ms',
		lowerIsBetter: true,
		hasVideo: true
	},
	{
		key: 'newssite-tab-restore',
		label: 'Tab restore (NewsSite)',
		suite: 'tab-restore-newssite',
		test: 'tab_restore',
		framework: MOZPERFTEST_FRAMEWORK,
		unit: 'ms',
		lowerIsBetter: true,
		hasVideo: true
	},
	{
		key: 'cold-view-nav-start',
		label: 'Cold view nav start (mean)',
		suite: 'applink-startup-navigation-start',
		test: 'cold_view_nav_start.mean',
		framework: MOZPERFTEST_FRAMEWORK,
		unit: 'ms',
		lowerIsBetter: true,
		hasVideo: false
	},
	{
		key: 'cold-main-first-frame',
		label: 'Cold main first frame (mean)',
		suite: 'applink-startup-first-frame',
		test: 'cold_main_first_frame.mean',
		framework: MOZPERFTEST_FRAMEWORK,
		unit: 'ms',
		lowerIsBetter: true,
		hasVideo: false
	},
	{
		key: 'sp3',
		label: 'Speedometer 3 score',
		suite: 'speedometer3',
		test: 'score',
		framework: FRAMEWORK.browsertime,
		unit: '',
		lowerIsBetter: false,
		hasVideo: false
	},
	{
		key: 'sp3-cpu-time',
		label: 'Speedometer 3 CPU time',
		suite: 'speedometer3',
		test: 'cpuTime',
		framework: FRAMEWORK.browsertime,
		unit: 'ms',
		lowerIsBetter: true,
		hasVideo: false
	},
	{
		key: 'sp3-power-usage',
		label: 'Speedometer 3 power usage',
		suite: 'speedometer3',
		test: 'powerUsage',
		framework: FRAMEWORK.browsertime,
		unit: 'mWh',
		lowerIsBetter: true,
		hasVideo: false
	}
];

export const TEST_KEYS = TESTS.map((test) => test.key);
export const DEFAULT_TEST = 'newssite-applink-startup';

export function testByKey(key: string): AndroidTest {
	return TESTS.find((test) => test.key === key) ?? TESTS[0];
}

/** The distinct frameworks the catalogue spans, for the signature fan-out. */
export const FRAMEWORKS = [...new Set(TESTS.map((test) => test.framework))];

/** Y-axis label for a test, e.g. `Time (ms)` or `Score (higher is better)`. */
export function axisLabel(test: AndroidTest): string {
	const direction = test.lowerIsBetter ? 'lower is better' : 'higher is better';
	return test.unit ? `${test.unit} (${direction})` : `Score (${direction})`;
}
