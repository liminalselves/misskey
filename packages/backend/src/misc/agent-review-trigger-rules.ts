/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { MiAgentReviewTriggerRule } from '@/models/Meta.js';

export type AgentReviewTriggerScope = 'session' | 'user';

export const AGENT_REVIEW_TRIGGER_SCOPES: readonly AgentReviewTriggerScope[] = ['session', 'user'];

/** 规则的统计范围；缺省（含旧数据、缺字段）一律按会话 */
export function reviewRuleScope(rule: { scope?: string | null } | null | undefined): AgentReviewTriggerScope {
	return rule?.scope === 'user' ? 'user' : 'session';
}

function ruleNumber(value: unknown, fallback: number, min: number, max: number): number {
	if (value == null || value === '') return fallback;
	const n = Number(value);
	if (!Number.isFinite(n)) return fallback;
	return Math.max(min, Math.min(max, Math.trunc(n)));
}

/** 外审规则统一在入口归一化，落库与管理端读取都补上显式 scope */
export function normalizeAgentReviewTriggerRules(value: unknown): MiAgentReviewTriggerRule[] {
	if (!Array.isArray(value)) return [];
	return value.map(item => {
		const rule = item != null && typeof item === 'object' ? item as Record<string, unknown> : {};
		return {
			id: typeof rule.id === 'string' ? rule.id : '',
			timeWindowMinutes: ruleNumber(rule.timeWindowMinutes, 60, 1, 10080),
			blockThreshold: ruleNumber(rule.blockThreshold, 5, 1, 1000),
			enabled: rule.enabled !== false,
			scope: reviewRuleScope(rule as { scope?: string | null }),
		};
	});
}
