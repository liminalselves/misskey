/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Entity, Index, JoinColumn, Column, PrimaryColumn, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';
import { MiAgentSession } from './AgentSession.js';
import { MiAgentCharacter } from './AgentCharacter.js';
import { MiAgentDialogueStyle } from './AgentDialogueStyle.js';

export const agentExternalAuditStatuses = ['allow', 'block', 'failed', 'all_failed'] as const;
export type AgentExternalAuditStatus = typeof agentExternalAuditStatuses[number];

// api：请求阶段失败（URL 非法/超时/网络错误/HTTP 错误/响应体非 JSON）；parse：请求成功但回复内容缺失或无法解析为 allow|block JSON
export const agentExternalAuditFailureKinds = ['api', 'parse'] as const;
export type AgentExternalAuditFailureKind = typeof agentExternalAuditFailureKinds[number];

@Entity('agent_external_audit_log')
@Index('IDX_agent_external_audit_log_created_at', ['createdAt'])
@Index('IDX_agent_external_audit_log_model_created_at', ['createdAt', 'modelId'])
@Index('IDX_agent_external_audit_log_status_created_at', ['createdAt', 'status'])
@Index('IDX_agent_external_audit_log_block_code', ['blockCode'])
@Index('IDX_agent_external_audit_log_user_created_at', ['createdAt', 'userId'])
@Index('IDX_agent_external_audit_log_session_created_at', ['createdAt', 'sessionId'])
export class MiAgentExternalAuditLog {
	@PrimaryColumn(id())
	public id: string;

	@Column('timestamp with time zone')
	public createdAt: Date;

	@Column('timestamp with time zone', { nullable: true })
	public completedAt: Date | null;

	@Column('integer', { nullable: true })
	public durationMs: number | null;

	@Column({ ...id(), nullable: true })
	public userId: MiUser['id'] | null;

	@ManyToOne(() => MiUser, { onDelete: 'SET NULL', nullable: true })
	@JoinColumn({ foreignKeyConstraintName: 'FK_agent_external_audit_log_user' })
	public user: MiUser | null;

	@Column({ ...id(), nullable: true })
	public sessionId: MiAgentSession['id'] | null;

	@ManyToOne(() => MiAgentSession, { onDelete: 'SET NULL', nullable: true })
	@JoinColumn({ foreignKeyConstraintName: 'FK_agent_external_audit_log_session' })
	public session: MiAgentSession | null;

	@Column({ ...id(), nullable: true })
	public characterId: MiAgentCharacter['id'] | null;

	@ManyToOne(() => MiAgentCharacter, { onDelete: 'SET NULL', nullable: true })
	@JoinColumn({ foreignKeyConstraintName: 'FK_agent_external_audit_log_character' })
	public character: MiAgentCharacter | null;

	@Column({ ...id(), nullable: true })
	public dialogueStyleId: MiAgentDialogueStyle['id'] | null;

	@ManyToOne(() => MiAgentDialogueStyle, { onDelete: 'SET NULL', nullable: true })
	@JoinColumn({ foreignKeyConstraintName: 'FK_agent_external_audit_log_dialogue_style' })
	public dialogueStyle: MiAgentDialogueStyle | null;

	@Column('varchar', { length: 64, nullable: true })
	public modelId: string | null;

	@Column('varchar', { length: 256, nullable: true })
	public modelName: string | null;

	@Column('varchar', { length: 256, nullable: true })
	public apiModelName: string | null;

	@Column('varchar', { length: 512, nullable: true })
	public baseUrl: string | null;

	@Column('integer')
	public priority: number;

	@Column('integer')
	public attemptIndex: number;

	@Column('varchar', { length: 32 })
	public status: AgentExternalAuditStatus;

	@Column('varchar', { length: 64, nullable: true })
	public blockCode: string | null;

	@Column('varchar', { length: 128, nullable: true })
	public category: string | null;

	@Column('varchar', { length: 1024, nullable: true })
	public reason: string | null;

	@Column('double precision', { nullable: true })
	public confidence: number | null;

	@Column('text', { nullable: true })
	public userText: string | null;

	@Column('text', { nullable: true })
	public assistantText: string | null;

	@Column('text', { nullable: true })
	public responseText: string | null;

	/** 失败分类，仅 status = failed 时有值 */
	@Column('varchar', { length: 16, nullable: true })
	public failureKind: AgentExternalAuditFailureKind | null;

	@Column('varchar', { length: 128, nullable: true })
	public errorCode: string | null;

	@Column('varchar', { length: 1024, nullable: true })
	public errorMessage: string | null;

	/** 复审忽略时间，非 null 表示该记录已被管理员标记为误拦 */
	@Column('timestamp with time zone', { nullable: true })
	public reviewIgnoredAt: Date | null;

	/** 执行复审忽略操作的管理员 */
	@Column({ ...id(), nullable: true })
	public reviewIgnoredById: MiUser['id'] | null;
}
