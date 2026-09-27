/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Entity, Index, Column, PrimaryColumn, JoinColumn, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';

export const agentModelReportReasonTypes = ['unavailable', 'degraded', 'slow', 'errors', 'other'] as const;
export type AgentModelReportReasonType = typeof agentModelReportReasonTypes[number];

export const agentModelReportKinds = ['chat', 'image'] as const;
export type AgentModelReportKind = typeof agentModelReportKinds[number];

/** 用户上报的模型异常：modelId/modelName 为上报时快照，不关联具体模型表 */
@Entity('agent_model_report')
@Index('IDX_agent_model_report_user', ['userId'])
@Index('IDX_agent_model_report_model_time', ['modelId', 'createdAt'])
@Index('IDX_agent_model_report_time', ['createdAt'])
@Index('IDX_agent_model_report_resolved_time', ['resolvedAt', 'createdAt'])
export class MiAgentModelReport {
	@PrimaryColumn(id())
	public id: string;

	@Column('timestamp with time zone')
	public createdAt: Date;

	@Column('timestamp with time zone')
	public updatedAt: Date;

	@Column({ ...id() })
	public userId: MiUser['id'];

	@ManyToOne(() => MiUser, { onDelete: 'CASCADE' })
	@JoinColumn({ foreignKeyConstraintName: 'FK_agent_model_report_user' })
	public user: MiUser | null;

	@Column('varchar', { length: 16 })
	public modelKind: AgentModelReportKind;

	@Column('varchar', { length: 64 })
	public modelId: string;

	@Column('varchar', { length: 256 })
	public modelName: string;

	@Column('varchar', { length: 32 })
	public reasonType: AgentModelReportReasonType;

	/** 仅 reasonType 为 other 时填写，其他类型为 null */
	@Column('varchar', { length: 1024, nullable: true })
	public comment: string | null;

	@Column('timestamp with time zone', { nullable: true })
	public resolvedAt: Date | null;

	@Column({ ...id(), nullable: true })
	public resolvedByUserId: MiUser['id'] | null;

	@Column('varchar', { length: 2000, nullable: true })
	public resolutionMessage: string | null;

	constructor(data: Partial<MiAgentModelReport>) {
		if (data == null) return;
		for (const [k, v] of Object.entries(data)) {
			(this as any)[k] = v;
		}
	}
}
