/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, JoinColumn, Column, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';

@Entity('mobile_push_device')
@Index('UQ_mobile_push_device_user_device', ['userId', 'deviceId'], { unique: true })
export class MiMobilePushDevice {
	@PrimaryColumn(id())
	public id: string;

	@Index('IDX_mobile_push_device_userId')
	@Column(id())
	public userId: MiUser['id'];

	@ManyToOne(() => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({
		name: 'userId',
		foreignKeyConstraintName: 'FK_mobile_push_device_user',
	})
	public user: MiUser | null;

	@Column('varchar', {
		length: 256,
	})
	public deviceId: string;

	/** aliyun: android | ios */
	@Column('varchar', {
		length: 16,
	})
	public platform: string;

	@Column('timestamp with time zone', {
		default: () => 'CURRENT_TIMESTAMP',
	})
	public createdAt: Date;
}
