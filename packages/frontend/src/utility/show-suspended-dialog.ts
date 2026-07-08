/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as os from '@/os.js';
import { i18n } from '@/i18n.js';

const SUSPENSION_REASON_LABEL = '\u51bb\u7ed3\u539f\u56e0';
const SUSPENDED_UNTIL_LABEL = '\u89e3\u5c01\u65f6\u95f4';

type SuspensionInfo = {
	reason?: string | null;
	suspendedUntil?: string | null;
};

function formatSuspendedUntil(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return new Intl.DateTimeFormat(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short',
	}).format(date);
}

export function showSuspendedDialog(info?: SuspensionInfo | null) {
	const details = [
		i18n.ts.yourAccountSuspendedDescription,
		info?.reason ? `${SUSPENSION_REASON_LABEL}: ${info.reason}` : null,
		info?.suspendedUntil ? `${SUSPENDED_UNTIL_LABEL}: ${formatSuspendedUntil(info.suspendedUntil)}` : `${SUSPENDED_UNTIL_LABEL}: ${i18n.ts.indefinitely}`,
	].filter((line): line is string => line != null);

	return os.alert({
		type: 'error',
		title: i18n.ts.yourAccountSuspendedTitle,
		text: details.join('\n\n'),
	});
}
