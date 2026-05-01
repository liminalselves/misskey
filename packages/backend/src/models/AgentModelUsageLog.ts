/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Entity, Index, Column, PrimaryColumn, JoinColumn, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';

export const agentModelUsageStatuses = ['success', 'failed', 'aborted'] as const;
export type AgentModelUsageStatus = typeof agentModelUsageStatuses[number];

export const agentModelUsageKinds = ['chat', 'compression'] as const;
export type AgentModelUsageKind = typeof agentModelUsageKinds[number];

@Entity('agent_model_usage_log')
@Index(['userId', 'requestedAt'])
@Index(['requestedAt'])
@Index(['modelId', 'requestedAt'])
@Index(['status', 'requestedAt'])
export class MiAgentModelUsageLog {
	@PrimaryColumn(id())
	public id: string;

	@Column('timestamp with time zone')
	public requestedAt: Date;

	@Column('timestamp with time zone', { nullable: true })
	public completedAt: Date | null;

	@Column('integer', { nullable: true })
	public durationMs: number | null;

	@Column({ ...id() })
	public userId: MiUser['id'];

	@ManyToOne(() => MiUser, { onDelete: 'CASCADE' })
	@JoinColumn()
	public user: MiUser | null;

	@Column({ ...id(), nullable: true })
	public sessionId: string | null;

	@Column({ ...id(), nullable: true })
	public characterId: string | null;

	@Column({ ...id(), nullable: true })
	public dialogueStyleId: string | null;

	@Column('varchar', { length: 64, nullable: true })
	public modelId: string | null;

	@Column('varchar', { length: 256, nullable: true })
	public modelApiName: string | null;

	@Column('varchar', { length: 16 })
	public status: AgentModelUsageStatus;

	/** chat：主对话；compression：压缩便签侧车 */
	@Column('varchar', { length: 16, default: 'chat' })
	public usageKind: AgentModelUsageKind;

	@Column('varchar', { length: 128, nullable: true })
	public errorCode: string | null;

	@Column('double precision', { default: 0 })
	public cost: number;

	@Column('integer', { nullable: true })
	public promptTokens: number | null;

	@Column('integer', { nullable: true })
	public completionTokens: number | null;
}
