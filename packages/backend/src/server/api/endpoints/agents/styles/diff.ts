/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { AgentDialogueStylesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { AgentService } from '@/core/AgentService.js';

export const meta = {
	tags: ['agents'],
	requireCredential: true,
	kind: 'read:chat',
	limit: { duration: ms('1hour'), max: 240 },
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			hasChanges: { type: 'boolean' },
			fields: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						key: { type: 'string' },
						draftPreview: { type: 'string' },
						publishedPreview: { type: 'string' },
					},
					required: ['key', 'draftPreview', 'publishedPreview'],
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		styleId: { type: 'string', format: 'misskey:id' },
	},
	required: ['styleId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentDialogueStylesRepository)
		private agentDialogueStylesRepository: AgentDialogueStylesRepository,

		private agentService: AgentService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const row = await this.agentDialogueStylesRepository.findOneBy({ id: ps.styleId });
			if (!row || row.userId !== me.id) {
				throw new ApiError({ message: 'No such style.', code: 'NO_SUCH_STYLE', id: '4aef9f10-02d7-4e2e-b3bf-e5e8f47f4e10' });
			}
			const pub = row.publishedSnapshot ? this.agentService.parseStyleSnapshot(row.publishedSnapshot) : null;
			if (!pub) {
				return { hasChanges: false, fields: [] };
			}
			const fields: Array<{ key: string; draftPreview: string; publishedPreview: string }> = [];
			const pushIfDiff = (key: string, draftVal: string, pubVal: string) => {
				if (draftVal !== pubVal) {
					fields.push({ key, draftPreview: draftVal, publishedPreview: pubVal });
				}
			};
			pushIfDiff('name', row.name, pub.name);
			pushIfDiff('summary', row.summary ?? '', pub.summary ?? '');
			pushIfDiff('body', row.body, pub.body);
			return {
				hasChanges: fields.length > 0,
				fields,
			};
		});
	}
}
