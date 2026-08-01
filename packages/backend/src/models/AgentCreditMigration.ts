/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Entity, Index, Column, PrimaryColumn, JoinColumn, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';

@Entity('agent_credit_migration')
@Index('IDX_agent_credit_migration_createdAt', ['createdAt'])
@Index('IDX_agent_credit_migration_requestId', ['requestId'], { unique: true, where: '"requestId" IS NOT NULL' })
export class MiAgentCreditMigration {
	@PrimaryColumn(id())
	public id: string;

	@Column('timestamp with time zone')
	public createdAt: Date;

	@Index('IDX_agent_credit_migration_targetUserId')
	@Column({ ...id() })
	public targetUserId: MiUser['id'];

	@ManyToOne(() => MiUser, { onDelete: 'CASCADE' })
	@JoinColumn({ foreignKeyConstraintName: 'FK_agent_credit_migration_target_user' })
	public targetUser: MiUser | null;

	@Column('double precision')
	public amount: number;

	@Column('varchar', { length: 128, nullable: true })
	public requestId: string | null;

	@Column('varchar', { length: 512, nullable: true })
	public sourceInfo: string | null;

	@Column({ ...id() })
	public operatorId: MiUser['id'];

	@ManyToOne(() => MiUser, { onDelete: 'CASCADE' })
	@JoinColumn({ foreignKeyConstraintName: 'FK_agent_credit_migration_operator' })
	public operator: MiUser | null;

	@Column('varchar', { length: 16, default: 'success' })
	public status: string;

	@Column('varchar', { length: 512, nullable: true })
	public failReason: string | null;

	constructor(data: Partial<MiAgentCreditMigration>) {
		if (data == null) return;
		for (const [k, v] of Object.entries(data)) {
			(this as any)[k] = v;
		}
	}
}
