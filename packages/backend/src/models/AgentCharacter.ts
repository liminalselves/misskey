/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Entity, Index, JoinColumn, Column, PrimaryColumn, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';
import type { MiDriveFile } from './DriveFile.js';

@Entity('agent_character')
@Index(['isPublished', 'updatedAt'])
export class MiAgentCharacter {
	@PrimaryColumn(id())
	public id: string;

	@Column('timestamp with time zone')
	public createdAt: Date;

	@Column('timestamp with time zone')
	public updatedAt: Date;

	@Index()
	@Column({
		...id(),
	})
	public userId: MiUser['id'];

	@ManyToOne(() => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public user: MiUser | null;

	@Column('varchar', {
		length: 256,
	})
	public name: string;

	@Column('varchar', {
		length: 512, nullable: true,
	})
	public summary: string | null;

	@Column('text', { default: '' })
	public personality: string;

	@Column('text', { default: '' })
	public background: string;

	@Column('text', { default: '' })
	public speakingStyle: string;

	@Column('text', { default: '' })
	public greeting: string;

	@Column('text', { default: '' })
	public exampleDialogue: string;

	@Column('text', { default: '' })
	public forbiddenBehavior: string;

	/** 角色专属世界书与版本元数据的统一存储，第一版先用 JSON 承载，后续可拆表。 */
	@Column('jsonb', {
		default: () => "'[]'::jsonb",
	})
	public worldbook: Array<Record<string, unknown>>;

	/** Character-local regular-expression filters applied to chat display and LLM context. */
	@Column('jsonb', {
		default: () => "'[]'::jsonb",
	})
	public regexRules: Array<Record<string, unknown>>;

	@Column('integer', {
		default: 1,
	})
	public draftRevision: number;

	@Column('boolean', {
		default: false,
	})
	public isPublished: boolean;

	@Column('varchar', {
		length: 32,
		default: 'draft',
	})
	public reviewStatus: string;

	@Column('integer', {
		nullable: true,
	})
	public publishedVersion: number | null;

	@Column('jsonb', {
		nullable: true,
	})
	public publishedSnapshot: Record<string, unknown> | null;

	@Column('varchar', {
		length: 64, nullable: true,
	})
	public reviewRejectReason: string | null;

	@Column('text', {
		nullable: true,
	})
	public reviewRejectMessage: string | null;

	@Column('text', {
		nullable: true,
	})
	public reviewInternalNote: string | null;

	@Column({
		...id(),
		nullable: true,
	})
	public avatarFileId: MiDriveFile['id'] | null;

	@Column({
		...id(),
		nullable: true,
	})
	public referenceImageFileId: MiDriveFile['id'] | null;

	/** Up to four default reference images used by compatible image-generation models. */
	@Column('jsonb', {
		default: () => "'[]'::jsonb",
	})
	public referenceImageFileIds: MiDriveFile['id'][];

	/** 管理封禁：无法以此角色新建会话，且其下已有会话均不可用 */
	@Column('boolean', {
		default: false,
	})
	public moderationBanned: boolean;

	/** 作者主动开源完整提示词；为 true 时详情与广场详情返回完整正文 */
	@Column('boolean', {
		default: false,
	})
	public promptOpenSourced: boolean;
}
