/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import type { MiGalleryPost, MiNote, MiUser } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';

const GLOBAL_NOTES_RANKING_WINDOW = 1000 * 60 * 60 * 24 * 3; // 3日ごと
export const GALLERY_POSTS_RANKING_WINDOW = 1000 * 60 * 60 * 24 * 3; // 3日ごと
const PER_USER_NOTES_RANKING_WINDOW = 1000 * 60 * 60 * 24 * 7; // 1週間ごと
const HASHTAG_RANKING_WINDOW = 1000 * 60 * 60; // 1時間ごと

const featuredEpoc = new Date('2023-01-01T00:00:00Z').getTime();

@Injectable()
export class FeaturedService {
	constructor(
		@Inject(DI.redis)
		private redisClient: Redis.Redis, // TODO: 専用のRedisサーバーを設定できるようにする
	) {
	}

	@bindThis
	private getCurrentWindow(windowRange: number): number {
		const passed = new Date().getTime() - featuredEpoc;
		return Math.floor(passed / windowRange);
	}

	@bindThis
	private async updateRankingOf(name: string, windowRange: number, element: string, score = 1): Promise<void> {
		const currentWindow = this.getCurrentWindow(windowRange);
		const redisTransaction = this.redisClient.multi();
		redisTransaction.zincrby(
			`${name}:${currentWindow}`,
			score,
			element);
		redisTransaction.expire(
			`${name}:${currentWindow}`,
			(windowRange * 3) / 1000,
			'NX'); // "NX -- Set expiry only when the key has no expiry" = 有効期限がないときだけ設定
		await redisTransaction.exec();
	}

	@bindThis
	private async getRankingOf(name: string, windowRange: number, threshold: number): Promise<string[]> {
		const currentWindow = this.getCurrentWindow(windowRange);
		const previousWindow = currentWindow - 1;

		const redisPipeline = this.redisClient.pipeline();
		redisPipeline.zrange(
			`${name}:${currentWindow}`, 0, threshold, 'REV', 'WITHSCORES');
		redisPipeline.zrange(
			`${name}:${previousWindow}`, 0, threshold, 'REV', 'WITHSCORES');
		const [currentRankingResult, previousRankingResult] = await redisPipeline.exec().then(result => result ? result.map(r => (r[1] ?? []) as string[]) : [[], []]);

		const ranking = new Map<string, number>();
		for (let i = 0; i < currentRankingResult.length; i += 2) {
			const noteId = currentRankingResult[i];
			const score = parseInt(currentRankingResult[i + 1], 10);
			ranking.set(noteId, score);
		}
		for (let i = 0; i < previousRankingResult.length; i += 2) {
			const noteId = previousRankingResult[i];
			const score = parseInt(previousRankingResult[i + 1], 10);
			const exist = ranking.get(noteId);
			if (exist != null) {
				ranking.set(noteId, (exist + score) / 2);
			} else {
				ranking.set(noteId, score);
			}
		}

		return Array.from(ranking.keys());
	}

	@bindThis
	private async removeFromRanking(name: string, windowRange: number, element: string): Promise<void> {
		const currentWindow = this.getCurrentWindow(windowRange);
		const previousWindow = currentWindow - 1;

		const redisPipeline = this.redisClient.pipeline();
		redisPipeline.zrem(`${name}:${currentWindow}`, element);
		redisPipeline.zrem(`${name}:${previousWindow}`, element);
		await redisPipeline.exec();
	}

	@bindThis
	public updateGlobalNotesRanking(noteId: MiNote['id'], score = 1): Promise<void> {
		// Use a global key instead of windowed keys
		return this.redisClient.zincrby('featuredGlobalNotesRanking:global', score, noteId).then(() => {});
	}

	@bindThis
	public updateGalleryPostsRanking(galleryPostId: MiGalleryPost['id'], score = 1): Promise<void> {
		return this.updateRankingOf('featuredGalleryPostsRanking', GALLERY_POSTS_RANKING_WINDOW, galleryPostId, score);
	}

