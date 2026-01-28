/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Brackets, In } from 'typeorm';
import { Inject, Injectable } from '@nestjs/common';
import type { NotesRepository, MutingsRepository, PollsRepository, PollVotesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { DI } from '@/di-symbols.js';
import { FeaturedService } from '@/core/FeaturedService.js';

export const meta = {
	tags: ['notes'],

	requireCredential: true,
	kind: 'read:account',

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
		offset: { type: 'integer', default: 0 },
		excludeChannels: { type: 'boolean', default: false },
		excludeIds: { type: 'array', items: { type: 'string', format: 'misskey:id' }, default: [] },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.pollsRepository)
		private pollsRepository: PollsRepository,

		@Inject(DI.pollVotesRepository)
		private pollVotesRepository: PollVotesRepository,

		@Inject(DI.mutingsRepository)
		private mutingsRepository: MutingsRepository,

		private noteEntityService: NoteEntityService,
		private featuredService: FeaturedService,
	) {
		super(meta, paramDef, async (ps, me) => {
			// 获取所有符合条件的投票
			const query = this.pollsRepository.createQueryBuilder('poll')
				.where('poll.userHost IS NULL')
				.andWhere('poll.userId != :meId', { meId: me.id })
				.andWhere('poll.noteVisibility = \'public\'')
				.andWhere(new Brackets(qb => {
					qb
						.where('poll.expiresAt IS NULL')
						.orWhere('poll.expiresAt > :now', { now: new Date() });
				}));

			//#region exclude arleady voted polls
			const votedQuery = this.pollVotesRepository.createQueryBuilder('vote')
				.select('vote.noteId')
				.where('vote.userId = :meId', { meId: me.id });

			query
				.andWhere(`poll.noteId NOT IN (${ votedQuery.getQuery() })`);

			query.setParameters(votedQuery.getParameters());
			//#endregion

			//#region mute
			const mutingQuery = this.mutingsRepository.createQueryBuilder('muting')
				.select('muting.muteeId')
				.where('muting.muterId = :muterId', { muterId: me.id });

			query
				.andWhere(`poll.userId NOT IN (${ mutingQuery.getQuery() })`);

			query.setParameters(mutingQuery.getParameters());
			//#endregion

			//#region exclude channels
			if (ps.excludeChannels) {
				query.andWhere('poll.channelId IS NULL');
			}
			//#endregion

			// 获取所有符合条件的投票 ID
			const polls = await query
				.select('poll.noteId')
				.limit(200) // 获取更多用于随机采样
				.getMany();

			if (polls.length === 0) return [];

			// 去重投票 ID（防止重复）
			const pollNoteIds = [...new Set(polls.map(poll => poll.noteId))];

			// 获取这些投票帖子的分数
			const rankingData = await this.featuredService.getGlobalNotesRankingWithScores(500);
			const scoreMap = new Map<string, number>();
			for (const item of rankingData) {
				scoreMap.set(item.id, item.score);
			}

			// 为投票帖子构建分数数组
			const pollsWithScores = pollNoteIds.map(id => ({
				id,
				score: scoreMap.get(id) ?? 1, // 没有分数的默认为 1
			}));

			// 排除前端传递的已展示投票 ID
			const excludeSet = new Set(ps.excludeIds);
			const availablePolls = pollsWithScores.filter(item => !excludeSet.has(item.id));

			if (availablePolls.length === 0) {
				return [];
			}

			// 加权随机采样（带去重）
			const selectedPolls = this.weightedRandomSample(availablePolls, ps.limit);

			// 创建分数映射用于返回
			const resultScoreMap = new Map<string, number>();
			for (const item of selectedPolls) {
				resultScoreMap.set(item.id, item.score);
			}

			const selectedIds = selectedPolls.map(p => p.id);

			if (selectedIds.length === 0) return [];

			const notes = await this.notesRepository.find({
				where: {
					id: In(selectedIds),
				},
			});

			// 打乱顺序
			this.shuffleArray(notes);

			const packedNotes = await this.noteEntityService.packMany(notes, me, {
				detail: true,
			});

			// 添加分数字段
			return packedNotes.map(note => ({
				...note,
				_featuredScore_: resultScoreMap.get(note.id) ?? 0,
			}));
		});
	}

	/**
	 * 加权随机采样算法（带去重）
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

		// 使用 Set 跟踪已选择的 ID，防止重复
		const selectedIds = new Set<string>();
		const selected: { id: string; score: number }[] = [];

		// 从高分组加权采样
		const highSelected = this.weightedSampleFromGroup(highScoreGroup, highCount, selectedIds);
		for (const item of highSelected) {
			selected.push(item);
			selectedIds.add(item.id);
		}

		// 从低分组随机采样（排除已选择的）
		const lowSelected = this.randomSampleFromGroup(lowScoreGroup, lowCount, selectedIds);
		for (const item of lowSelected) {
			selected.push(item);
			selectedIds.add(item.id);
		}

		return this.shuffleArray(selected);
	}

	private weightedSampleFromGroup(
		items: { id: string; score: number }[],
		count: number,
		excludeIds: Set<string>,
	): { id: string; score: number }[] {
		// 排除已选择的
		const available = items.filter(item => !excludeIds.has(item.id));

		if (available.length <= count) {
			return [...available];
		}

		const maxScore = 50;
		const cappedItems = available.map(item => ({
			...item,
			cappedScore: Math.min(item.score, maxScore),
		}));

		const selected: { id: string; score: number }[] = [];
		const remaining = [...cappedItems];

		for (let i = 0; i < count && remaining.length > 0; i++) {
			const totalScore = remaining.reduce((sum, item) => sum + item.cappedScore, 0);

			if (totalScore === 0) {
				const randomIndex = Math.floor(Math.random() * remaining.length);
				const [chosen] = remaining.splice(randomIndex, 1);
				selected.push({ id: chosen.id, score: chosen.score });
			} else {
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

	private randomSampleFromGroup(
		items: { id: string; score: number }[],
		count: number,
		excludeIds: Set<string>,
	): { id: string; score: number }[] {
		// 排除已选择的
		const available = items.filter(item => !excludeIds.has(item.id));

		if (available.length <= count) {
			return [...available];
		}

		const shuffled = this.shuffleArray([...available]);
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

