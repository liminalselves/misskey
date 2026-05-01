/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { UserSuspendService } from '@/core/UserSuspendService.js';
import { bindThis } from '@/decorators.js';
import type Logger from '@/logger.js';
import { QueueLoggerService } from '../QueueLoggerService.js';

@Injectable()
export class CheckExpiredUserSuspensionsProcessorService {
	private logger: Logger;

	constructor(
		private userSuspendService: UserSuspendService,
		private queueLoggerService: QueueLoggerService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('check-expired-user-suspensions');
	}

	@bindThis
	public async process(): Promise<void> {
		this.logger.info('Checking expired user suspensions...');
		await this.userSuspendService.processExpiredScheduledSuspensions();
		this.logger.succ('Expired user suspensions processed.');
	}
}
