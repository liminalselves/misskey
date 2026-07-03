/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { AgentCharactersRepository } from '@/models/_.js';
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
		characterId: { type: 'string', format: 'misskey:id' },
	},
	required: ['characterId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.agentCharactersRepository)
		private agentCharactersRepository: AgentCharactersRepository,

		private agentService: AgentService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.agentService.assertAgentsEnabled();
			const row = await this.agentCharactersRepository.findOneBy({ id: ps.characterId });
			if (!row || row.userId !== me.id) {
				throw new ApiError({ message: 'No such character.', code: 'NO_SUCH_CHARACTER', id: '4fdde14f-bf96-45ba-8f04-556a5f368165' });
			}
			const pub = row.publishedSnapshot ? this.agentService.parseCharacterSnapshot(row.publishedSnapshot) : null;
			if (!pub) {
				return { hasChanges: false, fields: [] };
			}
			const draft = this.agentService.buildCharacterSnapshotFromRow(row);
			const fields: Array<{ key: string; draftPreview: string; publishedPreview: string }> = [];
			const pushIfDiff = (key: string, draftVal: string, pubVal: string) => {
				if (draftVal !== pubVal) {
					fields.push({ key, draftPreview: draftVal, publishedPreview: pubVal });
				}
			};
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
			return {
				hasChanges: fields.length > 0,
				fields,
			};
		});
	}
}
