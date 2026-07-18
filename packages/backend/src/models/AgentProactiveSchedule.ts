/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Entity, Index, JoinColumn, Column, PrimaryColumn, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiAgentSession } from './AgentSession.js';

export const agentProactiveScheduleStatuses = ['active', 'paused', 'completed', 'cancelled'] as const;
export type AgentProactiveScheduleStatus = typeof agentProactiveScheduleStatuses[number];

export type AgentProactiveScheduleTrigger =
	| {
		type: 'once';
		at: string;
	}
	| {
		type: 'recurring';
		cron: string;
		repeat: { mode: 'count'; count: number } | { mode: 'unlimited' };
	};

@Entity('agent_proactive_schedule')
@Index(['sessionId', 'status', 'nextRunAt'])
export class MiAgentProactiveSchedule {
	@PrimaryColumn(id())
	public id: string;

	@Index()
	@Column({
		...id(),
	})
	public sessionId: MiAgentSession['id'];

	@ManyToOne(() => MiAgentSession, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public session: MiAgentSession | null;

	@Column('timestamp with time zone')
	public createdAt: Date;

	@Column('timestamp with time zone')
	public updatedAt: Date;

	@Column('varchar', {
		length: 32,
		default: 'active',
	})
	public status: AgentProactiveScheduleStatus;

	@Column('varchar', {
		length: 80,
	})
	public description: string;

	@Column('jsonb')
	public trigger: AgentProactiveScheduleTrigger;

	@Column('timestamp with time zone', {
		nullable: true,
	})
	public nextRunAt: Date | null;

	@Column('timestamp with time zone', {
		nullable: true,
	})
	public lastRunAt: Date | null;

	/** Null means unlimited; finite schedules include the next execution. */
	@Column('integer', {
		nullable: true,
	})
	public remainingRuns: number | null;
}
