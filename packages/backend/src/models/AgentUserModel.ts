/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Entity, Index, Column, PrimaryColumn, JoinColumn, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';

/**
 * 用户自定义模型（BYOK）。
 * 用户自行提供 baseUrl / apiKey / 模型名与上下文限制，平台不扣费、不消耗官方免费额度；
 * 仅在用量统计与请求日志中标记为「自定义模型」。
 * 模型 id 使用 `u<hex>` 前缀，与官方模型 `m<hex>` 前缀区分（见 agent-llm-models.ts）。
 */
@Entity('agent_user_model')
@Index('IDX_agent_user_model_userId_name', ['userId', 'name'], { unique: true })
export class MiAgentUserModel {
	@PrimaryColumn(id())
	public id: string;

	@Index('IDX_agent_user_model_userId')
	@Column({
		...id(),
	})
	public userId: MiUser['id'];

	@ManyToOne(() => MiUser, {
		onDelete: 'CASCADE',
	})
	// 与 migration 1779000000000 建立的约束同名，避免 TypeORM schema diff 视为不一致
	@JoinColumn({ foreignKeyConstraintName: 'FK_agent_user_model_user' })
	public user: MiUser | null;

	/** 显示名称（用户内唯一，且不能与官方模型名重复） */
	@Column('varchar', {
		length: 256,
	})
	public name: string;

	/** OpenAI 兼容 Base URL（服务端代理，需通过 SSRF 校验） */
	@Column('varchar', {
		length: 512,
	})
	public baseUrl: string;

	/** 用户自带的 API Key；任何接口均不透出明文 */
	@Column('text', {
		nullable: true,
	})
	public apiKey: string | null;

	/** 请求时发送的 model 名 */
	@Column('varchar', {
		length: 256,
	})
	public apiModelName: string;

	@Column('integer', {
		default: 8192,
	})
	public maxContextTokens: number;

	@Column('integer', {
		default: 2048,
	})
	public maxOutputTokensPerCall: number;

	/** token 编码器标识；为空则使用字符估算 */
	@Column('varchar', {
		length: 64, nullable: true,
	})
	public tokenizerEncoding: string | null;

	/** 每 token 对应字符数的估算比率；为空则用默认 3 */
	@Column('integer', {
		nullable: true,
	})
	public charsPerToken: number | null;

	/** 关联的半设置提供商模板 id（meta.agentByokProviders[].id）；为空表示完全自定义 */
	@Column('varchar', {
		length: 64, nullable: true,
	})
	public providerId: string | null;

	/** 停用后不可用于新请求（软删除语义） */
	@Column('boolean', {
		default: true,
	})
	public enabled: boolean;

	@Column('timestamp with time zone')
	public createdAt: Date;

	@Column('timestamp with time zone')
	public updatedAt: Date;
}
