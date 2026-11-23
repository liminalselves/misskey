/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * 媒体元素加载失败时，向服务端上报该 URL。
 * 服务端会独立向对象存储核实对象是否真的丢失，客户端只负责「提示可能有问题」。
 * 这里只做去重与限流，避免一张坏图或网络抖动造成请求洪水。
 */

const MAX_REPORTS_PER_PAGE_LOAD = 30;
const MIN_INTERVAL_MS = 1500;

export type MissingMediaReporter = {
	report: (url: string, now?: number) => boolean;
};

/** 只上报站外绝对 URL：站内路径、blob:、data: 之类不可能是对象存储直链。 */
export function shouldReportMediaUrl(url: string | null | undefined, selfOrigin: string): url is string {
	if (url == null || url === '' || url.length > 2048) return false;
	let u: URL;
	try {
		u = new URL(url, selfOrigin);
	} catch {
		return false;
	}
	if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
	// 站内 /proxy/ 的地址会在服务端回源时自行核查，这里不重复上报
	if (u.origin === selfOrigin) return false;
	return true;
}

export function createMissingMediaReporter(send: (url: string) => void): MissingMediaReporter {
	const seen = new Set<string>();
	let lastSentAt = -Infinity;
	let count = 0;

	return {
		report(url, now = Date.now()) {
			if (seen.has(url)) return false;
			if (count >= MAX_REPORTS_PER_PAGE_LOAD) return false;
			if (now - lastSentAt < MIN_INTERVAL_MS) return false;

			seen.add(url);
			lastSentAt = now;
			count++;
			send(url);
			return true;
		},
	};
}

const MEDIA_TAGS = new Set(['IMG', 'VIDEO', 'AUDIO', 'SOURCE']);

/** 取媒体元素当前实际请求的地址；非媒体元素返回 null。 */
export function getMediaElementUrl(target: EventTarget | null): string | null {
	const el = target as { tagName?: string; currentSrc?: string; src?: string } | null;
	if (el == null || typeof el.tagName !== 'string' || !MEDIA_TAGS.has(el.tagName)) return null;
	const url = el.currentSrc !== undefined && el.currentSrc !== '' ? el.currentSrc : el.src;
	return url === '' || url == null ? null : url;
}
