/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { MobilePushDevicesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';

export const meta = {
	tags: ['account'],

	requireCredential: true,
	secure: true,

	description: 'Unregister Aliyun mobile push device id.',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			found: {
				type: 'boolean',
				optional: false, nullable: false,
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		deviceId: { type: 'string' },
	},
	required: ['deviceId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.mobilePushDevicesRepository)
		private mobilePushDevicesRepository: MobilePushDevicesRepository,
	) {
		super(meta, paramDef, async (ps, me) => {
			const res = await this.mobilePushDevicesRepository.delete({
				userId: me.id,
				deviceId: ps.deviceId,
			});
			return { found: (res.affected ?? 0) > 0 };
		});
	}
}
