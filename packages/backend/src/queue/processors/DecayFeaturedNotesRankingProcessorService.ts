/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { bindThis } from '@/decorators.js';
import { FeaturedService } from '@/core/FeaturedService.js';
import Logger from '@/logger.js';
import { QueueLoggerService } from '../QueueLoggerService.js';

@Injectable()
export class DecayFeaturedNotesRankingProcessorService {
	private logger: Logger;

	constructor(
		private featuredService: FeaturedService,
		private queueLoggerService: QueueLoggerService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('decayFeaturedNotesRanking');
	}

	@bindThis
	public async process(_job: Job): Promise<void> {
		this.logger.info('Decaying featured notes ranking...');
		await this.featuredService.decayGlobalNotesRanking();
		await this.featuredService.cleanupChannelNotesRanking();
		this.logger.succ('Decayed featured notes ranking.');
	}
}
