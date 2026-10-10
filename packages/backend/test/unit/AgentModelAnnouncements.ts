/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { jest } from '@jest/globals';
import { MoreThan } from 'typeorm';
import type { MiMeta } from '@/models/Meta.js';
import { buildAgentModelChanges } from '@/misc/agent-model-changes.js';
import { AgentModelAnnouncementService } from '@/core/AgentModelAnnouncementService.js';
import { MetaService } from '@/core/MetaService.js';

const chatModel = {
	id: 'chat-1', name: 'Chat One', description: 'Old description',
	baseUrl: 'https://example.com/v1', apiKey: 'secret', apiModelName: 'upstream',
	maxContextTokens: 8192, maxOutputTokensPerCall: 1024,
	costPerCall: 2, dailyFreeQuota: 10,
};
const imageModel = { id: 'image-1', name: 'Image One', provider: 'openai' as const, costPerCall: 3, dailyFreeQuota: 5 };

function instance(overrides: Partial<MiMeta> = {}): MiMeta {
	return {
		agentLlmModels: [chatModel],
		agentLlmModelGroups: [],
		agentDefaultModelId: 'chat-1',
		agentImageModels: [imageModel],
		agentImageDefaultParams: {},
		agentImageArtistPresets: [],
		agentImageDefaultArtistPresetId: null,
		agentImageCostPerCall: 3,
		...overrides,
	} as MiMeta;
}

function serviceFixture(cursor: string | null = null) {
	const repository = {
		existsBy: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
		find: jest.fn<(...args: unknown[]) => Promise<unknown[]>>().mockResolvedValue([]),
	};
	const registry = {
		getItem: jest.fn<() => Promise<{ value: string } | null>>().mockResolvedValue(cursor ? { value: cursor } : null),
		set: jest.fn<(...args: unknown[]) => Promise<void>>().mockResolvedValue(),
	};
	const service = new AgentModelAnnouncementService(repository as never, { gen: () => 'new-id' } as never, registry as never);
	return { service, repository, registry };
}

describe('agent model announcement diffs', () => {
	test('records quota, prices and descriptions for both model kinds without credentials', () => {
		const changes = buildAgentModelChanges(instance(), instance({
			agentLlmModels: [{ ...chatModel, dailyFreeQuota: 20, costPerCall: 1, description: 'New description' }],
			agentImageModels: [{ ...imageModel, dailyFreeQuota: 8, description: 'New image description' }],
		}));
		expect(changes).toHaveLength(2);
		expect(changes[0].fields).toEqual(expect.arrayContaining([
			{ label: '每日免费次数', before: '10 次', after: '20 次' },
			{ label: '每次调用费用', before: '2', after: '1' },
			{ label: '简介', before: 'Old description', after: 'New description' },
		]));
		expect(changes[1].fields).toContainEqual({ label: '每日免费次数', before: '5 次', after: '8 次' });
		expect(JSON.stringify(changes)).not.toMatch(/secret|example\.com|upstream/);
	});

	test('distinguishes additions, relisting and removal', () => {
		const before = instance({ agentLlmModels: [chatModel, { ...chatModel, id: 'archived', unlisted: true }] });
		const after = instance({ agentLlmModels: [{ ...chatModel, id: 'archived' }, { ...chatModel, id: 'new' }] });
		expect(buildAgentModelChanges(before, after).map(change => [change.modelId, change.type])).toEqual([
			['archived', 'relisted'], ['new', 'added'], ['chat-1', 'removed'],
		]);
		expect(buildAgentModelChanges(before, after).find(change => change.modelId === 'new')?.fields).toContainEqual({ label: '每日免费次数', before: '', after: '10 次' });
	});

	test('ignores no-op saves, credentials, upstream names, reordering and hidden models', () => {
		const second = { ...chatModel, id: 'chat-2', name: 'Chat Two' };
		const archived = { ...chatModel, id: 'archived', unlisted: true };
		const before = instance({ agentLlmModels: [chatModel, second, archived] });
		const after = instance({
			agentLlmModels: [second, { ...chatModel, apiKey: 'replacement', baseUrl: 'https://new.example.com/v1', apiModelName: 'new-upstream' }, { ...archived, description: 'Hidden edit' }],
			agentImageModels: [{ ...imageModel, apiKey: 'new-image-key', apiUrl: 'https://new.example.com/image', apiModelName: 'new-image-upstream' }],
		});
		expect(buildAgentModelChanges(before, before)).toEqual([]);
		expect(buildAgentModelChanges(before, after)).toEqual([]);
	});

	test('reports effective token prices but ignores unused per-token fields', () => {
		const changed = { ...chatModel, pricePerMillionOutputTokens: 5 };
		expect(buildAgentModelChanges(instance(), instance({ agentLlmModels: [changed] }))).toEqual([]);
		const before = instance({ agentLlmModels: [{ ...chatModel, billingMode: 'usage', pricePerMillionOutputTokens: 2 }] });
		const after = instance({ agentLlmModels: [{ ...changed, billingMode: 'usage' }] });
		expect(buildAgentModelChanges(before, after)[0].fields).toEqual([{ label: '输出单价', before: '2 / 百万 tokens', after: '5 / 百万 tokens' }]);
	});

	test('uses inherited image defaults and reports capability and availability changes', () => {
		const before = instance({ agentImageModels: [{ ...imageModel, costPerCall: null }] });
		const after = instance({ agentImageModels: [{ ...imageModel, costPerCall: null, supportsReferenceImage: true }], agentImageCostPerCall: 4, agentImageDefaultParams: { steps: 28 } });
		expect(buildAgentModelChanges(before, after)[0].fields).toEqual(expect.arrayContaining([
			{ label: '每次调用费用', before: '3', after: '4' },
			{ label: '参考图', before: '不支持', after: '支持' },
		]));
		expect(buildAgentModelChanges(before, after)[0].fields.some(field => field.label === '默认步数')).toBe(false);
		expect(buildAgentModelChanges(before, instance({ agentImageModels: [{ ...imageModel, enabled: false }] }))[0].type).toBe('removed');
		const aurora = { ...imageModel, provider: 'aurora' as const };
		const advancedBefore = instance({ agentImageModels: [aurora], agentImageDefaultParams: { steps: 20 } });
		const advancedAfter = instance({ agentImageModels: [aurora], agentImageDefaultParams: { steps: 28 } });
		expect(buildAgentModelChanges(advancedBefore, advancedAfter)[0].fields).toEqual([{ label: '默认步数', before: '20', after: '28' }]);
	});
});

