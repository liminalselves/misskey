/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Entity, Index, JoinColumn, Column, PrimaryColumn, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';
import { MiAgentSession } from './AgentSession.js';
import { MiAgentMessage } from './AgentMessage.js';
import type { MiAgentCharacter } from './AgentCharacter.js';
import type { MiAgentDialogueStyle } from './AgentDialogueStyle.js';
import type { MiDriveFile } from './DriveFile.js';
import type { MiAgentImageProvider } from './Meta.js';

export const agentImageGenerationStatuses = ['pending', 'generating', 'succeeded', 'failed', 'blocked', 'deleted', 'auto_cleaned'] as const;
export type AgentImageGenerationStatus = typeof agentImageGenerationStatuses[number];

@Entity('agent_image_generation')
@Index(['messageId', 'placeholderIndex'])
@Index(['userId', 'createdAt'])
@Index(['status', 'createdAt'])
@Index(['isBlocked', 'createdAt'])
export class MiAgentImageGeneration {
	@PrimaryColumn(id())
	public id: string;

	@Column('timestamp with time zone')
	public createdAt: Date;

	@Column('timestamp with time zone')
	public updatedAt: Date;

	@Column({ ...id() })
	public userId: MiUser['id'];

	@ManyToOne(() => MiUser, { onDelete: 'CASCADE' })
	@JoinColumn()
	public user: MiUser | null;

	@Column({ ...id() })
	public sessionId: MiAgentSession['id'];

	@ManyToOne(() => MiAgentSession, { onDelete: 'CASCADE' })
	@JoinColumn()
	public session: MiAgentSession | null;

	@Column({ ...id(), nullable: true })
	public messageId: MiAgentMessage['id'] | null;

	@ManyToOne(() => MiAgentMessage, { onDelete: 'CASCADE', nullable: true })
	@JoinColumn()
	public message: MiAgentMessage | null;

	@Column({ ...id(), nullable: true })
	public characterId: MiAgentCharacter['id'] | null;

	@Column({ ...id(), nullable: true })
	public dialogueStyleId: MiAgentDialogueStyle['id'] | null;

	@Column('integer')
	public placeholderIndex: number;

	@Column('text')
	public tag: string;

	@Column('varchar', { length: 16 })
	public size: 'portrait' | 'landscape' | 'square';

	@Column('varchar', { length: 32 })
	public provider: MiAgentImageProvider;

	@Column('varchar', { length: 128 })
	public imageModelId: string;

	@Column('varchar', { length: 32 })
	public status: AgentImageGenerationStatus;

	@Column({ ...id(), nullable: true })
	public fileId: MiDriveFile['id'] | null;

	@Column('varchar', { length: 1024, nullable: true })
	public url: string | null;

	@Column('varchar', { length: 128, nullable: true })
	public errorCode: string | null;

	/** Sanitized upstream diagnostic shown to the requesting user after a generation failure. */
	@Column('varchar', { length: 768, nullable: true })
	public errorMessage: string | null;

	@Column('double precision', { default: 0 })
	public cost: number;

	@Column({ ...id(), nullable: true })
	public regenerationOfId: MiAgentImageGeneration['id'] | null;

	@Column('boolean', { default: false })
	public isBlocked: boolean;

	@Column('varchar', { length: 256, nullable: true })
	public blockedReason: string | null;

	@Column({ ...id(), nullable: true })
	public blockedByUserId: MiUser['id'] | null;

	@Column('timestamp with time zone', { nullable: true })
	public blockedAt: Date | null;

	@Column('timestamp with time zone', { nullable: true })
	public autoCleanedAt: Date | null;

	@Column('varchar', { length: 128, nullable: true })
	public autoCleanedReason: string | null;
}
