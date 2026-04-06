/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Entity, Index, JoinColumn, Column, PrimaryColumn, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';

@Entity('agent_dialogue_style')
@Index(['isPublished', 'updatedAt'])
export class MiAgentDialogueStyle {
	@PrimaryColumn(id())
	public id: string;

	@Column('timestamp with time zone')
	public createdAt: Date;

	@Column('timestamp with time zone')
	public updatedAt: Date;

	@Index()
	@Column({
		...id(),
	})
	public userId: MiUser['id'];

	@ManyToOne(() => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public user: MiUser | null;

	@Column('varchar', {
		length: 256,
	})
	public name: string;

	@Column('text', { default: '' })
	public body: string;

	@Column('varchar', {
		length: 512, nullable: true,
	})
	public summary: string | null;

	@Column('boolean', {
		default: false,
	})
	public isPublished: boolean;

	@Column('varchar', {
		length: 32,
		default: 'draft',
	})
	public reviewStatus: string;

	@Column('integer', {
		nullable: true,
	})
	public publishedVersion: number | null;

	@Column('jsonb', {
		nullable: true,
	})
	public publishedSnapshot: Record<string, unknown> | null;
}
