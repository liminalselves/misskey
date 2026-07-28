/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Entity, Index, Column, PrimaryColumn, JoinColumn, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';

@Entity('agent_checkin_record')
@Index('IDX_agent_checkin_record_userId_date', ['date', 'userId'])
@Index('IDX_agent_checkin_record_userId_date_unique', ['date', 'userId'], { unique: true })
export class MiAgentCheckinRecord {
	@PrimaryColumn(id())
	public id: string;

	@Column({ ...id() })
	public userId: MiUser['id'];

	@ManyToOne(() => MiUser, { onDelete: 'CASCADE' })
	@JoinColumn({ foreignKeyConstraintName: 'FK_agent_checkin_record_user' })
	public user: MiUser | null;

	/** 北京时间 yyyy-MM-dd */
	@Column('varchar', { length: 10 })
	public date: string;

	/** 实际入账额度（2位小数）；补签时为 0 */
	@Column('double precision', { default: 0 })
	public reward: number;

	/** 签到时的连续天数 */
	@Column('integer')
	public streakAtCheckin: number;

	/** 手气值（加权随机基础额度） */
	@Column('double precision')
	public baseValue: number;

	/** 连续倍率快照 */
	@Column('double precision')
	public streakMultiplier: number;

	/** 身份组倍率快照 */
	@Column('double precision')
	public roleMultiplier: number;

	/** 节日倍率快照 */
	@Column('double precision')
	public dayMultiplier: number;

	/** 是否补签 */
	@Column('boolean', { default: false })
	public isMakeup: boolean;

	/** 补签消耗额度（补签时 > 0） */
	@Column('double precision', { nullable: true, default: null })
	public makeupCost: number | null;

	@Column('timestamp with time zone')
	public createdAt: Date;
}
