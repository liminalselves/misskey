/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { getI18nLocale } from '@/i18n.js';

/**
 * Read agent-localized text without going through the development i18n Proxy.
 * This lets a freshly added key fall back cleanly while an old locale asset is
 * still cached by the browser.
 */
export function agentI18nTextFromLocale(locale: unknown, path: string, fallback: string): string {
	let value: unknown = locale;
	for (const key of path.split('.')) {
		if (value == null || typeof value !== 'object' || !Object.hasOwn(value, key)) return fallback;
		value = (value as Record<string, unknown>)[key];
	}
	return typeof value === 'string' ? value : fallback;
}

export function agentI18nText(path: string, fallback: string): string {
	return agentI18nTextFromLocale(getI18nLocale(), path, fallback);
}
