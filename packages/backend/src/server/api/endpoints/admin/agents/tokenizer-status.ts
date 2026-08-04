/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { checkTokenizerVocabStatus } from '@/misc/agent-custom-tokenizers.js';

export const meta = {
	tags: ['agents', 'admin'],
	requireCredential: true,
	requireAdmin: true,
	secure: true,
	kind: 'read:admin',
	res: {
		type: 'object',
		optional: false,
		nullable: false,
		properties: {
			tokenizers: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					properties: {
						family: { type: 'string' },
						available: { type: 'boolean' },
						vocabPath: { type: 'string', optional: true },
						configPath: { type: 'string', optional: true },
					},
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor() {
		super(meta, paramDef, async () => {
			const tokenizers = checkTokenizerVocabStatus();
			return { tokenizers };
		});
	}
}
