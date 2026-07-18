/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { AgentProactiveMessageService } from '@/core/AgentProactiveMessageService.js';

@Injectable()
export class ProcessAgentProactiveMessagesProcessorService {
	constructor(
		private agentProactiveMessageService: AgentProactiveMessageService,
	) {}

	public async process(): Promise<void> {
		await this.agentProactiveMessageService.processDue();
	}
}
