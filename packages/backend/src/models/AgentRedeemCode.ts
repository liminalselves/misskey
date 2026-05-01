/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Entity, Index, Column, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';

@Entity('agent_redeem_code')
@Index(['createdAt'])
export class MiAgentRedeemCode {
	@PrimaryColumn(id())
	public id: string;

	@Column('timestamp with time zone')
	public createdAt: Date;

	@Index({ unique: true })
	@Column('varchar', { length: 32 })
	public code: string;

	@Column('double precision')
	public creditAmount: number;

	@Column('varchar', { length: 256, default: '' })
	public note: string;

	@Column({ ...id() })
	public createdById: MiUser['id'];

	@ManyToOne(() => MiUser, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'createdById' })
	public createdBy: MiUser | null;

	@Column('timestamp with time zone', { nullable: true })
	public expiresAt: Date | null;

	@Column('timestamp with time zone', { nullable: true })
	public redeemedAt: Date | null;

	@Index()
	@Column({ ...id(), nullable: true })
	public redeemedById: MiUser['id'] | null;

	@ManyToOne(() => MiUser, { onDelete: 'SET NULL', nullable: true })
	@JoinColumn({ name: 'redeemedById' })
	public redeemedBy: MiUser | null;

	@Column('boolean', { default: false })
	public revoked: boolean;
}
