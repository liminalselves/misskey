/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Entity, Index, Column, PrimaryColumn, Check, Unique, ManyToOne, JoinColumn } from 'typeorm';
import { id } from './util/id.js';
import type { MiUser } from './User.js';
import { MiNote } from './Note.js';
import type { MiAgentCharacter } from './AgentCharacter.js';
import type { MiAgentDialogueStyle } from './AgentDialogueStyle.js';

/** 广场评价：绑定一条普通 Note（留言）与星级；删除 Note 时级联删除本行。 */
@Entity('agent_plaza_review')
@Index('IDX_agent_plaza_review_character', ['characterId'])
@Index('IDX_agent_plaza_review_style', ['styleId'])
@Index('UQ_agent_plaza_review_user_character', ['characterId', 'userId'], { unique: true, where: '("characterId" IS NOT NULL)' })
@Index('UQ_agent_plaza_review_user_style', ['styleId', 'userId'], { unique: true, where: '("styleId" IS NOT NULL)' })
@Unique('UQ_agent_plaza_review_noteId', ['noteId'])
@Check('CHK_agent_plaza_review_target', `(("characterId" IS NOT NULL) AND ("styleId" IS NULL)) OR (("characterId" IS NULL) AND ("styleId" IS NOT NULL))`)
@Check('CHK_agent_plaza_review_stars', `("stars" >= 0) AND ("stars" <= 5)`)
export class MiAgentPlazaReview {
	@PrimaryColumn({
		...id(),
	})
	public id: string;

	@Column({
		...id(),
	})
	public noteId: MiNote['id'];

	@ManyToOne(() => MiNote, { onDelete: 'CASCADE' })
	@JoinColumn({ foreignKeyConstraintName: 'FK_agent_plaza_review_note' })
	public note: MiNote | null;

	@Column({
		...id(),
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

	@Column('smallint')
	public stars: number;

	constructor(data: Partial<MiAgentPlazaReview>) {
		if (data == null) return;
		for (const [k, v] of Object.entries(data)) {
			(this as any)[k] = v;
		}
	}
}