	@bindThis
	public async updateInChannelNotesRanking(channelId: MiNote['channelId'], noteId: MiNote['id'], score = 1): Promise<void> {
		if (!channelId) return;

		// 确保全局热度也更新，从而通过 Intersect 让频道热度增加
		await this.updateGlobalNotesRanking(noteId, score);

		const key = `featuredInChannelNotesRanking:${channelId}`;
		// 仅确保存储在频道列表中，分数设为 0。使用 NX 避免重复写入
		await this.redisClient.zadd(key, 'NX', 0, noteId);
		await this.redisClient.sadd('featuredChannelsIndex', channelId);
	}

	@bindThis
	public updatePerUserNotesRanking(userId: MiUser['id'], noteId: MiNote['id'], score = 1): Promise<void> {
		return this.updateRankingOf(`featuredPerUserNotesRanking:${userId}`, PER_USER_NOTES_RANKING_WINDOW, noteId, score);
	}

	@bindThis
	public updateHashtagsRanking(hashtag: string, score = 1): Promise<void> {
		return this.updateRankingOf('featuredHashtagsRanking', HASHTAG_RANKING_WINDOW, hashtag, score);
	}

	@bindThis
	public async cleanupChannelNotesRanking(): Promise<void> {
		const channels = await this.redisClient.smembers('featuredChannelsIndex');
		const globalKey = 'featuredGlobalNotesRanking:global';

		for (const channelId of channels) {
			const key = `featuredInChannelNotesRanking:${channelId}`;

			// 通过与全局热度求交集来清理已衰减（不存在于全局）的帖子
			// 这能保持频道列表的大小可控，提高读取时的 Intersect 性能
			await this.redisClient.zinterstore(key, 2, globalKey, key, 'WEIGHTS', 1, 0);

			const count = await this.redisClient.zcard(key);
			if (count === 0) {
				await this.redisClient.srem('featuredChannelsIndex', channelId);
			}
		}
	}

	@bindThis
	public getGlobalNotesRanking(threshold: number): Promise<MiNote['id'][]> {
		return this.redisClient.zrange('featuredGlobalNotesRanking:global', 0, threshold, 'REV');
	}

	/**
	 * 获取全局帖子排名及其分数
	 * 返回 [noteId1, score1, noteId2, score2, ...] 格式的数组
	 */
	@bindThis
	public async getGlobalNotesRankingWithScores(threshold: number): Promise<{ id: MiNote['id']; score: number }[]> {
		const data = await this.redisClient.zrange('featuredGlobalNotesRanking:global', 0, threshold, 'REV', 'WITHSCORES');
		const result: { id: MiNote['id']; score: number }[] = [];
		for (let i = 0; i < data.length; i += 2) {
			result.push({
				id: data[i],
				score: parseFloat(data[i + 1]),
			});
		}
		return result;
	}

	@bindThis
	public getGalleryPostsRanking(threshold: number): Promise<MiGalleryPost['id'][]> {
		return this.getRankingOf('featuredGalleryPostsRanking', GALLERY_POSTS_RANKING_WINDOW, threshold);
	}

	@bindThis
	public async getInChannelNotesRanking(channelId: MiNote['channelId'], threshold: number): Promise<MiNote['id'][]> {
		if (!channelId) return [];

		const channelKey = `featuredInChannelNotesRanking:${channelId}`;
		const globalKey = 'featuredGlobalNotesRanking:global';
		const tempKey = `featured:temp:${channelId}:${Date.now()}:${Math.random()}`;

		try {
			// 计算交集：取 Global 和 Channel 的交集，并使用 Global 的分数（权重 1:0）
			// 这样可以确保频道内的热度排序与全局完全一致，且无需单独通过定时任务衰减
			await this.redisClient.zinterstore(tempKey, 2, globalKey, channelKey, 'WEIGHTS', 1, 0);
			return await this.redisClient.zrange(tempKey, 0, threshold, 'REV');
		} finally {
			this.redisClient.del(tempKey);
		}
	}

