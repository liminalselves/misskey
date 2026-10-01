/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Entity, Index, Column, PrimaryColumn, JoinColumn, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';

/**
 * 网盘文件删除后的墓碑记录：文件本体与 drive_file 行删除后，
 * 引用处（帖子/聊天/页面等）仍需要展示「已被清理」占位与归属者信息。
 * id 沿用被删文件的 aid，createdAt 由 id 解析，不再冗余存储。
 */
@Entity('drive_file_tombstone')
export class MiDriveFileTombstone {
	@PrimaryColumn(id())
	public id: string;

	@Index('IDX_drive_file_tombstone_user')
	@Column({
		...id(),
		nullable: true,
		comment: 'The owner ID of the deleted file.',
	})
	public userId: MiUser['id'] | null;

	@ManyToOne(() => MiUser, { onDelete: 'CASCADE' })
	@JoinColumn({ foreignKeyConstraintName: 'FK_drive_file_tombstone_user' })
	public user: MiUser | null;

	@Column('varchar', {
		length: 128, nullable: true,
		comment: 'The host of owner. It will be null if the user in local.',
	})
	public userHost: string | null;

	@Column('varchar', {
		length: 256,
		comment: 'The file name of the deleted DriveFile.',
	})
	public name: string;

	@Column('varchar', {
		length: 128,
		comment: 'The content type (MIME) of the deleted DriveFile.',
	})
	public type: string;

	@Column('integer', {
		comment: 'The file size (bytes) of the deleted DriveFile.',
	})
	public size: number;

	@Column('jsonb', {
		default: {},
		comment: 'Snapshot of public properties (width/height/orientation) for placeholder layout.',
	})
	public properties: { width?: number; height?: number; orientation?: number };

	@Column('timestamp with time zone')
	public deletedAt: Date;

	constructor(data: Partial<MiDriveFileTombstone>) {
		if (data == null) return;
		for (const [k, v] of Object.entries(data)) {
			(this as any)[k] = v;
		}
	}
}
