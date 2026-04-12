/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { AgentMessagesRepository, AgentPlazaReviewsRepository, AgentSessionsRepository } from '@/models/_.js';

export type PlazaRatingAggregate = { average: number | null; count: number };

function parseAggregateRow(avg: string | null, cnt: string | null): PlazaRatingAggregate {
	const count = cnt != null ? parseInt(cnt, 10) : 0;
	const rawAvg = avg != null ? parseFloat(avg) : null;
	return {
		count: Number.isFinite(count) ? count : 0,
		average: rawAvg != null && Number.isFinite(rawAvg) ? Math.round(rawAvg * 100) / 100 : null,
	};
}

/** 広場レビューの集計（キャラ別） */
export async function batchPlazaRatingsByCharacterIds(
	repo: AgentPlazaReviewsRepository,
	characterIds: string[],
): Promise<Map<string, PlazaRatingAggregate>> {
	const out = new Map<string, PlazaRatingAggregate>();
	for (const id of characterIds) {
		out.set(id, { average: null, count: 0 });
	}
	if (characterIds.length === 0) return out;
	const rows = await repo.createQueryBuilder('r')
		.select('r.characterId', 'characterId')
		.addSelect('AVG(r.stars)', 'avg')
		.addSelect('COUNT(*)', 'cnt')
		.where('r.characterId IN (:...ids)', { ids: characterIds })
		.groupBy('r.characterId')
		.getRawMany<{ characterId: string; avg: string | null; cnt: string }>();
	for (const row of rows) {
		out.set(row.characterId, parseAggregateRow(row.avg, row.cnt));
	}
	return out;
}

/** 広場レビューの集計（スタイル別） */
export async function batchPlazaRatingsByStyleIds(
	repo: AgentPlazaReviewsRepository,
	styleIds: string[],
): Promise<Map<string, PlazaRatingAggregate>> {
	const out = new Map<string, PlazaRatingAggregate>();
	for (const id of styleIds) {
		out.set(id, { average: null, count: 0 });
	}
	if (styleIds.length === 0) return out;
	const rows = await repo.createQueryBuilder('r')
		.select('r.styleId', 'styleId')
		.addSelect('AVG(r.stars)', 'avg')
		.addSelect('COUNT(*)', 'cnt')
		.where('r.styleId IN (:...ids)', { ids: styleIds })
		.groupBy('r.styleId')
		.getRawMany<{ styleId: string; avg: string | null; cnt: string }>();
	for (const row of rows) {
		out.set(row.styleId, parseAggregateRow(row.avg, row.cnt));
	}
	return out;
}

/** community セッション数（キャラ別） */
export async function batchCommunitySessionCountByCharacterIds(
	repo: AgentSessionsRepository,
	characterIds: string[],
): Promise<Map<string, number>> {
	const out = new Map<string, number>(characterIds.map(id => [id, 0]));
	if (characterIds.length === 0) return out;
	const rows = await repo.createQueryBuilder('s')
		.select('s.characterId', 'characterId')
		.addSelect('COUNT(*)', 'cnt')
		.where('s.sessionKind = :kind', { kind: 'community' })
		.andWhere('s.characterId IN (:...ids)', { ids: characterIds })
		.groupBy('s.characterId')
		.getRawMany<{ characterId: string; cnt: string }>();
	for (const row of rows) {
		const n = parseInt(row.cnt, 10);
		out.set(row.characterId, Number.isFinite(n) ? n : 0);
	}
	return out;
}

/** community セッションで当該会話スタイルを選んだ回数（作成時の plazaStatsDialogueStyleId、切替後も固定） */
export async function batchCommunitySessionCountByStyleIds(
	repo: AgentSessionsRepository,
	styleIds: string[],
): Promise<Map<string, number>> {
	const out = new Map<string, number>(styleIds.map(id => [id, 0]));
	if (styleIds.length === 0) return out;
	const coalesced = 'COALESCE(s.plazaStatsDialogueStyleId, s.dialogueStyleId)';
	const rows = await repo.createQueryBuilder('s')
		.select(coalesced, 'styleKey')
		.addSelect('COUNT(*)', 'cnt')
		.where('s.sessionKind = :kind', { kind: 'community' })
		.andWhere(`${coalesced} IN (:...ids)`, { ids: styleIds })
		.groupBy(coalesced)
		.getRawMany<{ styleKey: string; cnt: string }>();
	for (const row of rows) {
		if (row.styleKey == null) continue;
		const n = parseInt(row.cnt, 10);
		out.set(row.styleKey, Number.isFinite(n) ? n : 0);
	}
	return out;
}

/** community セッションにおける assistant メッセージ数（キャラ別・AI 返信回数） */
export async function batchCommunityAssistantReplyCountByCharacterIds(
	repo: AgentMessagesRepository,
	characterIds: string[],
): Promise<Map<string, number>> {
	const out = new Map<string, number>(characterIds.map(id => [id, 0]));
	if (characterIds.length === 0) return out;
	const rows = await repo.createQueryBuilder('m')
		.innerJoin('m.session', 's')
		.select('s.characterId', 'characterId')
		.addSelect('COUNT(*)', 'cnt')
		.where('m.role = :role', { role: 'assistant' })
		.andWhere('s.sessionKind = :kind', { kind: 'community' })
		.andWhere('s.characterId IN (:...ids)', { ids: characterIds })
		.groupBy('s.characterId')
		.getRawMany<{ characterId: string; cnt: string }>();
	for (const row of rows) {
		const n = parseInt(row.cnt, 10);
		out.set(row.characterId, Number.isFinite(n) ? n : 0);
	}
	return out;
}

/** community セッションにおける assistant メッセージ数（スタイル別・送信時 statsDialogueStyleId を優先） */
export async function batchCommunityAssistantReplyCountByStyleIds(
	repo: AgentMessagesRepository,
	styleIds: string[],
): Promise<Map<string, number>> {
	const out = new Map<string, number>(styleIds.map(id => [id, 0]));
	if (styleIds.length === 0) return out;
	const styleKeyExpr = 'COALESCE(m.statsDialogueStyleId, s.plazaStatsDialogueStyleId, s.dialogueStyleId)';
	const rows = await repo.createQueryBuilder('m')
		.innerJoin('m.session', 's')
		.select(styleKeyExpr, 'styleKey')
		.addSelect('COUNT(*)', 'cnt')
		.where('m.role = :role', { role: 'assistant' })
		.andWhere('s.sessionKind = :kind', { kind: 'community' })
		.andWhere(`${styleKeyExpr} IN (:...ids)`, { ids: styleIds })
		.groupBy(styleKeyExpr)
		.getRawMany<{ styleKey: string; cnt: string }>();
	for (const row of rows) {
		if (row.styleKey == null) continue;
		const n = parseInt(row.cnt, 10);
		out.set(row.styleKey, Number.isFinite(n) ? n : 0);
	}
	return out;
}
