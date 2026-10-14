/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * 广场推荐位的加权随机采样（characters/styles public-list 共用）。
 *
 * 候选集按推荐分排序后分成高/低两半：约 70% 名额从高分半区按权重（单分上限 60，避免头部垄断）
 * 抽取，剩余名额从低分半区均匀随机抽取，最后整体洗牌输出，兼顾质量与探索性。
 */

export function shuffleArray<T>(array: T[]): T[] {
	for (let i = array.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[array[i], array[j]] = [array[j], array[i]];
	}
	return array;
}

export function weightedSampleFromGroup(items: { id: string; score: number }[], count: number): { id: string; score: number }[] {
	if (items.length <= count) return [...items];

	const maxScore = 60;
	const remaining = items.map(item => ({ ...item, cappedScore: Math.min(item.score, maxScore) }));
	const selected: { id: string; score: number }[] = [];

	for (let i = 0; i < count && remaining.length > 0; i++) {
		const total = remaining.reduce((sum, item) => sum + item.cappedScore, 0);
		if (total <= 0) {
			const idx = Math.floor(Math.random() * remaining.length);
			const [chosen] = remaining.splice(idx, 1);
			selected.push({ id: chosen.id, score: chosen.score });
			continue;
		}
		let r = Math.random() * total;
		let chosenIndex = 0;
		for (let j = 0; j < remaining.length; j++) {
			r -= remaining[j].cappedScore;
			if (r <= 0) { chosenIndex = j; break; }
		}
		const [chosen] = remaining.splice(chosenIndex, 1);
		selected.push({ id: chosen.id, score: chosen.score });
	}

	return selected;
}

export function weightedRandomSample(items: { id: string; score: number }[], count: number): { id: string; score: number }[] {
	if (items.length <= count) return shuffleArray([...items]);
	const sorted = [...items].sort((a, b) => b.score - a.score);
	const mid = Math.floor(sorted.length / 2);
	const high = sorted.slice(0, mid);
	const low = sorted.slice(mid);
	const highCount = Math.ceil(count * 0.7);
	const lowCount = count - highCount;
	const pickedHigh = weightedSampleFromGroup(high, highCount);
	const lowShuffled = shuffleArray([...low]).slice(0, lowCount);
	return shuffleArray([...pickedHigh, ...lowShuffled]);
}
