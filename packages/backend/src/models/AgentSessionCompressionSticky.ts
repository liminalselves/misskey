/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Entity, Index, JoinColumn, Column, PrimaryColumn, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiAgentSession } from './AgentSession.js';

export const agentCompressionStickyStates = [
	'queued',
	'compressing',
	'dormant',
	'active',
	'stale',
	'failed',
] as const;
export type AgentCompressionStickyState = typeof agentCompressionStickyStates[number];

@Entity('agent_session_compression_sticky')
@Index('IDX_acs_sticky_session_sort', ['sessionId', 'sortIndex'])
@Index('IDX_acs_sticky_session_fingerprint', ['sessionId', 'sourceFingerprint'], { unique: true, where: '("sourceFingerprint" IS NOT NULL)' })
export class MiAgentSessionCompressionSticky {
	@PrimaryColumn(id())
	public id: string;

	@Column('timestamp with time zone')
	public createdAt: Date;

	@Column('timestamp with time zone')
	public updatedAt: Date;

	@Index('IDX_acs_sticky_session')
	@Column({
		...id(),
	})
	public sessionId: MiAgentSession['id'];

	@ManyToOne(() => MiAgentSession, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ foreignKeyConstraintName: 'FK_acs_sticky_session' })
	public session: MiAgentSession | null;

	@Column({
		...id(),
	})
	public fromMessageId: string;

	@Column({
		...id(),
	})
	public toMessageId: string;

	@Column('text')
	public summaryText: string;

	@Column('varchar', {
		length: 32,
	})
	public state: AgentCompressionStickyState;

	@Column('boolean', {
		default: false,
	})
	public userOverridden: boolean;

	@Column('varchar', {
		length: 128, nullable: true,
	})
	public sourceFingerprint: string | null;

	@Column('text', {
		nullable: true,
	})
	public errorMessage: string | null;

	@Column('varchar', {
		length: 64, nullable: true,
	})
	public lastModelId: string | null;

	@Column('integer', {
		default: 0,
	})
	public sortIndex: number;

	@Column('integer', {
		default: 0,
	})
	public retryCount: number;
}
