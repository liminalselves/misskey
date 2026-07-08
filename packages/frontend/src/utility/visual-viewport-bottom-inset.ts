/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export function getVisualViewportBottomInset(args: {
	layoutViewportHeight: number;
	visibleViewportHeight: number;
	visibleViewportOffsetTop: number;
}): number {
	return Math.max(0, args.layoutViewportHeight - (args.visibleViewportHeight + args.visibleViewportOffsetTop));
}
