/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Entity, Index, Column, PrimaryColumn, JoinColumn, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiDriveFile } from './DriveFile.js';

export const driveMissingObjectScopes = ['current', 'legacy'] as const;
export type DriveMissingObjectScope = typeof driveMissingObjectScopes[number];

/**
 * 对象存储里已确认缺失、等待管理员审查删除的网盘文件。
 * 一个文件最多一行；行存在即「待审」，文件被删除后随外键级联消失，对象恢复时由服务删除。
 */
@Entity('drive_missing_object_report')
@Index('IDX_drive_missing_object_report_last', ['lastReportedAt'])
export class MiDriveMissingObjectReport {
	@PrimaryColumn(id())
	public id: string;

	@Index('IDX_drive_missing_object_report_file', { unique: true })
	@Column({ ...id() })
	public fileId: MiDriveFile['id'];

	// 使用 ManyToOne + 唯一索引 IDX_drive_missing_object_report_file 实现 1:1 约束，
	// 避免 @OneToOne 额外生成与迁移不一致的 REL_* 唯一约束。
	@ManyToOne(() => MiDriveFile, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'fileId', foreignKeyConstraintName: 'FK_drive_missing_object_report_file' })
	public file: MiDriveFile | null;

	@Column('varchar', {
		length: 256,
		comment: 'The bucket the missing object was expected in, at verification time.',
	})
	public bucket: string;

	@Column('varchar', {
		length: 1024,
		comment: 'The object key that was verified missing.',
	})
	public objectKey: string;

	@Column('varchar', {
		length: 16,
		comment: 'current: object belongs to the configured bucket; legacy: a previous bucket on the same endpoint.',
	})
	public scope: DriveMissingObjectScope;

	@Column('integer', {
		default: 1,
		comment: 'How many times a missing object was verified for this file.',
	})
	public reportCount: number;

	@Column('timestamp with time zone')
	public firstReportedAt: Date;

	@Column('timestamp with time zone')
	public lastReportedAt: Date;

	@Column('timestamp with time zone', {
		comment: 'The last time the server itself confirmed the object missing.',
	})
	public verifiedAt: Date;

	constructor(data?: Partial<MiDriveMissingObjectReport>) {
		if (data == null) return;
		Object.assign(this, data);
	}
}
