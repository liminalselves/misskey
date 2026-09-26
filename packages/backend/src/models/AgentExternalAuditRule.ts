/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export type MiAgentExternalAuditRule = {
	id: string;
	name: string;
	reason: string;
	criteria: string;
	enabled: boolean;
};

export type MiAgentExternalAuditOtherRule = {
	reason: string;
	criteria: string;
};
