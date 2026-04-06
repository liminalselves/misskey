/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Entity, Index, JoinColumn, Column, PrimaryColumn, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiAgentSession } from './AgentSession.js';

export const agentMessageRoles = ['user', 'assistant', 'system'] as const;
export type AgentMessageRole = typeof agentMessageRoles[number];

@Entity('agent_message')
@Index(['sessionId', 'createdAt'])
export class MiAgentMessage {
	@PrimaryColumn(id())
	public id: string;

	@Column('timestamp with time zone')
	public createdAt: Date;

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

	@Column('varchar', {
		length: 32,
	})
	public role: AgentMessageRole;

	@Column('text')
	public content: string;

	@Column('integer', {
		nullable: true,
	})
	public promptTokens: number | null;

	@Column('integer', {
		nullable: true,
	})
	public completionTokens: number | null;
}
