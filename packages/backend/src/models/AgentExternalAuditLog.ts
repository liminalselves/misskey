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

@Entity('agent_external_audit_log')
@Index(['createdAt'])
@Index(['modelId', 'createdAt'])
@Index(['status', 'createdAt'])
@Index(['blockCode'])
@Index(['userId', 'createdAt'])
@Index(['sessionId', 'createdAt'])
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
	@JoinColumn()
	public user: MiUser | null;

	@Column({ ...id(), nullable: true })
	public sessionId: MiAgentSession['id'] | null;

	@ManyToOne(() => MiAgentSession, { onDelete: 'SET NULL', nullable: true })
	@JoinColumn()
	public session: MiAgentSession | null;

	@Column({ ...id(), nullable: true })
	public characterId: MiAgentCharacter['id'] | null;

	@ManyToOne(() => MiAgentCharacter, { onDelete: 'SET NULL', nullable: true })
	@JoinColumn()
	public character: MiAgentCharacter | null;

	@Column({ ...id(), nullable: true })
	public dialogueStyleId: MiAgentDialogueStyle['id'] | null;

	@ManyToOne(() => MiAgentDialogueStyle, { onDelete: 'SET NULL', nullable: true })
	@JoinColumn()
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

	@Column('varchar', { length: 128, nullable: true })
	public errorCode: string | null;

	@Column('varchar', { length: 1024, nullable: true })
	public errorMessage: string | null;
}
