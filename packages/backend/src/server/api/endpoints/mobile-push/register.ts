/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { IdService } from '@/core/IdService.js';
import { LoggerService } from '@/core/LoggerService.js';
import type { MobilePushDevicesRepository } from '@/models/_.js';
import type { MiMeta } from '@/models/Meta.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['account'],

	requireCredential: true,
	secure: true,

	description: 'Register Aliyun mobile push device id for native app notifications.',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			registered: {
				type: 'boolean',
				optional: false, nullable: false,
			},
		},
	},

	errors: {
		mobilePushDisabled: {
			message: 'Aliyun mobile push is disabled by the administrator.',
			code: 'MOBILE_PUSH_DISABLED',
			id: '8f0a6f69-7d5e-4a8a-9b0e-4a1f8f1c1a2d',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		deviceId: { type: 'string' },
		platform: { type: 'string', enum: ['android', 'ios'] },
	},
	required: ['deviceId', 'platform'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.mobilePushDevicesRepository)
		private mobilePushDevicesRepository: MobilePushDevicesRepository,

		@Inject(DI.meta)
		private serverMeta: MiMeta,

		private idService: IdService,
		private loggerService: LoggerService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const logger = this.loggerService.getLogger('mobile-push');

			if (this.serverMeta.enableAliyunMobilePush === false) {
				logger.info(`register rejected: enableAliyunMobilePush is off (userId=${me.id} deviceId=${ps.deviceId})`);
				throw new ApiError(meta.errors.mobilePushDisabled);
			}
			const exist = await this.mobilePushDevicesRepository.findOneBy({
				userId: me.id,
				deviceId: ps.deviceId,
			});

			if (exist) {
				if (exist.platform !== ps.platform) {
					await this.mobilePushDevicesRepository.update(exist.id, { platform: ps.platform });
					logger.info(`register ok (platform updated): userId=${me.id} platform=${ps.platform} deviceId=${ps.deviceId}`);
				} else {
					logger.info(`register ok (already known): userId=${me.id} platform=${ps.platform} deviceId=${ps.deviceId}`);
				}
				return { registered: true };
			}

			await this.mobilePushDevicesRepository.insert({
				id: this.idService.gen(),
				userId: me.id,
				deviceId: ps.deviceId,
				platform: ps.platform,
			});

			logger.info(`register ok (new device): userId=${me.id} platform=${ps.platform} deviceId=${ps.deviceId}`);
			return { registered: true };
		});
	}
}
