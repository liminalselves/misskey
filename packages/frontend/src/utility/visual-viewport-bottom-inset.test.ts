/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { getVisualViewportBottomInset } from './visual-viewport-bottom-inset.js';

describe('getVisualViewportBottomInset', () => {
	test('returns zero when the visible viewport still reaches the layout bottom', () => {
		expect(getVisualViewportBottomInset({
			layoutViewportHeight: 844,
			visibleViewportHeight: 844,
			visibleViewportOffsetTop: 0,
		})).toBe(0);
	});

	test('returns the hidden bottom area when the keyboard shrinks the visible viewport', () => {
		expect(getVisualViewportBottomInset({
			layoutViewportHeight: 844,
			visibleViewportHeight: 512,
			visibleViewportOffsetTop: 0,
		})).toBe(332);
	});

	test('accounts for a shifted visual viewport before calculating the inset', () => {
		expect(getVisualViewportBottomInset({
			layoutViewportHeight: 844,
			visibleViewportHeight: 540,
			visibleViewportOffsetTop: 24,
		})).toBe(280);
	});

	test('clamps negative values to zero', () => {
		expect(getVisualViewportBottomInset({
			layoutViewportHeight: 700,
			visibleViewportHeight: 720,
			visibleViewportOffsetTop: 0,
		})).toBe(0);
	});
});
