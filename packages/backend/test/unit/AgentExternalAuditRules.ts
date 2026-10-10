/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import dns from 'node:dns/promises';
import { jest } from '@jest/globals';
import { AGENT_EXTERNAL_AUDIT_PROVIDER_IDS, isAgentExternalAuditProvider } from '@/models/AgentExternalAuditProvider.js';
import { getAgentExternalAuditProviderDefinition } from '@/core/agent-external-audit-providers.js';
import {
	DEFAULT_AGENT_EXTERNAL_AUDIT_OTHER_RULE,
	cloneDefaultAgentExternalAuditRules,
	normalizeAgentExternalAuditRules,
} from '@/core/agent-external-audit-rules.js';
import {
	AgentExternalAuditService,
	buildDecisionAuditCriteria,
	buildOpenAiAuditPrompt,
	parseDecisionAuditDecision,
	parseAliyunInspectionBlocked,
	parseOpenAiAuditDecision,
} from '@/core/AgentExternalAuditService.js';

const rules = cloneDefaultAgentExternalAuditRules();
const otherRule = { ...DEFAULT_AGENT_EXTERNAL_AUDIT_OTHER_RULE };

describe('agent external audit providers and rules', () => {
	test('keeps provider ids and endpoint behavior in one registry', () => {
		expect(AGENT_EXTERNAL_AUDIT_PROVIDER_IDS).toEqual(['openai', 'aliyun-decision', 'jev-decision']);
		expect(isAgentExternalAuditProvider('jev-decision')).toBe(true);
		const jevUrl = new URL('https://pool.futureppo.top/v1/systemone');
		expect(getAgentExternalAuditProviderDefinition('jev-decision').normalizeUrl(jevUrl)).toBe(jevUrl.toString());
		expect(() => getAgentExternalAuditProviderDefinition('jev-decision').validateUrl(jevUrl)).not.toThrow();
		expect(() => getAgentExternalAuditProviderDefinition('jev-decision').validateUrl(new URL('https://example.com/v1/chat/completions'))).toThrow();
		expect(isAgentExternalAuditProvider('openai')).toBe(true);
		expect(isAgentExternalAuditProvider('unknown')).toBe(false);
		expect(getAgentExternalAuditProviderDefinition('openai').normalizeUrl(new URL('https://example.com/v1'))).toBe('https://example.com/v1/chat/completions');
		expect(() => getAgentExternalAuditProviderDefinition('aliyun-decision').validateUrl(new URL('https://example.com/v1/chat/completions'))).toThrow();
	});

	test.each(['allow', rules[0]!.id])('sends JEV object state and parses choice %s', async choice => {
		const lookup = jest.spyOn(dns, 'lookup').mockResolvedValue([{ address: '8.8.8.8', family: 4 }] as never);
		const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
			answers: { content_safety: { choice, confidence: 0.93, probabilities: { [choice]: 0.93 } } },
		})));
		try {
			const service = new AgentExternalAuditService({} as never, {} as never, {} as never, {} as never);
			const result = await service['callAuditModel']({
				id: 'jev', name: 'JEV', provider: 'jev-decision',
				apiModelName: 'jev-1.13.0', baseUrl: 'https://pool.futureppo.top/v1/systemone',
				apiKey: 'test-key', priority: 0, enabled: true,
			}, '总体标准', rules, otherRule, '用户内容', '模型回复', 1000);
			expect(fetchMock).toHaveBeenCalledWith('https://pool.futureppo.top/v1/systemone', expect.objectContaining({
				method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-key' },
			}));
			const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
			expect(body).toMatchObject({
				model: 'jev-1.13.0', state: { '用户侧': '用户内容', '模型侧': '模型回复' },
				questions: { content_safety: { type: 'choice', criteria: buildDecisionAuditCriteria(rules, otherRule) } },
			});
			expect(body.questions.content_safety.instructions).toContain('总体标准');
			expect(result).toMatchObject({ ok: true, decision: {
				action: choice === 'allow' ? 'allow' : 'block', confidence: 0.93,
				reason: choice === 'allow' ? null : rules[0]!.reason,
			} });
		} finally {
			lookup.mockRestore();
			fetchMock.mockRestore();
		}
	});

	test('normalizes rules and removes reserved or incomplete entries', () => {
		expect(normalizeAgentExternalAuditRules([
			{ id: 'valid_rule', name: '有效规则', reason: '固定原因', criteria: '判断标准', enabled: true },
			{ id: 'allow', name: '保留项', reason: '原因', criteria: '标准', enabled: true },
			{ id: 'missing', name: '', reason: '原因', criteria: '标准', enabled: true },
		])).toEqual([{ id: 'valid_rule', name: '有效规则', reason: '固定原因', criteria: '判断标准', enabled: true }]);
	});

	test('builds provider inputs from enabled rules only', () => {
		const disabled = [{ ...rules[0]!, enabled: false }, ...rules.slice(1)];
		const prompt = buildOpenAiAuditPrompt('总体标准', disabled, otherRule);
		const criteria = buildDecisionAuditCriteria(disabled, otherRule);
		expect(prompt).not.toContain(`${rules[0]!.id}｜`);
		expect(criteria).not.toHaveProperty(rules[0]!.id);
		expect(criteria).toHaveProperty('allow');
		expect(criteria).toHaveProperty('other_high_risk');
	});

	test('uses configured fixed reason for known OpenAI rule', () => {
		const rule = rules[0]!;
		const decision = parseOpenAiAuditDecision(JSON.stringify({ action: 'block', ruleId: rule.id, reason: '模型自行改写', confidence: 0.9 }), rules, otherRule);
		expect(decision).toMatchObject({ action: 'block', ruleId: rule.id, category: rule.name, reason: rule.reason, confidence: 0.9 });
	});

	test('maps unknown OpenAI rule to other and keeps its short reason', () => {
		const decision = parseOpenAiAuditDecision(JSON.stringify({ action: 'block', ruleId: 'unknown_rule', reason: '未覆盖的具体高风险原因', confidence: 0.7 }), rules, otherRule);
		expect(decision).toMatchObject({ ruleId: 'other_high_risk', category: '其他高风险内容', reason: '未覆盖的具体高风险原因' });
	});

	test('uses fallback reason for Aliyun other or unknown choice', () => {
		const decision = parseDecisionAuditDecision({ answers: { content_safety: { choice: 'unknown_rule', confidence: 0.8 } } }, '{}', rules, otherRule);
		expect(decision).toMatchObject({ ruleId: 'other_high_risk', reason: otherRule.reason, confidence: 0.8 });
	});

	test('treats Aliyun platform input inspection rejection as a block', () => {
		const body = JSON.stringify({ code: 'DataInspectionFailed', message: 'Input text data may contain inappropriate content.' });
		expect(parseAliyunInspectionBlocked(JSON.parse(body), body, otherRule)).toMatchObject({
			action: 'block',
			ruleId: 'other_high_risk',
			category: '其他高风险内容',
			reason: otherRule.reason,
			confidence: null,
		});
	});

	test('keeps other Aliyun 400 codes on the failure path', () => {
		expect(parseAliyunInspectionBlocked({ code: 'InvalidParameter', message: 'bad request' }, '{}', otherRule)).toBeNull();
	});

	test('returns allow without category or reason', () => {
		const decision = parseOpenAiAuditDecision('{"action":"allow","ruleId":"allow","confidence":1}', rules, otherRule);
		expect(decision).toMatchObject({ action: 'allow', ruleId: null, category: null, reason: null, confidence: 1 });
	});
});
