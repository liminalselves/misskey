/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Entity, Index, Column, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';
import { MiAgentDialogueStyle } from './AgentDialogueStyle.js';

@Entity('agent_user_style_subscription')
@Index('IDX_agent_style_sub_style', ['styleId'])
export class MiAgentUserStyleSubscription {
	@PrimaryColumn({
		...id(),
	})
	public userId: MiUser['id'];

	@ManyToOne(() => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public user: MiUser | null;

	@PrimaryColumn({
		...id(),
	})
	public styleId: MiAgentDialogueStyle['id'];

	@ManyToOne(() => MiAgentDialogueStyle, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public style: MiAgentDialogueStyle | null;

	@Column('timestamp with time zone')
	public createdAt: Date;
}
