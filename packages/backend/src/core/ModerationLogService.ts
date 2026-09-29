/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { ModerationLogsRepository } from '@/models/_.js';
import type { MiUser } from '@/models/User.js';
import { IdService } from '@/core/IdService.js';
import { LoggerService } from '@/core/LoggerService.js';
import type Logger from '@/logger.js';
import { bindThis } from '@/decorators.js';
import type { ModerationLogPayloads } from '@/types.js';
import { moderationLogTypes } from '@/types.js';

@Injectable()
export class ModerationLogService {
	private logger: Logger;

	constructor(
		@Inject(DI.moderationLogsRepository)
		private moderationLogsRepository: ModerationLogsRepository,

		private idService: IdService,
		loggerService: LoggerService,
	) {
		this.logger = loggerService.getLogger('moderation-log');
	}

	@bindThis
	public async log<T extends typeof moderationLogTypes[number]>(moderator: { id: MiUser['id'] }, type: T, info?: ModerationLogPayloads[T]) {
		await this.moderationLogsRepository.insert({
			id: this.idService.gen(),
			userId: moderator.id,
			type: type,
			info: (info as any) ?? {},
		});
	}

	@bindThis
	public async logSafely<T extends typeof moderationLogTypes[number]>(moderator: { id: MiUser['id'] }, type: T, info?: ModerationLogPayloads[T]): Promise<void> {
		try {
			await this.log(moderator, type, info);
		} catch (error) {
			this.logger.error(error instanceof Error ? error : new Error(String(error)), {
				moderatorId: moderator.id,
				type,
			});
		}
	}
}
