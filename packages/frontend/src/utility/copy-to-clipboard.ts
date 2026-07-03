/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as os from '@/os.js';
import { i18n } from '@/i18n.js';

/**
 * Clipboardに値をコピー(TODO: 文字列以外も対応)
 */
export async function copyToClipboard(input: string | null): Promise<boolean> {
	if (!input) return false;

	try {
		if (window.isSecureContext && navigator.clipboard?.writeText) {
			await navigator.clipboard.writeText(input);
			os.toast(i18n.ts.copiedToClipboard);
			return true;
		}
	} catch (err) {
		console.warn('navigator.clipboard.writeText failed, falling back to execCommand(copy).', err);
	}

	if (copyToClipboardFallback(input)) {
		os.toast(i18n.ts.copiedToClipboard);
		return true;
	}

	os.toast(i18n.ts.somethingHappened);
	return false;
}

function copyToClipboardFallback(input: string): boolean {
	const textarea = window.document.createElement('textarea');
	const selection = window.document.getSelection();
	const selectedRanges = selection == null
		? []
		: Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i));

	textarea.value = input;
	textarea.setAttribute('readonly', '');
	textarea.style.position = 'fixed';
	textarea.style.top = '0';
	textarea.style.left = '0';
	textarea.style.width = '1px';
	textarea.style.height = '1px';
	textarea.style.padding = '0';
	textarea.style.border = '0';
	textarea.style.opacity = '0';
	textarea.style.fontSize = '16px';

	window.document.body.appendChild(textarea);
	textarea.focus({ preventScroll: true });
	textarea.select();
	textarea.setSelectionRange(0, textarea.value.length);

	let copied = false;
	try {
		copied = window.document.execCommand('copy');
	} catch (err) {
		console.warn('document.execCommand(copy) failed.', err);
	} finally {
		window.document.body.removeChild(textarea);
		if (selection != null) {
			selection.removeAllRanges();
			for (const range of selectedRanges) {
				selection.addRange(range);
			}
		}
	}

	return copied;
}
