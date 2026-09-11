/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { AgentStickerService, AGENT_STICKER_DESCRIPTION_MAX, agentStickerErrors } from '@/core/AgentStickerService.js';
import { MetaService } from '@/core/MetaService.js';

export const meta = {
	tags: ['agents'],

	requireCredential: true,
	kind: 'write:chat',
	limit: { duration: ms('1hour'), max: 120 },

	errors: {
		...agentStickerErrors,
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			description: { type: 'string' },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		fileId: { type: 'string', format: 'misskey:id' },
	},
	required: ['fileId'],
} as const;

/**
 * 为角色专属表情包生成 AI 描述（识图）。仅返回描述文本，由创作者编辑后随表单保存；
 * 费用按识图模型按次价扣减调用者（创作者）余额。
 */
@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private agentStickerService: AgentStickerService,
		private metaService: MetaService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const instance = await this.metaService.fetch(true);
			const description = await this.agentStickerService.generateDescriptionForFile(instance, me, ps.fileId);
			return { description: description.slice(0, AGENT_STICKER_DESCRIPTION_MAX) };
		});
	}
}
