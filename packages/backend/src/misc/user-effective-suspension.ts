/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { MiUser } from '@/models/User.js';

/** ローカル・リモート users テーブル上の isSuspended / suspendedUntil に基づき、凍結が現在有効かを返す。期限付き凍結が既に満了していれば false（DB 更新は定期ジョブで行う）。 */
export function isUserEffectivelySuspended(user: Pick<MiUser, 'isSuspended' | 'suspendedUntil'>): boolean {
	if (!user.isSuspended) return false;
	if (user.suspendedUntil == null) return true;
	return user.suspendedUntil.getTime() > Date.now();
}

/** TypeORM クエリ用: エイリアス user が「実質凍結されていない」行の条件 */
export function sqlUserNotEffectivelySuspended(alias: string): string {
	return `(${alias}.isSuspended = false OR (${alias}.suspendedUntil IS NOT NULL AND ${alias}.suspendedUntil <= :suspensionNow))`;
}

/** TypeORM クエリ用: エイリアス user が「実質凍結されている」行の条件 */
export function sqlUserEffectivelySuspended(alias: string): string {
	return `(${alias}.isSuspended = true AND (${alias}.suspendedUntil IS NULL OR ${alias}.suspendedUntil > :suspensionNow))`;
}
