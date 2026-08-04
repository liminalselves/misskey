/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { In, IsNull } from 'typeorm';
import type { AgentExternalAuditLogsRepository, AgentSessionsRepository, UsersRepository, UserProfilesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { AgentService } from '@/core/AgentService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { NotificationService } from '@/core/NotificationService.js';
import { UserSuspendService } from '@/core/UserSuspendService.js';
import { RoleService } from '@/core/RoleService.js';
import { getAcctByUserId } from './_utils.js';

export const meta = {
	tags: ['admin', 'agents'],
	requireCredential: true,
	secure: true,
	requireModerator: true,
	kind: 'write:admin',
	limit: { duration: ms('1hour'), max: 60 },
	res: { type: 'object', optional: false, nullable: false, additionalProperties: true },
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		/** 要封禁的会话 ID 列表 */
		sessionIds: {
			type: 'array',
			items: { type: 'string', format: 'misskey:id' },
			minItems: 1,
		},
		/** 封禁会话的原因（面向用户），留空则使用违规类别 */
		sessionBanReason: { type: 'string', maxLength: 1000, nullable: true },
		/** 用户封禁时长（小时），-1 表示不封禁用户，0 表示永封 */
		suspendDurationHours: { type: 'integer', minimum: -1, default: -1 },
		/** 封禁用户的原因（面向用户），留空则使用违规类别 */
		userSuspendReason: { type: 'string', maxLength: 2048, nullable: true },
		/** 管理笔记（面向内部），不填则自动生成 */
		moderationNote: { type: 'string', maxLength: 4096, nullable: true },
		/** 违规类别 */
		violationCategory: { type: 'string', maxLength: 128 },
	},
	required: ['sessionIds', 'violationCategory'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentSessionsRepository)
		private agentSessionsRepository: AgentSessionsRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		@Inject(DI.agentExternalAuditLogsRepository)
		private agentExternalAuditLogsRepository: AgentExternalAuditLogsRepository,

		private agentService: AgentService,
		private moderationLogService: ModerationLogService,
		private notificationService: NotificationService,
		private userSuspendService: UserSuspendService,
		private roleService: RoleService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();

			const sessions = await this.agentSessionsRepository.findBy({ id: In(ps.sessionIds) });
			if (sessions.length === 0) throw new ApiError({ message: 'No such session.', code: 'NO_SUCH_SESSION', id: 'a1b2c3d4-5678-4abc-9def-000000000001' });

			const user = await this.usersRepository.findOneBy({ id: sessions[0].userId });
			if (!user) throw new ApiError({ message: 'No such user.', code: 'NO_SUCH_USER', id: 'a1b2c3d4-5678-4abc-9def-000000000002' });

			const category = ps.violationCategory.trim();
			const sessionReason = ps.sessionBanReason?.trim() || category;
			const shouldSuspendUser = (ps.suspendDurationHours ?? -1) >= 0;

			const results: Record<string, unknown> = {
				sessionsBanned: 0,
				userSuspended: false,
				noteAdded: false,
			};

			// 1. 批量封禁会话
			const userAcct = await getAcctByUserId(this.usersRepository, user.id);
			for (const session of sessions) {
				if (session.moderationBanned) continue;
				session.moderationBanned = true;
				session.moderationBannedReason = sessionReason;
				session.updatedAt = new Date();
				await this.agentSessionsRepository.save(session);

				await this.moderationLogService.log(me, 'setAgentSessionModerationBan', {
					sessionId: session.id,
					sessionName: session.name,
					userId: session.userId,
					userAcct,
					characterId: session.characterId,
					banned: true,
					before: false,
					reason: sessionReason,
				});
				this.notificationService.createNotification(
					session.userId,
					'agentSessionBanned',
					{ sessionId: session.id, sessionName: session.name, banned: true },
				);
				results.sessionsBanned = (results.sessionsBanned as number) + 1;
			}

			// 2. 封禁用户
			if (shouldSuspendUser && !user.isSuspended) {
				if (await this.roleService.isModerator(user)) {
					throw new ApiError({ message: 'Cannot suspend moderator account.', code: 'CANNOT_SUSPEND_MODERATOR', id: 'a1b2c3d4-5678-4abc-9def-000000000003' });
				}

				const durationHours = ps.suspendDurationHours!;
				const expiresAt = durationHours > 0 ? new Date(Date.now() + durationHours * 60 * 60 * 1000) : null;
				const reason = ps.userSuspendReason?.trim() || `智能体${category}`;

				await this.userSuspendService.suspend(user, me, { expiresAt, reason });
				results.userSuspended = true;
				results.suspendExpiresAt = expiresAt?.toISOString() ?? null;
				results.suspendDurationHours = durationHours;
			}

			// 3. 添加管理笔记（仅在封禁用户时生成）
			if (shouldSuspendUser) {
				const now = new Date();
				const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
				const durationText = ps.suspendDurationHours === 0 ? '永封' : `封禁${ps.suspendDurationHours}小时`;

				const autoNote = `[${dateStr}]智能体${category}${durationText} -${me.username}`;
				const noteText = ps.moderationNote?.trim() || autoNote;

				const profile = await this.userProfilesRepository.findOneBy({ userId: user.id });
				if (profile) {
					const existingNote = profile.moderationNote ?? '';
					const newNote = existingNote ? `${existingNote}\n${noteText}` : noteText;
					await this.userProfilesRepository.update({ userId: user.id }, { moderationNote: newNote });
					results.noteAdded = true;
					results.noteContent = noteText;
				}
			}

			// 4. 标记该用户所有未忽略的外审记录为已审阅（复审列表中消失）
			await this.agentExternalAuditLogsRepository.update(
				{ userId: user.id, status: 'block', reviewIgnoredAt: IsNull() },
				{ reviewIgnoredAt: new Date(), reviewIgnoredById: me.id },
			);

			return results;
		});
	}
}
