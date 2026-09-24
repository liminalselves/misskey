/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { AGENT_IMAGE_PROVIDER_IDS, isAgentImageProvider } from '@/models/AgentImageProvider.js';
import {
	agentImageProviderIds,
	getAgentImageProviderDefinition,
} from '@/core/agent-image-providers.js';
import { AgentImageService } from '@/core/AgentImageService.js';
import type { MiMeta } from '@/models/Meta.js';

describe('agent image provider registry', () => {
	test('exposes exactly the canonical provider id list', () => {
		expect([...agentImageProviderIds]).toEqual([...AGENT_IMAGE_PROVIDER_IDS]);
		expect(isAgentImageProvider('aurora')).toBe(true);
		expect(isAgentImageProvider('qwen')).toBe(true);
		expect(isAgentImageProvider('sensenova')).toBe(true);
		expect(isAgentImageProvider('gemini')).toBe(false);
		expect(isAgentImageProvider(null)).toBe(false);
	});

	test('defines a definition with capabilities for every provider id', () => {
		for (const id of AGENT_IMAGE_PROVIDER_IDS) {
			const definition = getAgentImageProviderDefinition(id);
			expect(definition.id).toBe(id);
			expect(definition.capabilities.supportsSizeSelection).toBe(true);
		}
	});

	test('endpoint providers must ship request/parse adapters', () => {
		for (const id of AGENT_IMAGE_PROVIDER_IDS) {
			const definition = getAgentImageProviderDefinition(id);
			if (!definition.requiresEndpointCredentials) continue;
			expect(definition.buildRequest).toBeInstanceOf(Function);
			expect(definition.parseResult).toBeInstanceOf(Function);
			expect(definition.parseExpectation).toBeInstanceOf(Function);
		}
	});

	test('keeps the reference-image capability matrix in one place', () => {
		expect(getAgentImageProviderDefinition('aurora').capabilities).toMatchObject({
			supportsReferenceImage: false,
			supportsAdvancedParams: true,
			supportsArtistPreset: true,
		});
		expect(getAgentImageProviderDefinition('openai').capabilities).toMatchObject({
			supportsReferenceImage: true,
			supportsAdvancedParams: false,
		});
		expect(getAgentImageProviderDefinition('tiptotip').capabilities).toMatchObject({
			supportsReferenceImage: true,
			supportsAdvancedParams: false,
		});
		expect(getAgentImageProviderDefinition('qwen').capabilities).toMatchObject({
			supportsReferenceImage: false,
			supportsAdvancedParams: false,
		});
		expect(getAgentImageProviderDefinition('sensenova').capabilities).toMatchObject({
			supportsReferenceImage: true,
			supportsAdvancedParams: false,
		});
	});
});

describe('AgentImageService.listAvailableImageModels', () => {
	const stub = {} as never;
	const service = new AgentImageService(stub, stub, stub, stub, stub, stub, stub, stub, stub, stub, stub);

	function buildInstance(models: unknown[]): MiMeta {
		return { agentImageModels: models } as unknown as MiMeta;
	}

	test('drops rows whose provider is not registered instead of guessing', () => {
		const models = service.listAvailableImageModels(buildInstance([
			{ id: 'known', name: 'Known', provider: 'qwen' },
			{ id: 'unknown', name: 'Unknown', provider: 'gemini' },
			{ id: 'broken', name: 'Broken', provider: null },
		]));
		expect(models.map(m => m.id)).toEqual(['known']);
	});

	test('forces reference-image support off for providers without the capability', () => {
		const models = service.listAvailableImageModels(buildInstance([
			{ id: 'qwen-model', name: 'Qwen', provider: 'qwen', supportsReferenceImage: true },
			{ id: 'openai-model', name: 'OpenAI', provider: 'openai', supportsReferenceImage: true },
			{ id: 'sensenova-model', name: 'SenseNova', provider: 'sensenova', supportsReferenceImage: true },
		]));
		const qwen = models.find(m => m.id === 'qwen-model');
		const openai = models.find(m => m.id === 'openai-model');
		const senseNova = models.find(m => m.id === 'sensenova-model');
		expect(qwen?.supportsReferenceImage).toBe(false);
		expect(openai?.supportsReferenceImage).toBe(true);
		expect(senseNova?.supportsReferenceImage).toBe(true);
	});
});
