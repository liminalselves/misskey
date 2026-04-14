/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import { bindThis } from '@/decorators.js';
import type { AgentMessagesRepository, AgentSessionsRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';

// Delete truly empty sessions safely.
// We only delete:
// - sessions older than SESSION_TTL_MS
// - not pending reply
// - message count is 0, OR exactly 1 assistant message created near session creation (greeting)
// This avoids deleting real conversations even if the user later deletes their own user messages.
const CLEANUP_INTERVAL_MS = ms('15min');
const SESSION_TTL_MS = ms('6h');
const MAX_DELETE_PER_TICK = 500;
const GREETING_GRACE_MS = ms('2min');

@Injectable()
export class AgentSessionCleanupService implements OnApplicationShutdown {
	private intervalId: NodeJS.Timeout | null = null;
	private running = false;

	constructor(
		@Inject(DI.agentSessionsRepository)
		private agentSessionsRepository: AgentSessionsRepository,

		@Inject(DI.agentMessagesRepository)
		private agentMessagesRepository: AgentMessagesRepository,
	) {}

	@bindThis
	public start(): void {
		const tick = async () => {
			if (this.running) return;
			this.running = true;
			try {
				const cutoff = new Date(Date.now() - SESSION_TTL_MS);

				// Candidate sessions: old, not pending, no user messages, and total message count <= 1.
				const rows = await this.agentSessionsRepository.createQueryBuilder('s')
					.select(['s.id', 's.createdAt'])
					.where('s.createdAt < :cutoff', { cutoff })
					.andWhere('s.agentReplyPending = false')
					.andWhere(qb => {
						const sub = qb.subQuery()
							.select('1')
							.from('agent_message', 'm')
							.where('m.sessionId = s.id')
							.andWhere('m.role = :role', { role: 'user' })
							.getQuery();
						return `NOT EXISTS ${sub}`;
					})
					.andWhere(qb => {
						const cnt = qb.subQuery()
							.select('COUNT(1)')
							.from('agent_message', 'mm')
							.where('mm.sessionId = s.id')
							.getQuery();
						return `(${cnt}) <= 1`;
					})
					.orderBy('s.createdAt', 'ASC')
					.limit(MAX_DELETE_PER_TICK)
					.getMany();

				if (rows.length === 0) return;
				const candidateIds = rows.map(r => r.id);
				const createdAtById = new Map(rows.map(r => [r.id, r.createdAt]));

				// Fetch remaining messages (0 or 1) to decide if it's safe to delete.
				const msgs = await this.agentMessagesRepository.createQueryBuilder('m')
					.select(['m.sessionId', 'm.role', 'm.createdAt'])
					.where('m.sessionId IN (:...ids)', { ids: candidateIds })
					.getMany();

				const msgBySessionId = new Map(msgs.map(m => [m.sessionId, m]));
				const ids: string[] = [];
				for (const id of candidateIds) {
					const msg = msgBySessionId.get(id);
					if (!msg) {
						// no messages at all
						ids.push(id);
						continue;
					}
					// exactly 1 message: only delete if it's an assistant greeting very close to session creation
					if (msg.role !== 'assistant') continue;
					const createdAt = createdAtById.get(id);
					if (!createdAt) continue;
					if (Math.abs(msg.createdAt.getTime() - createdAt.getTime()) <= GREETING_GRACE_MS) {
						ids.push(id);
					}
				}

				if (ids.length === 0) return;

				// Delete messages first to reduce FK churn; sessions have CASCADE, but explicit delete is clearer.
				await this.agentMessagesRepository.createQueryBuilder()
					.delete()
					.from('agent_message')
					.where('sessionId IN (:...ids)', { ids })
					.execute();

				await this.agentSessionsRepository.createQueryBuilder()
					.delete()
					.from('agent_session')
					.where('id IN (:...ids)', { ids })
					.execute();
			} finally {
				this.running = false;
			}
		};

		void tick();
		this.intervalId = setInterval(() => void tick(), CLEANUP_INTERVAL_MS);
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

