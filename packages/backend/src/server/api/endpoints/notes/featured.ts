/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { NotesRepository } from '@/models/_.js';
import type { MiNote } from '@/models/Note.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { DI } from '@/di-symbols.js';
import { FeaturedService } from '@/core/FeaturedService.js';
import { isUserRelated } from '@/misc/is-user-related.js';
import { CacheService } from '@/core/CacheService.js';
import { QueryService } from '@/core/QueryService.js';

export const meta = {
	tags: ['notes'],

	requireCredential: false,
	allowGet: true,
	cacheSec: 0, // 禁用 HTTP 缓存，每次请求都重新计算

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'Note',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		untilId: { type: 'string', format: 'misskey:id' },
		channelId: { type: 'string', nullable: true, format: 'misskey:id' },
		excludeIds: { type: 'array', items: { type: 'string', format: 'misskey:id' }, default: [] },
		sort: { type: 'string', enum: ['recommended', 'latest', 'hot'], default: 'recommended' },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	// 缓存帖子分数数据（30秒更新一次，但每次请求都重新采样）
	private rankingCache: { id: string; score: number }[] = [];
	private rankingCacheLastFetchedAt = 0;

	constructor(
		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		private cacheService: CacheService,
		private noteEntityService: NoteEntityService,
		private featuredService: FeaturedService,
		private queryService: QueryService,
	) {
		super(meta, paramDef, async (ps, me) => {
			// 如果是频道内的帖子，使用与全局相同的加权随机采样逻辑
			if (ps.channelId) {
				const channelNotesWithScores = await this.featuredService.getInChannelNotesRankingWithScores(ps.channelId, 200);

				if (channelNotesWithScores.length === 0) {
					return [];
				}

				const excludeSet = new Set(ps.excludeIds);
				const ranking = channelNotesWithScores.filter(item => !excludeSet.has(item.id));

				if (ranking.length === 0) {
					return [];
				}

				const { entities, scoreMap } = await this.loadFeaturedNotesWithBackfill({
					limit: ps.limit,
					sort: ps.sort,
					excludeIds: ps.excludeIds ?? [],
				}, ranking, me, false);

				if (entities.length === 0) {
					return [];
				}

				const packed = await this.noteEntityService.packMany(entities, me);

				for (const note of packed) {
					(note as typeof note & { _featuredScore_?: number })._featuredScore_ = scoreMap.get(note.id) ?? 0;
				}

				return packed;
			}

			// 全局发现页：获取帖子分数数据（30秒缓存）
			if (this.rankingCacheLastFetchedAt === 0 || (Date.now() - this.rankingCacheLastFetchedAt > 1000 * 30)) {
				this.rankingCache = await this.featuredService.getGlobalNotesRankingWithScores(500);
				this.rankingCacheLastFetchedAt = Date.now();
			}

			if (this.rankingCache.length === 0) {
				return [];
			}

			const excludeSet = new Set(ps.excludeIds);
			const ranking = this.rankingCache.filter(item => !excludeSet.has(item.id));

			if (ranking.length === 0) {
				return [];
			}

			const { entities, scoreMap } = await this.loadFeaturedNotesWithBackfill({
				limit: ps.limit,
				sort: ps.sort,
				excludeIds: ps.excludeIds ?? [],
			}, ranking, me, true);

			if (entities.length === 0) {
				return [];
			}

			const sortedForPack = (ps.sort === 'latest' || ps.sort === 'hot')
				? entities
				: this.shuffleArray([...entities]);

			const packedNotes = await this.noteEntityService.packMany(sortedForPack, me);

			return packedNotes.map(note => ({
				...note,
				_featuredScore_: scoreMap.get(note.id) ?? 0,
			}));
		});
	}

	/**
	 * 按 limit 取帖；若部分 ID 在 DB 加载后被静音/封锁/纯转发等规则过滤掉，则继续向后取，直到凑满或耗尽。
	 * 避免「服务端已选中但未返回」的 ID 未进入前端 excludeIds，导致下一页重复出现。
	 */
	private async loadFeaturedNotesWithBackfill(
		ps: { limit: number; sort: 'recommended' | 'latest' | 'hot'; excludeIds: string[] },
		rankingList: { id: string; score: number }[],
		me: { id: string } | null | undefined,
		filterPureRenote: boolean,
	): Promise<{ entities: MiNote[]; scoreMap: Map<string, number> }> {
		const expandedExclude = new Set(ps.excludeIds);
		const scoreMap = new Map<string, number>();
		const accumulated: MiNote[] = [];

		const [
			userIdsWhoMeMuting,
			userIdsWhoBlockingMe,
		] = me ? await Promise.all([
			this.cacheService.userMutingsCache.fetch(me.id),
			this.cacheService.userBlockedCache.fetch(me.id),
		]) : [new Set<string>(), new Set<string>()];

		while (accumulated.length < ps.limit) {
			const available = rankingList.filter(item => !expandedExclude.has(item.id));
			if (available.length === 0) break;

			const need = ps.limit - accumulated.length;
			let selectedNotes: { id: string; score: number }[];
			if (ps.sort === 'latest') {
				selectedNotes = [...available]
					.sort((a, b) => b.id.localeCompare(a.id))
					.slice(0, need);
			} else if (ps.sort === 'hot') {
				selectedNotes = [...available]
					.sort((a, b) => b.score - a.score)
					.slice(0, need);
			} else {
				selectedNotes = this.weightedRandomSample(available, need);
			}

			for (const item of selectedNotes) {
				expandedExclude.add(item.id);
				scoreMap.set(item.id, item.score);
			}

			const noteIds = selectedNotes.map(item => item.id);
			if (noteIds.length === 0) break;

			const query = this.notesRepository.createQueryBuilder('note')
				.where('note.id IN (:...noteIds)', { noteIds })
				.innerJoinAndSelect('note.user', 'user')
				.leftJoinAndSelect('note.reply', 'reply')
				.leftJoinAndSelect('note.renote', 'renote')
				.leftJoinAndSelect('reply.user', 'replyUser')
				.leftJoinAndSelect('renote.user', 'renoteUser')
				.leftJoinAndSelect('note.channel', 'channel');

			this.queryService.generateBlockedHostQueryForNote(query);
			this.queryService.generateSuspendedUserQueryForNote(query);

			const notes = (await query.getMany()).filter(note => {
				if (me && isUserRelated(note, userIdsWhoBlockingMe)) return false;
				if (me && isUserRelated(note, userIdsWhoMeMuting)) return false;
				if (filterPureRenote && note.renoteId && !note.text && note.fileIds.length === 0 && !note.hasPoll) {
					return false;
				}
				return true;
			});

			const sortedNotes = noteIds
				.map(id => notes.find(n => n.id === id))
				.filter((n): n is MiNote => n != null);

			accumulated.push(...sortedNotes);
		}

		return {
			entities: accumulated.slice(0, ps.limit),
			scoreMap,
		};
	}

	/**
	 * 加权随机采样算法
	 * 70% 从高分组按权重采样，30% 从低分组随机采样
	 */
	private weightedRandomSample(
		items: { id: string; score: number }[],
		count: number,
	): { id: string; score: number }[] {
		if (items.length <= count) {
			return this.shuffleArray([...items]);
		}

		// 按分数排序（高到低）
		const sorted = [...items].sort((a, b) => b.score - a.score);

		// 分成高分组（前50%）和低分组（后50%）
		const midPoint = Math.floor(sorted.length / 2);
		const highScoreGroup = sorted.slice(0, midPoint);
		const lowScoreGroup = sorted.slice(midPoint);

		// 计算采样数量
		const highCount = Math.ceil(count * 0.7);
		const lowCount = count - highCount;

		const selected: { id: string; score: number }[] = [];

		// 从高分组加权采样
		const highSelected = this.weightedSampleFromGroup(highScoreGroup, highCount);
		selected.push(...highSelected);

		// 从低分组随机采样
		const lowSelected = this.randomSampleFromGroup(lowScoreGroup, lowCount);
		selected.push(...lowSelected);

		return this.shuffleArray(selected);
	}

	/**
	 * 从高分组按权重采样
	 * 概率 = min(score, maxScore) / totalScore
	 * maxScore 用于避免极高分帖子垄断
	 */
	private weightedSampleFromGroup(
		items: { id: string; score: number }[],
		count: number,
	): { id: string; score: number }[] {
		if (items.length <= count) {
			return [...items];
		}

		// 分数上限：防止高分帖子垄断
		const maxScore = 50;
		const cappedItems = items.map(item => ({
			...item,
			cappedScore: Math.min(item.score, maxScore),
		}));

		const selected: { id: string; score: number }[] = [];
		const remaining = [...cappedItems];

		for (let i = 0; i < count && remaining.length > 0; i++) {
			const totalScore = remaining.reduce((sum, item) => sum + item.cappedScore, 0);

			if (totalScore === 0) {
				// 如果总分为0，随机选择
				const randomIndex = Math.floor(Math.random() * remaining.length);
				const [chosen] = remaining.splice(randomIndex, 1);
				selected.push({ id: chosen.id, score: chosen.score });
			} else {
				// 轮盘赌选择
				let random = Math.random() * totalScore;
				let chosenIndex = 0;

				for (let j = 0; j < remaining.length; j++) {
					random -= remaining[j].cappedScore;
					if (random <= 0) {
						chosenIndex = j;
						break;
					}
				}

				const [chosen] = remaining.splice(chosenIndex, 1);
				selected.push({ id: chosen.id, score: chosen.score });
			}
		}

		return selected;
	}

	/**
	 * 从低分组随机采样
	 */
	private randomSampleFromGroup(
		items: { id: string; score: number }[],
		count: number,
	): { id: string; score: number }[] {
		if (items.length <= count) {
			return [...items];
		}

		const shuffled = this.shuffleArray([...items]);
		return shuffled.slice(0, count);
	}

	// Fisher-Yates 洗牌算法
	private shuffleArray<T>(array: T[]): T[] {
		for (let i = array.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[array[i], array[j]] = [array[j], array[i]];
		}
		return array;
	}
}
