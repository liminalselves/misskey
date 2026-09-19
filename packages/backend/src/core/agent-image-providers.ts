/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { AgentImageProvider } from '@/models/AgentImageProvider.js';
import { AGENT_IMAGE_PROVIDER_IDS } from '@/models/AgentImageProvider.js';

export type AgentImageSize = 'portrait' | 'landscape' | 'square';

export type AgentReferenceImage = {
	contentType: string;
	data: Buffer;
};

export type AgentImageResult =
	| { type: 'base64'; value: string }
	| { type: 'url'; value: string };

export type AgentImageProviderCapabilities = {
	supportsReferenceImage: boolean;
	supportsSizeSelection: boolean;
	supportsAdvancedParams: boolean;
	supportsArtistPreset: boolean;
};

type AgentImageRequestContext = {
	apiKey: string;
	model: string;
	prompt: string;
	size: AgentImageSize;
	referenceImages?: AgentReferenceImage[];
	negativePrompt?: string | null;
	isChatCompletions?: boolean;
};

export type AgentImageProviderDefinition = {
	id: AgentImageProvider;
	capabilities: AgentImageProviderCapabilities;
	requiresEndpointCredentials: boolean;
	buildRequest?: (context: AgentImageRequestContext) => AgentImageRequestInit;
	parseResult?: (value: unknown, context: Pick<AgentImageRequestContext, 'isChatCompletions'>) => AgentImageResult;
	parseExpectation?: (context: Pick<AgentImageRequestContext, 'isChatCompletions'>) => string;
};

export type AgentImageRequestInit = {
	method: 'POST';
	headers: Record<string, string>;
	body: string;
};

function referenceImageDataUrl(referenceImage: AgentReferenceImage): string {
	return `data:${referenceImage.contentType};base64,${referenceImage.data.toString('base64')}`;
}

function normalizeReferenceImages(referenceImages?: AgentReferenceImage | AgentReferenceImage[] | null): AgentReferenceImage[] {
	if (referenceImages == null) return [];
	return (Array.isArray(referenceImages) ? referenceImages : [referenceImages]).slice(0, 4);
}

export function openAiImageSize(size: AgentImageSize): string {
	switch (size) {
		case 'portrait': return '1024x1536';
		case 'landscape': return '1536x1024';
		case 'square': return '1024x1024';
	}
}

export function buildOpenAiImageGenerationRequest(model: string, prompt: string, size: AgentImageSize, referenceImages?: AgentReferenceImage | AgentReferenceImage[] | null): Record<string, unknown> {
	const images = normalizeReferenceImages(referenceImages).map(referenceImageDataUrl);
	return {
		model,
		prompt,
		n: 1,
		size: openAiImageSize(size),
		...(images.length === 1 ? { image: images[0] } : images.length > 1 ? { image: images } : {}),
	};
}

export function buildOpenAiImageGenerationRequestInit(apiKey: string, model: string, prompt: string, size: AgentImageSize, referenceImages?: AgentReferenceImage | AgentReferenceImage[] | null): AgentImageRequestInit {
	return {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify(buildOpenAiImageGenerationRequest(model, prompt, size, referenceImages)),
	};
}

// tiptotip 网关主流国内通道（火山 seedream 等）要求总像素不低于 2K（3686400），分辨率取 2K 档
export function tiptotipImageResolution(size: AgentImageSize): string {
	switch (size) {
		case 'portrait': return '1728x2304';
		case 'landscape': return '2304x1728';
		case 'square': return '2048x2048';
	}
}

// tiptotip 网关（https://ai.tiptotip.cn）兼容 OpenAI 生图协议，但分辨率参数用 resolution，
// 且需显式指定 response_format: b64_json 才返回 Base64 数据
export function buildTiptotipImageGenerationRequest(model: string, prompt: string, size: AgentImageSize, referenceImages?: AgentReferenceImage | AgentReferenceImage[] | null): Record<string, unknown> {
	const images = normalizeReferenceImages(referenceImages).map(referenceImageDataUrl);
	return {
		model,
		prompt,
		n: 1,
		resolution: tiptotipImageResolution(size),
		response_format: 'b64_json',
		...(images.length === 1 ? { image: images[0] } : images.length > 1 ? { image: images } : {}),
	};
}

