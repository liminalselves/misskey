/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { MetaService } from '@/core/MetaService.js';
import { AgentVisionService } from '@/core/AgentVisionService.js';

export const meta = {
	tags: ['agents'],
	requireCredential: true,
	kind: 'read:chat',
	res: {
		type: 'object', optional: false, nullable: false,
		properties: {
			defaultModelId: { type: 'string', nullable: true },
			models: { type: 'array', items: { type: 'object', properties: {
				id: { type: 'string' }, name: { type: 'string' }, costPerCall: { type: 'number' }, isDefault: { type: 'boolean' },
			} } },
		},
	},
} as const;

export const paramDef = { type: 'object', properties: {}, required: [] } as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private metaService: MetaService,
		private agentVisionService: AgentVisionService,
	) {
		super(meta, paramDef, async () => {
			const instance = await this.metaService.fetch(true);
			const defaultModelId = this.agentVisionService.resolveVisionModel(instance, null)?.id ?? null;
			return {
				defaultModelId,
				models: this.agentVisionService.listAvailableVisionModels(instance).map(model => ({
					id: model.id,
					name: model.name,
					costPerCall: Math.max(0, Number(model.costPerCall) || 0),
					isDefault: model.id === defaultModelId,
				})),
			};
		});
	}
}
