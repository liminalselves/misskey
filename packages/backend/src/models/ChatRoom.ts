/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, JoinColumn, Column, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';
import { MiChatMessage } from './ChatMessage.js';

@Entity('chat_room')
export class MiChatRoom {
	@PrimaryColumn(id())
	public id: string;

	@Column('varchar', {
		length: 256,
	})
	public name: string;

	@Index()
	@Column({
		...id(),
	})
	public ownerId: MiUser['id'];

	@ManyToOne(() => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public owner: MiUser | null;

	@Column('varchar', {
		length: 2048, default: '',
	})
	public description: string;

	@Column('varchar', {
		length: 1024, nullable: true,
	})
	public iconUrl: string | null;

	@Column('boolean', {
		default: false,
	})
	public isArchived: boolean;

	@Column('boolean', {
		default: false,
	})
	public isPublic: boolean;

	@Column('boolean', {
		default: false,
		comment: 'Whether regular members can invite others to the room.',
	})
	public allowMemberInvite: boolean;

	@Column('varchar', {
		length: 2048,
		nullable: true,
		comment: 'Announcement text displayed in the room.',
	})
	public announcement: string | null;

	@Column({
		...id(),
		nullable: true,
		comment: 'The ID of the pinned message in this room.',
	})
	public pinnedMessageId: MiChatMessage['id'] | null;

	@ManyToOne(() => MiChatMessage, {
		onDelete: 'SET NULL',
	})
	@JoinColumn({ name: 'pinnedMessageId', foreignKeyConstraintName: 'FK_chat_room_pinnedMessageId' })
	public pinnedMessage: MiChatMessage | null;
}