export function buildTiptotipImageGenerationRequestInit(apiKey: string, model: string, prompt: string, size: AgentImageSize, referenceImages?: AgentReferenceImage | AgentReferenceImage[] | null): AgentImageRequestInit {
	return {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify(buildTiptotipImageGenerationRequest(model, prompt, size, referenceImages)),
	};
}

export function buildOpenAiChatImageGenerationRequest(model: string, prompt: string, referenceImages?: AgentReferenceImage | AgentReferenceImage[] | null): Record<string, unknown> {
	const content: Array<Record<string, unknown>> = [{ type: 'text', text: prompt }];
	for (const referenceImage of normalizeReferenceImages(referenceImages)) {
		content.push({ type: 'image_url', image_url: { url: referenceImageDataUrl(referenceImage) } });
	}
	return {
		model,
		stream: false,
		messages: [{ role: 'user', content }],
	};
}

export function buildOpenAiChatImageGenerationRequestInit(apiKey: string, model: string, prompt: string, referenceImages?: AgentReferenceImage | AgentReferenceImage[] | null): AgentImageRequestInit {
	return {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify(buildOpenAiChatImageGenerationRequest(model, prompt, referenceImages)),
	};
}

export function parseOpenAiImageResult(value: unknown): AgentImageResult {
	if (value == null || typeof value !== 'object') throw new Error('Invalid OpenAI image response.');
	const data = (value as { data?: unknown }).data;
	if (!Array.isArray(data) || data.length === 0 || data[0] == null || typeof data[0] !== 'object') {
		throw new Error('OpenAI image response has no image data.');
	}
	const first = data[0] as { b64_json?: unknown; url?: unknown };
	if (typeof first.b64_json === 'string' && first.b64_json.trim() !== '') {
		return { type: 'base64', value: first.b64_json.trim() };
	}
	if (typeof first.url === 'string' && first.url.trim() !== '') {
		return { type: 'url', value: first.url.trim() };
	}
	throw new Error('OpenAI image response has no supported image value.');
}

export function parseOpenAiChatImageResult(value: unknown): AgentImageResult {
	try {
		return parseOpenAiImageResult(value);
	} catch {
		// Some OpenAI-compatible gateways return the generated image in chat content.
	}
	const message = (value as { choices?: Array<{ message?: { content?: unknown; image_url?: unknown; images?: unknown } }> })?.choices?.[0]?.message;
	const content = message?.content;
	const contentImageUrl = Array.isArray(content)
		? content.find(item => typeof item === 'object' && item != null && typeof (item as { image_url?: { url?: unknown } }).image_url?.url === 'string') as { image_url: { url: string } } | undefined
		: undefined;
	const messageImageUrl = typeof (message?.image_url as { url?: unknown } | undefined)?.url === 'string'
		? (message?.image_url as { url: string }).url
		: Array.isArray(message?.images) && typeof (message.images[0] as { url?: unknown } | undefined)?.url === 'string'
			? (message.images[0] as { url: string }).url
			: null;
	const text = typeof content === 'string'
		? content.trim()
		: Array.isArray(content)
			? content.map(item => typeof item === 'object' && item != null ? String((item as { text?: unknown }).text ?? '') : '').join('').trim()
			: '';
	const markdownUrl = text.match(/!\[[^\]]*\]\((?:https:\/\/|data:image\/)[^)\s]+\)/)?.[0]?.replace(/^!\[[^\]]*\]\(|\)$/g, '');
	const candidate = contentImageUrl?.image_url.url ?? messageImageUrl ?? markdownUrl ?? text;
	const dataUrl = candidate.match(/^data:image\/[^;]+;base64,([A-Za-z0-9+/=\s]+)$/i)?.[1];
	if (dataUrl) return { type: 'base64', value: dataUrl };
	if (/^https:\/\//i.test(candidate)) return { type: 'url', value: candidate };
	if (/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(candidate)) {
		return { type: 'base64', value: candidate };
	}
	throw new Error('OpenAI chat response has no supported image value.');
}

export function qwenImageSize(size: AgentImageSize): string {
	switch (size) {
		case 'portrait': return '1728*2368';
		case 'landscape': return '2368*1728';
		case 'square': return '2048*2048';
	}
}

export function buildQwenImageGenerationRequest(model: string, prompt: string, negativePrompt: string | null, size: AgentImageSize): Record<string, unknown> {
	return {
		model,
		input: { prompt },
		parameters: {
			n: 1,
			size: qwenImageSize(size),
			...(negativePrompt != null && negativePrompt.trim() !== '' ? { negative_prompt: negativePrompt.trim().slice(0, 500) } : {}),
		},
	};
}

