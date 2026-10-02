import { describe, expect, it } from 'vitest';
import {
	annotationsFor,
	displayName,
	OVERALL_TEST,
	signatureTest,
	testKey,
	videoScenario
} from './config';

describe('the overall test', () => {
	it('round-trips a null signature test through a nameable key', () => {
		expect(testKey(undefined)).toBe(OVERALL_TEST);
		expect(signatureTest(OVERALL_TEST)).toBeUndefined();
	});

	it('treats an empty test name as the overall too', () => {
		expect(testKey('')).toBe(OVERALL_TEST);
	});

	it('leaves per-site tests alone', () => {
		expect(testKey('amazon-nav-load-score')).toBe('amazon-nav-load-score');
		expect(signatureTest('amazon-nav-load-score')).toBe('amazon-nav-load-score');
	});
});

describe('displayName', () => {
	it('drops the -score suffix every test in this suite shares', () => {
		expect(displayName('amazon-nav-load-score')).toBe('Amazon nav load');
		expect(displayName('duckduckgo-nav-subnav-score')).toBe('DuckDuckGo nav subnav');
	});

	it('still names a site it has no spelling for', () => {
		expect(displayName('example-nav-load-score')).toBe('Example nav load');
		expect(displayName('example-site-nav-load-score')).toBe('Example Site nav load');
	});

	// Splitting at the first hyphen named this "Google docs nav warm".
	it('keeps a hyphenated site name together', () => {
		expect(displayName('google-docs-nav-warm-score')).toBe('Google Docs nav warm');
		expect(displayName('google-nav-load-score')).toBe('Google nav load');
	});

	it('names the overall row', () => {
		expect(displayName(OVERALL_TEST)).toBe('Overall Score');
	});
});

describe('videoScenario', () => {
	// The archive lays recordings out under the test name without its suffix.
	it('maps a test to its directory in the video archive', () => {
		expect(videoScenario('bbc-nav-subnav-score')).toBe('bbc-nav-subnav');
	});

	it('has no scenario for the overall geomean', () => {
		expect(videoScenario(OVERALL_TEST)).toBeUndefined();
	});
});

describe('annotationsFor', () => {
	const untargeted = { date: '2026-09-03', label: 'Everywhere' };
	const targeted = { date: '2026-09-04', label: 'Amazon only', tests: ['amazon-nav-load-score'] };

	it('puts an untargeted annotation on every chart, the overall included', () => {
		expect(annotationsFor(OVERALL_TEST, [untargeted])).toEqual([untargeted]);
		expect(annotationsFor('bbc-nav-load-score', [untargeted])).toEqual([untargeted]);
	});

	it('keeps a targeted annotation to the charts it names', () => {
		expect(annotationsFor('amazon-nav-load-score', [targeted])).toEqual([targeted]);
		expect(annotationsFor('bbc-nav-load-score', [targeted])).toEqual([]);
		expect(annotationsFor(OVERALL_TEST, [targeted])).toEqual([]);
	});
});
