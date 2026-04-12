/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Entity, Index, Column, PrimaryColumn } from 'typeorm';
import { id } from './util/id.js';
import type { MiUser } from './User.js';
import type { MiNote } from './Note.js';
import type { MiAgentCharacter } from './AgentCharacter.js';
import type { MiAgentDialogueStyle } from './AgentDialogueStyle.js';

/** 广场评价：绑定一条普通 Note（留言）与星级；删除 Note 时级联删除本行。 */
@Entity('agent_plaza_review')
@Index(['characterId'])
@Index(['styleId'])
export class MiAgentPlazaReview {
	@PrimaryColumn({
		...id(),
	})
	public id: string;

	@Index({ unique: true })
	@Column({
		...id(),
		comment: 'Linked Misskey note (review comment body).',
	})
	public noteId: MiNote['id'];

	@Column({
		...id(),
		comment: 'Author of the review (denormalized from note.userId).',
	})
	public userId: MiUser['id'];

	@Column({
		...id(),
		nullable: true,
	})
	public characterId: MiAgentCharacter['id'] | null;

	@Column({
		...id(),
		nullable: true,
	})
	public styleId: MiAgentDialogueStyle['id'] | null;

	@Column('smallint', {
		comment: '0–5 stars.',
	})
	public stars: number;

	constructor(data: Partial<MiAgentPlazaReview>) {
		if (data == null) return;
		for (const [k, v] of Object.entries(data)) {
			(this as any)[k] = v;
		}
	}
}
