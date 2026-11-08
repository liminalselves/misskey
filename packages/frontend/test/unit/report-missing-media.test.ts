/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { createMissingMediaReporter, getMediaElementUrl, shouldReportMediaUrl } from '@/utility/report-missing-media.js';

const SELF = 'https://site.example.com';

describe('shouldReportMediaUrl', () => {
	test('reports absolute http(s) urls on other origins', () => {
		expect(shouldReportMediaUrl('http://oss.example.top/bucket/a.webp', SELF)).toBe(true);
		expect(shouldReportMediaUrl('https://cdn.example.com/a.png', SELF)).toBe(true);
	});

	test('never reports same-origin, blob, data or malformed urls', () => {
		expect(shouldReportMediaUrl(`${SELF}/proxy/a.webp?url=x`, SELF)).toBe(false);
		expect(shouldReportMediaUrl('/files/abc', SELF)).toBe(false);
		expect(shouldReportMediaUrl('blob:https://site.example.com/uuid', SELF)).toBe(false);
		expect(shouldReportMediaUrl('data:image/png;base64,AAAA', SELF)).toBe(false);
		expect(shouldReportMediaUrl('javascript:alert(1)', SELF)).toBe(false);
	});

	test('rejects empty, null and oversized values', () => {
		expect(shouldReportMediaUrl('', SELF)).toBe(false);
		expect(shouldReportMediaUrl(null, SELF)).toBe(false);
		expect(shouldReportMediaUrl(undefined, SELF)).toBe(false);
		expect(shouldReportMediaUrl(`https://cdn.example.com/${'a'.repeat(3000)}`, SELF)).toBe(false);
	});
});

describe('createMissingMediaReporter', () => {
	test('sends a url only once', () => {
		const send = vi.fn();
		const reporter = createMissingMediaReporter(send);
		expect(reporter.report('https://a.example/1.png', 0)).toBe(true);
		expect(reporter.report('https://a.example/1.png', 10_000)).toBe(false);
		expect(send).toHaveBeenCalledTimes(1);
	});

	test('throttles bursts so a page full of broken images does not flood the server', () => {
		const send = vi.fn();
		const reporter = createMissingMediaReporter(send);
		expect(reporter.report('https://a.example/1.png', 0)).toBe(true);
		expect(reporter.report('https://a.example/2.png', 100)).toBe(false);
		expect(reporter.report('https://a.example/3.png', 1499)).toBe(false);
		expect(reporter.report('https://a.example/4.png', 1500)).toBe(true);
		expect(send).toHaveBeenCalledTimes(2);
	});

	test('a throttled url can be reported later, because it was not recorded as sent', () => {
		const send = vi.fn();
		const reporter = createMissingMediaReporter(send);
		reporter.report('https://a.example/1.png', 0);
		expect(reporter.report('https://a.example/2.png', 100)).toBe(false);
		expect(reporter.report('https://a.example/2.png', 2000)).toBe(true);
	});

	test('stops after a fixed budget per page load', () => {
		const send = vi.fn();
		const reporter = createMissingMediaReporter(send);
		let t = 0;
		let accepted = 0;
		for (let i = 0; i < 100; i++) {
			t += 2000;
			if (reporter.report(`https://a.example/${i}.png`, t)) accepted++;
		}
		expect(accepted).toBe(30);
		expect(send).toHaveBeenCalledTimes(30);
	});
});

describe('getMediaElementUrl', () => {
	test('reads the effective source of media elements', () => {
		expect(getMediaElementUrl({ tagName: 'IMG', currentSrc: 'https://a.example/x.png', src: 'https://a.example/y.png' } as unknown as EventTarget)).toBe('https://a.example/x.png');
		expect(getMediaElementUrl({ tagName: 'VIDEO', currentSrc: '', src: 'https://a.example/v.mp4' } as unknown as EventTarget)).toBe('https://a.example/v.mp4');
	});

	test('ignores non-media targets and empty sources', () => {
		expect(getMediaElementUrl(null)).toBeNull();
		expect(getMediaElementUrl({ tagName: 'SCRIPT', src: 'https://a.example/x.js' } as unknown as EventTarget)).toBeNull();
		expect(getMediaElementUrl({ tagName: 'LINK', src: '' } as unknown as EventTarget)).toBeNull();
		expect(getMediaElementUrl({ tagName: 'IMG', currentSrc: '', src: '' } as unknown as EventTarget)).toBeNull();
		expect(getMediaElementUrl({} as EventTarget)).toBeNull();
	});
});
