/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * 部分嵌入式 WebView（例如较旧的 Android System WebView）实现了 `getRandomValues` 但未实现 `randomUUID`。
 */
function install(): void {
	const c = globalThis.crypto;
	if (!c || typeof c.randomUUID === 'function') return;
	if (typeof c.getRandomValues !== 'function') return;

	c.randomUUID = function randomUUID(): `${string}-${string}-${string}-${string}-${string}` {
		const bytes = new Uint8Array(16);
		c.getRandomValues(bytes);
		bytes[6] = (bytes[6]! & 0x0f) | 0x40;
		bytes[8] = (bytes[8]! & 0x3f) | 0x80;
		const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
		return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
	};
}

install();
