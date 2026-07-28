/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Entity, Index, Column, PrimaryColumn } from 'typeorm';
import { id } from './util/id.js';
import type { MiUser } from './User.js';

/**
 * 角色 / 风格的「已上线版本」历史归档。每当审核通过（resolve approve）使 publishedVersion 递增时，
 * 写入一条不可变的版本快照，用于查看历史版本与回滚到任意历史版本（而不仅是最新发布版）。
 */
@Entity('agent_published_version')
@Index('IDX_agent_published_version_kind_target_version', ['kind', 'targetId', 'version'], { unique: true })
@Index('IDX_agent_published_version_kind_target_created', ['createdAt', 'kind', 'targetId'])
export class MiAgentPublishedVersion {
	@PrimaryColumn({
		...id(),
	})
	public id: string;

	@Column('timestamp with time zone')
	public createdAt: Date;

	@Column('varchar', {
		length: 32,
	})
	public kind: string;

	@Column('varchar', {
		length: 32,
	})
	public targetId: string;

	@Column({
		...id(),
	})
	public userId: MiUser['id'];

	@Column('integer')
	public version: number;

	@Column('jsonb')
	public snapshot: Record<string, unknown>;

	constructor(data: Partial<MiAgentPublishedVersion>) {
		if (data == null) return;
		for (const [k, v] of Object.entries(data)) {
			(this as any)[k] = v;
		}
	}
}