describe('agent model announcement persistence', () => {
	test('writes actual changes using the supplied save transaction, without initial backfill', async () => {
		const { service } = serviceFixture();
		const manager = { insert: jest.fn<(...args: unknown[]) => Promise<void>>().mockResolvedValue() };
		await service.recordChanges(undefined, instance(), manager as never);
		await service.recordChanges(instance(), instance(), manager as never);
		expect(manager.insert).not.toHaveBeenCalled();
		await service.recordChanges(instance(), instance({ agentLlmModels: [{ ...chatModel, dailyFreeQuota: 20 }] }), manager as never);
		expect(manager.insert).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ scope: 'chat', changes: expect.any(Array) }));
	});

	test('acknowledges only the displayed id and retains later updates for the next query', async () => {
		const { service, repository, registry } = serviceFixture('001');
		await service.read('user', '002');
		expect(registry.set).toHaveBeenCalledWith('user', null, ['client', 'agentModelAnnouncements'], 'lastReadId', '002');
		registry.getItem.mockResolvedValue({ value: '002' });
		await service.getUnread('user');
		expect(repository.find).toHaveBeenCalledWith({ where: { id: MoreThan('002') }, order: { id: 'ASC' } });
		await service.read('user', '001');
		expect(registry.set).toHaveBeenCalledTimes(1);
	});

	test('does not acknowledge nonexistent announcements', async () => {
		const { service, repository, registry } = serviceFixture();
		repository.existsBy.mockResolvedValue(false);
		expect(await service.read('user', 'missing')).toBe(false);
		expect(registry.set).not.toHaveBeenCalled();
	});

	test('runs announcement writes before commit and does not broadcast a failed save', async () => {
		const before = instance();
		const after = instance({ agentLlmModels: [{ ...chatModel, dailyFreeQuota: 20 }] });
		const manager = {
			find: jest.fn<() => Promise<MiMeta[]>>().mockResolvedValueOnce([before]).mockResolvedValueOnce([after]),
			update: jest.fn<() => Promise<void>>().mockResolvedValue(),
		};
		const db = { transaction: async (run: (value: typeof manager) => Promise<MiMeta>) => run(manager) };
		const events = { publishInternalEvent: jest.fn() };
		const service = new MetaService({ on: jest.fn(), off: jest.fn() } as never, db as never, {} as never, events as never);
		const onUpdated = jest.fn<(...args: unknown[]) => Promise<void>>().mockRejectedValue(new Error('announcement write failed'));
		await expect(service.update({ agentLlmModels: after.agentLlmModels }, onUpdated)).rejects.toThrow('announcement write failed');
		expect(onUpdated).toHaveBeenCalledWith(before, after, manager);
		expect(events.publishInternalEvent).not.toHaveBeenCalled();
		service.dispose();
	});
});
