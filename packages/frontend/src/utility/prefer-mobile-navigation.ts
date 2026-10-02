/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { isEmbeddedAppShell } from '@/utility/is-embedded-app-shell.js';

export function preferMobileNavigation(): boolean {
	return isEmbeddedAppShell() || window.matchMedia('(max-width: 600px), (pointer: coarse)').matches;
}
