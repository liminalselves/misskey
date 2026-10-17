/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Logger } from '@nestjs/common';
import type { UsersRepository } from '@/models/_.js';
import type { IdService } from '@/core/IdService.js';
import type { NotificationService } from '@/core/NotificationService.js';
import { MiAgentModelUsageLog } from '@/models/AgentModelUsageLog.js';
import { MiUserProfile } from '@/models/UserProfile.js';
import { ApiError } from '@/server/api/error.js';
import { resolveUserIdFromAcctOrId } from '../governance/_utils.js';
import type { DataSource } from 'typeorm';

export const creditGrantErrors = {
	noSuchUser: {
		message: 'No such user.',
		code: 'NO_SUCH_USER',
		id: 'f3a1b2c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c',
	},
	invalidAmount: {
		message: 'Amount must be between 0.01 and 100000 with at most two decimal places.',
		code: 'INVALID_AMOUNT',
		id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
	},
	profileMissing: {
		message: 'Target user profile is missing.',
		code: 'USER_PROFILE_MISSING',
		id: '83034aa1-bb10-486e-b685-d2329948c374',
	},
} as const;

export type CreditGrantItem = {
	kind: 'reward' | 'compensation';
	userRef: string;
	amount: number;
	reason?: string | null;
};

type CreditGrantDeps = {
	usersRepository: UsersRepository;
	db: DataSource;
	idService: IdService;
	notificationService: NotificationService;
	notificationIcon: string | null;
};

const logger = new Logger('AgentCreditGrant');

export async function issueAgentCreditGrant(
	deps: CreditGrantDeps,
	item: CreditGrantItem,
	resolvedUserIds?: Map<string, string | null>,
): Promise<{ userId: string; amount: number; newBalance: number }> {
	const amount = Math.round(item.amount * 100) / 100;
	const tolerance = Number.EPSILON * Math.max(1, Math.abs(item.amount));
	if (!Number.isFinite(item.amount) || item.amount < 0.01 || item.amount > 100000 || Math.abs(item.amount - amount) > tolerance) {
		throw new ApiError(creditGrantErrors.invalidAmount);
	}

	const userRef = item.userRef.trim();
	let userId = resolvedUserIds?.get(userRef);
	if (userId === undefined) {
		const resolvedId = await resolveUserIdFromAcctOrId(deps.usersRepository, userRef);
		const user = resolvedId ? await deps.usersRepository.findOneBy({ id: resolvedId }) : null;
		userId = user?.id ?? null;
		resolvedUserIds?.set(userRef, userId);
	}
	if (userId == null) throw new ApiError(creditGrantErrors.noSuchUser);

	const targetUserId = userId;
	const reason = item.reason?.trim() ?? '';
	const now = new Date();
	const newBalance = await deps.db.transaction(async em => {
		const credited = await em.increment(MiUserProfile, { userId: targetUserId }, 'agentCreditBalance', amount);
		if ((credited.affected ?? 0) !== 1) throw new ApiError(creditGrantErrors.profileMissing);

		await em.insert(MiAgentModelUsageLog, {
			id: deps.idService.gen(),
			requestedAt: now,
			completedAt: now,
			durationMs: 0,
			userId: targetUserId,
			sessionId: null,
			characterId: null,
			dialogueStyleId: null,
			modelId: null,
			modelApiName: null,
			usageKind: item.kind === 'compensation' ? 'admin_compensation' : 'admin_reward',
			status: 'success',
			errorCode: reason === '' ? null : reason,
			cost: -amount,
			promptTokens: null,
			completionTokens: null,
		});

		const profile = await em.findOneOrFail(MiUserProfile, { where: { userId: targetUserId } });
		return profile.agentCreditBalance;
	});

	// Notification failures must not turn a committed grant into a retryable failure.
	try {
		const label = item.kind === 'compensation' ? '补偿' : '奖励';
		deps.notificationService.createNotification(targetUserId, 'app', {
			appAccessTokenId: null,
			customBody: `你收到了 ${amount.toFixed(2)} 额度${label}${reason ? `：${reason}` : ''}`,
			customHeader: item.kind === 'compensation' ? '补偿到账' : '奖励入账',
			customIcon: deps.notificationIcon,
		});
	} catch (error) {
		logger.warn(`Credit grant committed for ${targetUserId}, but notification failed`, error);
	}

	return { userId: targetUserId, amount, newBalance };
}