export function buildQwenImageGenerationRequestInit(apiKey: string, model: string, prompt: string, negativePrompt: string | null, size: AgentImageSize): AgentImageRequestInit {
	return {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify(buildQwenImageGenerationRequest(model, prompt, negativePrompt, size)),
	};
}

export function parseQwenImageResult(value: unknown): AgentImageResult {
	if (value == null || typeof value !== 'object') throw new Error('Invalid Qwen image response.');
	const output = (value as { output?: unknown }).output;
	if (output == null || typeof output !== 'object') throw new Error('Qwen image response has no output.');
	const o = output as { task_status?: unknown; results?: unknown };
	const status = typeof o.task_status === 'string' ? o.task_status.trim().toLowerCase() : '';
	if (status !== '' && status !== 'succeeded' && status !== 'success') {
		throw new Error(`Qwen image task did not succeed (task_status: ${o.task_status}).`);
	}
	const results = Array.isArray(o.results) ? o.results : [];
	const first = results.find(item => {
		if (typeof item === 'string' && item.trim() !== '') return true;
		return typeof item === 'object' && item != null && typeof (item as { url?: unknown }).url === 'string' && (item as { url: string }).url.trim() !== '';
	});
	if (typeof first === 'string') return { type: 'url', value: first.trim() };
	if (typeof first === 'object' && first != null) return { type: 'url', value: (first as { url: string }).url.trim() };
	throw new Error('Qwen image response has no image URL in output.results.');
}

const endpointCapabilities = {
	supportsReferenceImage: true,
	supportsSizeSelection: true,
	supportsAdvancedParams: false,
	supportsArtistPreset: false,
} satisfies AgentImageProviderCapabilities;

const AGENT_IMAGE_PROVIDERS: Record<AgentImageProvider, AgentImageProviderDefinition> = {
	aurora: {
		id: 'aurora',
		capabilities: {
			supportsReferenceImage: false,
			supportsSizeSelection: true,
			supportsAdvancedParams: true,
			supportsArtistPreset: true,
		},
		requiresEndpointCredentials: false,
	},
	openai: {
		id: 'openai',
		capabilities: endpointCapabilities,
		requiresEndpointCredentials: true,
		buildRequest: context => context.isChatCompletions
			? buildOpenAiChatImageGenerationRequestInit(context.apiKey, context.model, context.prompt, context.referenceImages)
			: buildOpenAiImageGenerationRequestInit(context.apiKey, context.model, context.prompt, context.size, context.referenceImages),
		parseResult: (value, context) => context.isChatCompletions ? parseOpenAiChatImageResult(value) : parseOpenAiImageResult(value),
		parseExpectation: context => context.isChatCompletions
			? 'choices[0].message content containing a Base64 image or HTTPS image URL'
			: 'data[0].b64_json or data[0].url',
	},
	tiptotip: {
		id: 'tiptotip',
		capabilities: endpointCapabilities,
		requiresEndpointCredentials: true,
		buildRequest: context => context.isChatCompletions
			? buildOpenAiChatImageGenerationRequestInit(context.apiKey, context.model, context.prompt, context.referenceImages)
			: buildTiptotipImageGenerationRequestInit(context.apiKey, context.model, context.prompt, context.size, context.referenceImages),
		parseResult: (value, context) => context.isChatCompletions ? parseOpenAiChatImageResult(value) : parseOpenAiImageResult(value),
		parseExpectation: context => context.isChatCompletions
			? 'choices[0].message content containing a Base64 image or HTTPS image URL'
			: 'data[0].b64_json or data[0].url',
	},
	qwen: {
		id: 'qwen',
		capabilities: {
			supportsReferenceImage: false,
			supportsSizeSelection: true,
			supportsAdvancedParams: false,
			supportsArtistPreset: false,
		},
		requiresEndpointCredentials: true,
		buildRequest: context => buildQwenImageGenerationRequestInit(context.apiKey, context.model, context.prompt, context.negativePrompt ?? null, context.size),
		parseResult: value => parseQwenImageResult(value),
		parseExpectation: () => 'output.results containing image URLs',
	},
};

export const agentImageProviderIds = AGENT_IMAGE_PROVIDER_IDS;

export function getAgentImageProviderDefinition(provider: AgentImageProvider): AgentImageProviderDefinition {
	return AGENT_IMAGE_PROVIDERS[provider];
}
