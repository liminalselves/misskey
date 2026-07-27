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
		nullable: true,
	})
	public dialogueStyleId: MiAgentDialogueStyle['id'] | null;

	/**
	 * 広場統計用：セッション作成時の会話スタイル。ユーザーが後から切り替えても更新しない。
	 */
	@Column({
		...id(),
		nullable: true,
	})
	public plazaStatsDialogueStyleId: MiAgentDialogueStyle['id'] | null;

	@ManyToOne(() => MiAgentDialogueStyle, {
		onDelete: 'CASCADE',
		nullable: true,
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

	/** 压缩便签用模型；新建会话时写入当时的默认；空则解析时回退 meta 压缩默认与全站对话默认 */
	@Column('varchar', {
		length: 64, nullable: true,
	})
	public agentCompressionModelId: string | null;

	/** 当前会话启用的生图模型；空表示关闭自动生图 */
	@Column('varchar', {
		length: 128, nullable: true,
	})
	public agentImageModelId: string | null;

	/** The OpenAI-compatible image-recognition model selected for this session. */
	@Column('varchar', {
		length: 128, nullable: true,
	})
	public agentVisionModelId: string | null;

	/** 当前会话对所选生图模型的 provider 参数覆盖 */
	@Column('jsonb', {
		default: {},
	})
	public agentImageSettings: Record<string, unknown>;

	@Column('timestamp with time zone', {
		nullable: true,
	})
	public lastMessageAt: Date | null;

	/**
	 * 长期记忆提供方：none / aliyun / compression
	 * 新建会话默认 none；展示层可将「与实例能力不符」时解析为实际生效值。
	 */
	@Column('varchar', {
		length: 32,
		default: 'none',
	})
	public agentLongMemoryProvider: string;

	/**
	 * 本会话是否使用阿里云百炼长期记忆（Add/Search）；仅 agentLongMemoryProvider=aliyun 时有效。
	 * 库默认见迁移 `1772300000000-AgentLongMemoryDefaultOff.js`：自该迁移起 DB 默认 `false`，故此装饰器默认与之对齐，
	 * 避免「ORM 新建对象时 true、INSERT 后从库读出 false」的不一致。
	 */
	@Column('boolean', {
		default: false,
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

	/** 完整回复仍按一条消息存储；启用后由前端按安全块逐段展示。 */
	@Column('boolean', {
		default: false,
	})
	public segmentedOutputEnabled: boolean;

	/** Whether the current Beijing time is provided to the model before the latest user message. */
	@Column('boolean', {
		default: true,
	})
	public timeAwarenessEnabled: boolean;

	/** Allow one weighted proactive message after a quiet conversation period. */
	@Column('boolean', {
		default: false,
	})
	public randomProactiveEnabled: boolean;

	/** Allow the model to manage persisted proactive schedules for this session. */
	@Column('boolean', {
		default: false,
	})
	public scheduledProactiveEnabled: boolean;

	/** The pending weighted-random proactive delivery time, if one is armed. */
	@Column('timestamp with time zone', {
		nullable: true,
	})
	public randomProactiveAt: Date | null;

	/** Random delivery is re-armed only after a real user message arrives. */
	@Column('boolean', {
		default: false,
	})
	public randomProactiveNeedsUserMessage: boolean;

	/** The last skipped random proactive attempt. Raw provider errors are never stored here. */
	@Column('jsonb', {
		nullable: true,
	})
	public randomProactiveLastError: { code: string; occurredAt: string } | null;

	/** The last skipped scheduled proactive attempt. Raw provider errors are never stored here. */
	@Column('jsonb', {
		nullable: true,
	})
	public scheduledProactiveLastError: { code: string; occurredAt: string } | null;

	/** 管理封禁：该会话下用户无法继续对话 */
	@Column('boolean', {
		default: false,
	})
	public moderationBanned: boolean;

	/** 管理封禁原因（管理员填写）；为空时用户侧展示默认文案 */
	@Column('varchar', {
		length: 1000, nullable: true,
	})
	public moderationBannedReason: string | null;
}
