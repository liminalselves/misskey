/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { AgentImageService } from '@/core/AgentImageService.js';

export const meta = {
	tags: ['admin', 'agents'],
	requireCredential: true,
	secure: true,
	requireModerator: true,
	kind: 'write:admin:meta',
	res: {
		type: 'object',
		optional: false, nullable: false,
		additionalProperties: true,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		token: { type: 'string', minLength: 1, maxLength: 8192 },
	},
	required: ['token'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private agentImageService: AgentImageService,
	) {
		super(meta, paramDef, async (ps) => {
			const token = await this.agentImageService.testToken(ps.token);
			return this.agentImageService.publicTokenMeta([token])[0];
		});
	}
}
