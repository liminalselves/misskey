/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Column, Entity, PrimaryColumn } from 'typeorm';
import { id } from './util/id.js';

export const agentModelAnnouncementScopes = ['all', 'chat', 'image'] as const;
export type AgentModelAnnouncementScope = typeof agentModelAnnouncementScopes[number];

export type AgentModelChange = {
	kind: 'chat' | 'image';
	modelId: string;
	modelName: string;
	type: 'added' | 'relisted' | 'removed' | 'modified';
	fields: { label: string; before: string; after: string }[];
};

@Entity('agent_model_announcement')
export class MiAgentModelAnnouncement {
	@PrimaryColumn({ ...id(), primaryKeyConstraintName: 'PK_agent_model_announcement' })
	public id: string;

	@Column('timestamp with time zone')
	public createdAt: Date;

	@Column('varchar', { length: 16 })
	public scope: AgentModelAnnouncementScope;

	@Column('varchar', { length: 256 })
	public title: string;

	@Column('text')
	public text: string;

	@Column('jsonb', { default: () => "'[]'::jsonb" })
	public changes: AgentModelChange[];

	constructor(data: Partial<MiAgentModelAnnouncement>) {
		if (data == null) return;
		Object.assign(this, data);
	}
}