	/**
	 * 获取频道内帖子排名及其分数（用于加权随机采样）
	 */
	@bindThis
	public async getInChannelNotesRankingWithScores(channelId: MiNote['channelId'], threshold: number): Promise<{ id: MiNote['id']; score: number }[]> {
		if (!channelId) return [];

		const channelKey = `featuredInChannelNotesRanking:${channelId}`;
		const globalKey = 'featuredGlobalNotesRanking:global';
		const tempKey = `featured:temp:${channelId}:${Date.now()}:${Math.random()}`;

		try {
			await this.redisClient.zinterstore(tempKey, 2, globalKey, channelKey, 'WEIGHTS', 1, 0);
			const data = await this.redisClient.zrange(tempKey, 0, threshold, 'REV', 'WITHSCORES');

			const result: { id: MiNote['id']; score: number }[] = [];
			for (let i = 0; i < data.length; i += 2) {
				result.push({
					id: data[i],
					score: parseFloat(data[i + 1]),
				});
			}
			return result;
		} finally {
			this.redisClient.del(tempKey);
		}
	}

	@bindThis
	public getPerUserNotesRanking(userId: MiUser['id'], threshold: number): Promise<MiNote['id'][]> {
		return this.getRankingOf(`featuredPerUserNotesRanking:${userId}`, PER_USER_NOTES_RANKING_WINDOW, threshold);
	}

	@bindThis
	public getHashtagsRanking(threshold: number): Promise<string[]> {
		return this.getRankingOf('featuredHashtagsRanking', HASHTAG_RANKING_WINDOW, threshold);
	}

	@bindThis
	public removeHashtagsFromRanking(hashtag: string): Promise<void> {
		return this.removeFromRanking('featuredHashtagsRanking', HASHTAG_RANKING_WINDOW, hashtag);
	}

	@bindThis
	public async decayGlobalNotesRanking(): Promise<void> {
		const key = 'featuredGlobalNotesRanking:global';
		// 衰减速度降低：每小时衰减 0.5%（原 2%），让帖子存活更久
		await this.redisClient.zinterstore(key, 1, key, 'WEIGHTS', 0.995);
		// 清理阈值降低：分数低于 0.01 才清理，让冷门帖子有更多机会
		await this.redisClient.zremrangebyscore(key, '-inf', 0.01);
	}

	@bindThis
	public async decayInChannelNotesRanking(): Promise<void> {
		const channels = await this.redisClient.smembers('featuredChannelsIndex');
		for (const channelId of channels) {
			const key = `featuredInChannelNotesRanking:${channelId}`;
			// 衰减速度降低：每小时衰减 0.5%
			await this.redisClient.zinterstore(key, 1, key, 'WEIGHTS', 0.995);
			// 清理阈值降低：分数低于 0.01 才清理
			await this.redisClient.zremrangebyscore(key, '-inf', 0.01);

			// 如果该频道已无热度内容，从索引中移除，避免空轮询
			const count = await this.redisClient.zcard(key);
			if (count === 0) {
				await this.redisClient.srem('featuredChannelsIndex', channelId);
			}
		}
	}

	/**
	 * 将旧的时间窗口数据迁移到全局 key
	 * 用于从旧版本升级时的一次性迁移
	 */
	@bindThis
	public async migrateFromWindowedKeys(): Promise<number> {
		const globalKey = 'featuredGlobalNotesRanking:global';
		const currentWindow = this.getCurrentWindow(GLOBAL_NOTES_RANKING_WINDOW);
		const previousWindow = currentWindow - 1;

		const oldKeys = [
			`featuredGlobalNotesRanking:${currentWindow}`,
			`featuredGlobalNotesRanking:${previousWindow}`,
		];

		let migratedCount = 0;

		for (const oldKey of oldKeys) {
			// 获取旧 key 中的所有数据
			const data = await this.redisClient.zrange(oldKey, 0, -1, 'WITHSCORES');

			if (data.length === 0) continue;

			// 批量添加到全局 key
			const pipeline = this.redisClient.pipeline();
			for (let i = 0; i < data.length; i += 2) {
				const noteId = data[i];
				const score = parseFloat(data[i + 1]);
				pipeline.zincrby(globalKey, score, noteId);
				migratedCount++;
			}
			await pipeline.exec();
		}

		return migratedCount;
	}
}
