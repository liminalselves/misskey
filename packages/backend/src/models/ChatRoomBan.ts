/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, JoinColumn, Column, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';
import { MiChatRoom } from './ChatRoom.js';

@Entity('chat_room_ban')
@Index('IDX_chat_room_ban_room_user', ['roomId', 'userId'], { unique: true })
@Index('IDX_chat_room_ban_room', ['roomId'])
@Index('IDX_chat_room_ban_user', ['userId'])
export class MiChatRoomBan {
	@PrimaryColumn(id())
	public id: string;

	@Column('timestamp with time zone', {
		comment: 'The created date of the ChatRoomBan.',
	})
	public createdAt: Date;

	@Column({
		...id(),
		comment: 'The ID of the banned room.',
	})
	public roomId: MiChatRoom['id'];

	@ManyToOne(() => MiChatRoom, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'roomId', foreignKeyConstraintName: 'FK_chat_room_ban_room' })
	public room: MiChatRoom | null;

	@Column({
		...id(),
		comment: 'The ID of the banned user.',
	})
	public userId: MiUser['id'];

	@ManyToOne(() => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'userId', foreignKeyConstraintName: 'FK_chat_room_ban_user' })
	public user: MiUser | null;

	@Column({
		...id(),
		nullable: true,
		comment: 'The ID of the user who banned the target user.',
	})
	public bannedById: MiUser['id'] | null;

	@ManyToOne(() => MiUser, {
		onDelete: 'SET NULL',
	})
	@JoinColumn({ name: 'bannedById', foreignKeyConstraintName: 'FK_chat_room_ban_bannedBy' })
	public bannedBy: MiUser | null;

	@Column('varchar', {
		length: 256,
		nullable: true,
		comment: 'The reason for the ban.',
	})
	public reason: string | null;
}
