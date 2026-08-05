/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { AgentService } from '@/core/AgentService.js';
import type { MiAgentCharacter } from '@/models/AgentCharacter.js';
import type { MiAgentDialogueStyle } from '@/models/AgentDialogueStyle.js';
import type { UsersRepository } from '@/models/_.js';
import { IsNull } from 'typeorm';
import * as Acct from '@/misc/acct.js';

export const agentGovernanceLogTypes = ['resolveAgentReview', 'setAgentSessionModerationBan', 'setAgentCharacterModerationBan'] as const;

export function escapeIlikePattern(s: string): string {
	return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function asIso(date: Date | null | undefined): string | null {
	return date == null ? null : date.toISOString();
}

export async function resolveUserIdFromAcctOrId(usersRepository: UsersRepository, input: string | null | undefined): Promise<string | null> {
	const value = input?.trim();
	if (!value) return null;

	const userById = await usersRepository.findOne({ where: { id: value }, select: ['id'] });
	if (userById) return userById.id;

	const acct = Acct.parse(value);
	if (!acct.username) return value;

	const userByAcct = await usersRepository.findOne({
		where: {
			usernameLower: acct.username.toLowerCase(),
			host: acct.host == null || acct.host === '' ? IsNull() : acct.host.toLowerCase(),
		},
		select: ['id'],
	});

	return userByAcct?.id ?? value;
}

export async function getAcctByUserId(usersRepository: UsersRepository, userId: string): Promise<string | null> {
	const user = await usersRepository.findOne({ where: { id: userId }, select: ['username', 'host'] });
	if (!user) return null;
	return `@${Acct.toString({ username: user.username, host: user.host })}`;
}

function extractTextFromWorldbook(worldbook: Array<Record<string, unknown>>): string {
	return worldbook.flatMap(entry => [
		typeof entry.title === 'string' ? entry.title : '',
		typeof entry.content === 'string' ? entry.content : '',
		...(Array.isArray(entry.keywords) ? entry.keywords.filter((keyword): keyword is string => typeof keyword === 'string') : []),
	]).join('\n');
}

function extractTextFromRules(rules: Array<Record<string, unknown>>): string {
	return rules.flatMap(rule => [
		typeof rule.name === 'string' ? rule.name : '',
		typeof rule.description === 'string' ? rule.description : '',
		typeof rule.content === 'string' ? rule.content : '',
	]).join('\n');
}

function riskTagsForText(params: {
	text: string;
	worldbookCount?: number;
	publishedVersion: number | null;
	promptOpenSourced: boolean;
	reviewStatus: string;
}): string[] {
	const tags: string[] = [];
	if (params.text.length > 6000) tags.push('长提示词');
	if ((params.worldbookCount ?? 0) > 0) tags.push(`世界书 ${params.worldbookCount}`);
	if (/越狱|jailbreak|忽略.*规则|ignore.*instruction/i.test(params.text)) tags.push('提示词注入');
	if (/色情|暴力|仇恨|违法|侵权|自杀|武器/.test(params.text)) tags.push('敏感词');
	if (params.publishedVersion != null) tags.push('更新再审');
	if (params.promptOpenSourced) tags.push('开源提示词');
	if (params.reviewStatus === 'rejected') tags.push('曾被拒绝');
	return tags;
}

export function packCharacterGovernanceRow(
	agentService: AgentService,
	row: MiAgentCharacter,
	user: unknown,
	avatar: unknown | null = null,
) {
	const worldbook = agentService.normalizeWorldbookEntries(row.worldbook);
	const riskText = [
		row.name,
		row.summary ?? '',
		row.personality,
		row.background,
		row.speakingStyle,
		row.greeting,
		row.exampleDialogue,
		row.forbiddenBehavior,
		extractTextFromWorldbook(row.worldbook),
		extractTextFromRules(row.rules),
	].join('\n');

	return {
		kind: 'character' as const,
		id: row.id,
		userId: row.userId,
		name: row.name,
		summary: row.summary,
		reviewStatus: row.reviewStatus,
		isPublished: row.isPublished,
		publishedVersion: row.publishedVersion,
		moderationBanned: row.moderationBanned,
		promptOpenSourced: row.promptOpenSourced,
		reviewRejectReason: row.reviewRejectReason,
		reviewRejectMessage: row.reviewRejectMessage,
		reviewInternalNote: row.reviewInternalNote,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
		user,
		avatar,
		worldbookCount: worldbook.length,
		riskTags: riskTagsForText({
			text: riskText,
			worldbookCount: worldbook.length,
			publishedVersion: row.publishedVersion,
			promptOpenSourced: row.promptOpenSourced,
			reviewStatus: row.reviewStatus,
		}),
	};
}

export function packStyleGovernanceRow(row: MiAgentDialogueStyle, user: unknown) {
	const riskText = [row.name, row.summary ?? '', row.body].join('\n');
	return {
		kind: 'style' as const,
		id: row.id,
		userId: row.userId,
		name: row.name,
		summary: row.summary,
		reviewStatus: row.reviewStatus,
		isPublished: row.isPublished,
		publishedVersion: row.publishedVersion,
		moderationBanned: false,
		promptOpenSourced: row.promptOpenSourced,
		reviewRejectReason: row.reviewRejectReason,
		reviewRejectMessage: row.reviewRejectMessage,
		reviewInternalNote: row.reviewInternalNote,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
		user,
		avatar: null,
		worldbookCount: 0,
		riskTags: riskTagsForText({
			text: riskText,
			publishedVersion: row.publishedVersion,
			promptOpenSourced: row.promptOpenSourced,
			reviewStatus: row.reviewStatus,
		}),
	};
}

export function buildCharacterReviewDiff(agentService: AgentService, row: MiAgentCharacter) {
	const fields: Array<{ key: string; draftPreview: string; publishedPreview: string }> = [];
	const pub = row.publishedSnapshot ? agentService.parseCharacterSnapshot(row.publishedSnapshot) : null;
	if (!pub) return { hasChanges: false, fields };
	const draft = agentService.buildCharacterSnapshotFromRow(row);
	const push = (key: string, draftVal: string, pubVal: string) => {
		if (draftVal !== pubVal) fields.push({ key, draftPreview: draftVal, publishedPreview: pubVal });
	};
	push('name', draft.name, pub.name);
	push('summary', draft.summary ?? '', pub.summary ?? '');
	push('personality', draft.personality, pub.personality);
	push('background', draft.background, pub.background);
	push('speakingStyle', draft.speakingStyle, pub.speakingStyle);
	push('greeting', draft.greeting, pub.greeting);
	push('exampleDialogue', draft.exampleDialogue, pub.exampleDialogue);
	push('forbiddenBehavior', draft.forbiddenBehavior, pub.forbiddenBehavior);
	push('avatarFileId', draft.avatarFileId ?? '', pub.avatarFileId ?? '');
	push('worldbook', agentService.worldbookStableString(draft.worldbook), agentService.worldbookStableString(pub.worldbook));
	push('rules', agentService.rulesStableString(draft.rules), agentService.rulesStableString(pub.rules));
	return { hasChanges: fields.length > 0, fields };
}

export function buildStyleReviewDiff(agentService: AgentService, row: MiAgentDialogueStyle) {
	const fields: Array<{ key: string; draftPreview: string; publishedPreview: string }> = [];
	const pub = row.publishedSnapshot ? agentService.parseStyleSnapshot(row.publishedSnapshot) : null;
	if (!pub) return { hasChanges: false, fields };
	const push = (key: string, draftVal: string, pubVal: string) => {
		if (draftVal !== pubVal) fields.push({ key, draftPreview: draftVal, publishedPreview: pubVal });
	};
	push('name', row.name, pub.name);
	push('summary', row.summary ?? '', pub.summary ?? '');
	push('body', row.body, pub.body);
	return { hasChanges: fields.length > 0, fields };
}

export function packCharacterGovernanceDetail(agentService: AgentService, row: MiAgentCharacter, user: unknown, avatar: unknown | null) {
	const base = packCharacterGovernanceRow(agentService, row, user, avatar);
	return {
		...base,
		personality: row.personality,
		background: row.background,
		speakingStyle: row.speakingStyle,
		greeting: row.greeting,
		exampleTurns: agentService.exampleTurnsFromStored(row.exampleDialogue),
		forbiddenBehavior: row.forbiddenBehavior,
		worldbook: agentService.normalizeWorldbookEntries(row.worldbook),
		rules: agentService.normalizeRules(row.rules),
		publishedSnapshot: row.publishedSnapshot ? agentService.parseCharacterSnapshot(row.publishedSnapshot) : null,
		diff: buildCharacterReviewDiff(agentService, row),
	};
}

export function packStyleGovernanceDetail(agentService: AgentService, row: MiAgentDialogueStyle, user: unknown) {
	const base = packStyleGovernanceRow(row, user);
	return {
		...base,
		body: row.body,
		publishedSnapshot: row.publishedSnapshot ? agentService.parseStyleSnapshot(row.publishedSnapshot) : null,
		diff: buildStyleReviewDiff(agentService, row),
	};
}

export function packSessionGovernanceRow(row: any, user: unknown, characterName: string) {
	return {
		id: row.id,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
		userId: row.userId,
		name: row.name,
		characterId: row.characterId,
		dialogueStyleId: row.dialogueStyleId,
		sessionKind: row.sessionKind,
		lastMessageAt: asIso(row.lastMessageAt),
		agentReplyPending: row.agentReplyPending,
		moderationBanned: row.moderationBanned,
		characterName,
		user,
	};
}

export function packMessageGovernanceRow(m: any, user: unknown | null) {
	const s = m.session;
	const ch = s?.character;
	return {
		id: m.id,
		role: m.role,
		content: m.content,
		createdAt: m.createdAt.toISOString(),
		sessionId: m.sessionId,
		sessionName: s?.name ?? '',
		sessionKind: s?.sessionKind ?? 'community',
		userId: s?.userId ?? '',
		user,
		characterId: s?.characterId ?? '',
		characterName: ch?.name ?? '',
		dialogueStyleId: s?.dialogueStyleId ?? null,
		sessionModerationBanned: s?.moderationBanned ?? false,
		characterModerationBanned: ch?.moderationBanned ?? false,
	};
}
