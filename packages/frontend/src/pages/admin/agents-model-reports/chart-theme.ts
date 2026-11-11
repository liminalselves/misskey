/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { OTHER_KEY } from './report-utils.js';

/** Hex only: area fills append an alpha suffix. */
export const PALETTE = ['#4e9af1', '#86b300', '#f2a03d', '#b085cc', '#4db6ac', '#ec6b56', '#e2c044', '#7f8fa6', '#d97ab8', '#9fb3c8'];

export const FIXED_COLORS: Record<string, string> = {
	success: '#4caf50',
	failed: '#ec4137',
	aborted: '#ecb637',
	pending: '#9fb3c8',
	paid: '#f2a03d',
	free: '#4caf50',
	zeroPriced: '#4db6ac',
	byok: '#64b5f6',
	unassigned: '#b085cc',
	[OTHER_KEY]: '#9fb3c8',
};

export const GRID_COLOR = 'rgba(128, 128, 128, 0.15)';

export function cssColor(name: string, fallback: string): string {
	return getComputedStyle(window.document.documentElement).getPropertyValue(name).trim() || fallback;
}

export function withAlpha(hex: string, alpha: number): string {
	if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
	return `${hex}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;
}
