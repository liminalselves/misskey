/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export function isPreservedUsername(username: string, preservedUsernames: string[] | null | undefined): boolean {
	const normalizedUsername = username.trim().toLowerCase();
	if (normalizedUsername === '') return false;
	return (preservedUsernames ?? []).some((value) => value.trim().toLowerCase() === normalizedUsername);
}
