/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Entity, Index, Column, PrimaryColumn, JoinColumn, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';

export const agentModelUsageStatuses = ['success', 'failed', 'aborted'] as const;
export type AgentModelUsageStatus = typeof agentModelUsageStatuses[number];

export const agentModelUsageKinds = ['chat', 'compression', 'image_generation', 'vision', 'proactive_random', 'proactive_scheduled', 'checkin'] as const;
export type AgentModelUsageKind = typeof agentModelUsageKinds[number];

@Entity('agent_model_usage_log')
@Index('IDX_agent_model_usage_log_user_time', ['requestedAt', 'userId'])
@Index('IDX_agent_model_usage_log_time', ['requestedAt'])
@Index('IDX_agent_model_usage_log_model_time', ['modelId', 'requestedAt'])
@Index('IDX_agent_model_usage_log_status_time', ['requestedAt', 'status'])
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

	/** chat：主对话；compression：压缩便签侧车；image_generation：智能体生图；proactive_*：主动消息 */
	@Column('varchar', { length: 32, default: 'chat' })
	public usageKind: AgentModelUsageKind;

	@Column('varchar', { length: 128, nullable: true })
	public errorCode: string | null;

	@Column('double precision', { default: 0 })
	public cost: number;

	@Column('integer', { nullable: true })
	public promptTokens: number | null;

	@Column('integer', { nullable: true })
	public completionTokens: number | null;

	/** 本条调用是否消耗了每日免费额度（快照，入库后不可变） */
	@Column('boolean', { nullable: true, default: null })
	public usedFreeQuota: boolean | null;

	/** 截至本条调用（含）该用户对该模型当日已消耗的免费次数（最小 1） */
	@Column('integer', { nullable: true, default: null })
	public freeQuotaUsedAtCall: number | null;

	/** 调用时刻模型配置的每日免费总次数快照 */
	@Column('integer', { nullable: true, default: null })
	public freeQuotaTotalAtCall: number | null;
}
