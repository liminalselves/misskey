/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { MobilePushDevicesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { LoggerService } from '@/core/LoggerService.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireAdmin: true,
	secure: true,
	kind: 'write:admin',

	description: 'Delete all registered Aliyun mobile push device records.',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			deletedCount: {
				type: 'number',
				optional: false, nullable: false,
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
	constructor(
		@Inject(DI.mobilePushDevicesRepository)
		private mobilePushDevicesRepository: MobilePushDevicesRepository,

		private loggerService: LoggerService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const result = await this.mobilePushDevicesRepository.createQueryBuilder().delete().execute();
			const deletedCount = result.affected ?? 0;

			this.loggerService.getLogger('mobile-push').info(`clear-devices: deleted ${deletedCount} registered device record(s) by admin=${me.id}`);

			return { deletedCount };
		});
	}
}
