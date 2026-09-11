/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { AgentCharactersRepository, AgentDialogueStylesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { AgentService } from '@/core/AgentService.js';

/** 表情库 diff 预览：key: 描述逐行（空库为空串） */
function stickersDiffPreview(stickers: { key: string; description: string }[]): string {
	return stickers.map(s => `${s.key}: ${s.description}`).join('\n');
}

export const meta = {
	tags: ['admin', 'agents'],
	requireCredential: true,
	secure: true,
	requireModerator: true,
	kind: 'read:admin',
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
		kind: { type: 'string', enum: ['character', 'style'] },
		id: { type: 'string', format: 'misskey:id' },
	},
	required: ['kind', 'id'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentCharactersRepository)
		private agentCharactersRepository: AgentCharactersRepository,

		@Inject(DI.agentDialogueStylesRepository)
		private agentDialogueStylesRepository: AgentDialogueStylesRepository,

		private agentService: AgentService,
	) {
		super(meta, paramDef, async (ps) => {
			this.agentService.assertAgentsEnabled();
			const fields: Array<{ key: string; draftPreview: string; publishedPreview: string }> = [];
			const pushIfDiff = (key: string, draftVal: string, pubVal: string) => {
				if (draftVal !== pubVal) fields.push({ key, draftPreview: draftVal, publishedPreview: pubVal });
			};

			if (ps.kind === 'character') {
				const row = await this.agentCharactersRepository.findOneBy({ id: ps.id });
				if (!row) throw new ApiError({ message: 'No such character.', code: 'NO_SUCH_CHARACTER', id: 'c99afcf7-b19d-4f2b-9020-16d8ebf10c6e' });
				const pub = row.publishedSnapshot ? this.agentService.parseCharacterSnapshot(row.publishedSnapshot) : null;
				if (!pub) return { hasChanges: false, fields: [] };
				const draft = this.agentService.buildCharacterSnapshotFromRow(row);
				pushIfDiff('name', draft.name, pub.name);
				pushIfDiff('summary', draft.summary ?? '', pub.summary ?? '');
				pushIfDiff('personality', draft.personality, pub.personality);
				pushIfDiff('background', draft.background, pub.background);
				pushIfDiff('speakingStyle', draft.speakingStyle, pub.speakingStyle);
				pushIfDiff('greeting', draft.greeting, pub.greeting);
				pushIfDiff('exampleDialogue', draft.exampleDialogue, pub.exampleDialogue);
				pushIfDiff('forbiddenBehavior', draft.forbiddenBehavior, pub.forbiddenBehavior);
				pushIfDiff('avatarFileId', draft.avatarFileId ?? '', pub.avatarFileId ?? '');
				pushIfDiff('worldbook', this.agentService.worldbookStableString(draft.worldbook), this.agentService.worldbookStableString(pub.worldbook));
				pushIfDiff('rules', this.agentService.rulesStableString(draft.rules), this.agentService.rulesStableString(pub.rules));
				pushIfDiff('stickers', stickersDiffPreview(draft.stickers), stickersDiffPreview(pub.stickers));
			} else {
				const row = await this.agentDialogueStylesRepository.findOneBy({ id: ps.id });
				if (!row) throw new ApiError({ message: 'No such style.', code: 'NO_SUCH_STYLE', id: '196f88b6-8a2f-4a3e-9e61-61a560d95bb7' });
				const pub = row.publishedSnapshot ? this.agentService.parseStyleSnapshot(row.publishedSnapshot) : null;
				if (!pub) return { hasChanges: false, fields: [] };
				pushIfDiff('name', row.name, pub.name);
				pushIfDiff('summary', row.summary ?? '', pub.summary ?? '');
				pushIfDiff('body', row.body, pub.body);
			}

			return { hasChanges: fields.length > 0, fields };
		});
	}
}
