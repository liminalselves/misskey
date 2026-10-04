/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { bindThis } from '@/decorators.js';
import type { AgentSessionsRepository } from '@/models/_.js';
import { MiAgentSession } from '@/models/AgentSession.js';
import { DI } from '@/di-symbols.js';
import { LoggerService } from '@/core/LoggerService.js';
import type Logger from '@/logger.js';
import type { OnApplicationShutdown } from '@nestjs/common';

// Only delete old, idle sessions with no messages or one assistant greeting
// created within GREETING_GRACE_MS of the session's creation.
const CLEANUP_INTERVAL_MS = ms('15min');
const SESSION_TTL_MS = ms('6h');
const MAX_DELETE_PER_TICK = 500;
const GREETING_GRACE_MS = ms('2min');

const EMPTY_SESSION_CONDITION = `
	NOT EXISTS (
		SELECT 1 FROM "agent_message" m
		WHERE m."sessionId" = "agent_session"."id"
		LIMIT 1 OFFSET 1
	)
	AND NOT EXISTS (
		SELECT 1 FROM "agent_message" m
		WHERE m."sessionId" = "agent_session"."id"
		AND (
			m."role" <> 'assistant'
			OR ABS(EXTRACT(EPOCH FROM (m."createdAt" - "agent_session"."createdAt"))) > :greetingGraceSeconds
		)
	)
`;

@Injectable()
export class AgentSessionCleanupService implements OnApplicationShutdown {
	private intervalId: NodeJS.Timeout | null = null;
	private running = false;
	private logger: Logger;

	constructor(
		@Inject(DI.agentSessionsRepository)
		private agentSessionsRepository: AgentSessionsRepository,

		loggerService: LoggerService,
	) {
		this.logger = loggerService.getLogger('agent-session-cleanup');
	}

	@bindThis
	public start(): void {
		if (this.intervalId) return;
		const tick = async () => {
			if (this.running) return;
			this.running = true;
			try {
				await this.cleanup();
			} catch (error) {
				this.logger.error(error instanceof Error ? error : String(error));
			} finally {
				this.running = false;
			}
		};

		void tick();
		this.intervalId = setInterval(() => void tick(), CLEANUP_INTERVAL_MS);
	}

	private async cleanup(): Promise<void> {
		const cutoff = new Date(Date.now() - SESSION_TTL_MS);
		const greetingParams = { greetingGraceSeconds: GREETING_GRACE_MS / 1000 };
		const candidates = await this.agentSessionsRepository.createQueryBuilder('agent_session')
			.select('agent_session.id')
			.where('agent_session.createdAt < :cutoff', { cutoff })
			.andWhere('agent_session.agentReplyPending = false')
			.andWhere(EMPTY_SESSION_CONDITION, greetingParams)
			.orderBy('agent_session.createdAt', 'ASC')
			.addOrderBy('agent_session.id', 'ASC')
			.limit(MAX_DELETE_PER_TICK)
			.getMany();
		if (candidates.length === 0) return;

		await this.agentSessionsRepository.manager.transaction('READ COMMITTED', async manager => {
			const locked = await manager.getRepository(MiAgentSession).createQueryBuilder('agent_session')
				.select('agent_session.id')
				.where('agent_session.id IN (:...ids)', { ids: candidates.map(s => s.id) })
				.andWhere('agent_session.createdAt < :cutoff', { cutoff })
				.andWhere('agent_session.agentReplyPending = false')
				.orderBy('agent_session.id', 'ASC')
				.setLock('pessimistic_write')
				.setOnLocked('skip_locked')
				.getMany();
			if (locked.length === 0) return;

			// FOR UPDATE also blocks message inserts through FK_agent_message_session.
			// A new READ COMMITTED statement sees messages committed before the lock.
			await manager.createQueryBuilder()
				.delete()
				.from(MiAgentSession)
				.where('id IN (:...ids)', { ids: locked.map(s => s.id) })
				.andWhere(EMPTY_SESSION_CONDITION, greetingParams)
				.execute();
		});
	}

	@bindThis
	public dispose(): void {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
	}

	@bindThis
	public onApplicationShutdown(): void {
		this.dispose();
	}
}
