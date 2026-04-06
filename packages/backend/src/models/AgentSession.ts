/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Entity, Index, JoinColumn, Column, PrimaryColumn, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';
import { MiAgentCharacter } from './AgentCharacter.js';
import { MiAgentDialogueStyle } from './AgentDialogueStyle.js';

export const agentSessionKinds = ['draft_test', 'community'] as const;
export type AgentSessionKind = typeof agentSessionKinds[number];

@Entity('agent_session')
@Index(['userId', 'lastMessageAt'])
export class MiAgentSession {
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

	@Index()
	@Column({
		...id(),
	})
	public characterId: MiAgentCharacter['id'];

	@ManyToOne(() => MiAgentCharacter, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public character: MiAgentCharacter | null;

	@Column({
		...id(),
	})
	public dialogueStyleId: MiAgentDialogueStyle['id'];

	@ManyToOne(() => MiAgentDialogueStyle, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public dialogueStyle: MiAgentDialogueStyle | null;

	@Column({
		...id(),
	})
	public characterOwnerId: MiUser['id'];

	@Column('varchar', {
		length: 32,
	})
	public sessionKind: AgentSessionKind;

	/** 选用的 LLM 逻辑 id（对应 meta.agentLlmModels[].id），为空则用默认 */
	@Column('varchar', {
		length: 64, nullable: true,
	})
	public agentModelId: string | null;

	@Column('timestamp with time zone', {
		nullable: true,
	})
	public lastMessageAt: Date | null;

	/** 本会话是否使用阿里云百炼长期记忆（Add/Search） */
	@Column('boolean', {
		default: true,
	})
	public agentLongMemoryEnabled: boolean;

	@Column('integer', {
		default: 8,
	})
	public agentLongMemoryTopK: number;

	/** 语义检索最小分数 [0,1]，null 表示不传（由百炼默认） */
	@Column('double precision', {
		nullable: true,
	})
	public agentLongMemoryMinScore: number | null;

	@Column('integer', {
		default: 4000,
	})
	public agentLongMemoryInjectMaxChars: number;

	/** 写入记忆时上传的对话轮数；null 表示使用站点 meta.agentMem0AddMemoryMaxRounds */
	@Column('integer', {
		nullable: true,
	})
	public agentLongMemoryAddMaxRounds: number | null;

	/** 每多少轮对话触发一次 add 记忆；null 表示使用站点 meta.agentMem0AddMemoryEveryNRounds */
	@Column('integer', {
		nullable: true,
	})
	public agentLongMemoryAddEveryNRounds: number | null;

	/** 已写入用户消息、正在等待模型生成助手回复（用于刷新后恢复「等待中」） */
	@Column('boolean', {
		default: false,
	})
	public agentReplyPending: boolean;
}
