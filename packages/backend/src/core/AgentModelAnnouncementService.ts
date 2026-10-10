/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { MoreThan } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { AgentModelAnnouncementsRepository } from '@/models/_.js';
import { MiAgentModelAnnouncement } from '@/models/AgentModelAnnouncement.js';
import type { AgentModelAnnouncementScope } from '@/models/AgentModelAnnouncement.js';
import type { MiMeta } from '@/models/Meta.js';
import { IdService } from '@/core/IdService.js';
import { RegistryApiService } from '@/core/RegistryApiService.js';
import { buildAgentModelChanges } from '@/misc/agent-model-changes.js';
import { bindThis } from '@/decorators.js';

const registryScope = ['client', 'agentModelAnnouncements'];
const readKey = 'lastReadId';

@Injectable()
export class AgentModelAnnouncementService {
	constructor(
		@Inject(DI.agentModelAnnouncementsRepository)
		private announcementsRepository: AgentModelAnnouncementsRepository,
		private idService: IdService,
		private registryApiService: RegistryApiService,
	) {}

	@bindThis
	public async recordChanges(before: MiMeta | undefined, after: MiMeta, manager: EntityManager): Promise<void> {
		if (!before) return;
		const changes = buildAgentModelChanges(before, after);
		if (changes.length === 0) return;
		const kinds = new Set(changes.map(change => change.kind));
		await manager.insert(MiAgentModelAnnouncement, {
			id: this.idService.gen(),
			createdAt: new Date(),
			scope: kinds.size === 1 ? changes[0].kind : 'all',
			title: '模型更新',
			text: '',
			changes,
		});
	}

	@bindThis
	public async publish(scope: AgentModelAnnouncementScope, title: string, text: string): Promise<void> {
		await this.announcementsRepository.insertOne({
			id: this.idService.gen(),
			createdAt: new Date(),
			scope,
			title,
			text,
			changes: [],
		});
	}

	@bindThis
	public async getUnread(userId: string) {
		const item = await this.registryApiService.getItem(userId, null, registryScope, readKey);
		const cursor = typeof item?.value === 'string' ? item.value : null;
		const announcements = await this.announcementsRepository.find({
			where: cursor ? { id: MoreThan(cursor) } : {},
			order: { id: 'ASC' },
		});
		return announcements.map(announcement => ({
			id: announcement.id,
			createdAt: announcement.createdAt.toISOString(),
			scope: announcement.scope,
			title: announcement.title,
			text: announcement.text,
			changes: announcement.changes,
		}));
	}

	@bindThis
	public async read(userId: string, announcementId: string): Promise<boolean> {
		if (!(await this.announcementsRepository.existsBy({ id: announcementId }))) return false;
		const item = await this.registryApiService.getItem(userId, null, registryScope, readKey);
		if (typeof item?.value !== 'string' || item.value < announcementId) {
			await this.registryApiService.set(userId, null, registryScope, readKey, announcementId);
		}
		return true;
	}
}
