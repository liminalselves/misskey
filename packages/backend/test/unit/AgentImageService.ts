/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import {
	buildOpenAiImageGenerationRequest,
	buildOpenAiImageGenerationRequestInit,
	buildOpenAiChatImageGenerationRequest,
	getAgentImageErrorDiagnostic,
	openAiImageSize,
	parseOpenAiChatImageResult,
	parseOpenAiImageResult,
} from '@/core/AgentImageService.js';
import { ApiError } from '@/server/api/error.js';

describe('OpenAI-compatible image generation helpers', () => {
	test('maps agent image sizes to OpenAI-compatible dimensions', () => {
		expect(openAiImageSize('portrait')).toBe('1024x1536');
		expect(openAiImageSize('landscape')).toBe('1536x1024');
		expect(openAiImageSize('square')).toBe('1024x1024');
		expect(buildOpenAiImageGenerationRequest('gpt-image-1', '1girl, solo', 'portrait')).toEqual({
			model: 'gpt-image-1',
			prompt: '1girl, solo',
			n: 1,
			size: '1024x1536',
		});
		const init = buildOpenAiImageGenerationRequestInit('secret', 'gpt-image-1', '1girl, solo', 'landscape');
		expect(init.method).toBe('POST');
		expect(init.headers).toEqual({
			'Content-Type': 'application/json',
			Authorization: 'Bearer secret',
		});
		expect(JSON.parse(init.body)).toEqual(expect.objectContaining({ n: 1, size: '1536x1024' }));
	});

	test('adds the default reference image to images generations requests', () => {
		const request = buildOpenAiImageGenerationRequest('gpt-image-1', '1girl, solo', 'square', {
			contentType: 'image/png',
			data: Buffer.from('reference image'),
		});
		expect(request).toEqual(expect.objectContaining({
			image: `data:image/png;base64,${Buffer.from('reference image').toString('base64')}`,
		}));
	});

	test('uses an image_url data URL for OpenAI-compatible chat completions', () => {
		const request = buildOpenAiChatImageGenerationRequest('relay-image-model', '1girl, solo', {
			contentType: 'image/jpeg',
			data: Buffer.from('reference image'),
		});
		expect(request).toEqual({
			model: 'relay-image-model',
			stream: false,
			messages: [{
				role: 'user',
				content: [
					{ type: 'text', text: '1girl, solo' },
					{ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${Buffer.from('reference image').toString('base64')}` } },
				],
			}],
		});
	});

	test('adds up to four reference images to compatible requests', () => {
		const references = [1, 2, 3, 4, 5].map(index => ({
			contentType: 'image/png',
			data: Buffer.from(`reference ${index}`),
		}));
		const imageRequest = buildOpenAiImageGenerationRequest('gpt-image-1', '1girl, solo', 'square', references);
		expect(imageRequest.image).toEqual(references.slice(0, 4).map(reference => `data:image/png;base64,${reference.data.toString('base64')}`));
		const chatRequest = buildOpenAiChatImageGenerationRequest('relay-image-model', '1girl, solo', references) as {
			messages: Array<{ content: Array<unknown> }>;
		};
		expect(chatRequest.messages[0]?.content).toHaveLength(5);
	});

	test('accepts base64 and URL image response forms', () => {
		expect(parseOpenAiImageResult({ data: [{ b64_json: 'aGVsbG8=' }] })).toEqual({ type: 'base64', value: 'aGVsbG8=' });
		expect(parseOpenAiImageResult({ data: [{ url: 'https://example.com/image.png' }] })).toEqual({ type: 'url', value: 'https://example.com/image.png' });
	});

	test('rejects an empty or unsupported image response', () => {
		expect(() => parseOpenAiImageResult({ data: [] })).toThrow('no image data');
		expect(() => parseOpenAiImageResult({ data: [{}] })).toThrow('no supported image value');
	});

	test('accepts OpenAI-compatible chat image response forms', () => {
		expect(parseOpenAiChatImageResult({ choices: [{ message: { content: 'data:image/png;base64,aGVsbG8=' } }] })).toEqual({ type: 'base64', value: 'aGVsbG8=' });
		expect(parseOpenAiChatImageResult({ choices: [{ message: { content: [{ type: 'image_url', image_url: { url: 'https://example.com/image.png' } }] } }] })).toEqual({ type: 'url', value: 'https://example.com/image.png' });
	});

	test('sanitizes diagnostics stored for failed upstream image requests', () => {
		const error = new ApiError({ message: 'Upstream failed.', code: 'AGENT_IMAGE_UPSTREAM_FAILED', id: 'a7c4cfe2-e0ad-45ae-a107-bd3c27a1594a' }, {
			diagnostic: 'Upstream returned HTTP 401: Authorization: Bearer secret-token-value, api_key=another-secret, https://images.example.test/v1/images/generations',
		});
		expect(getAgentImageErrorDiagnostic(error)).toBe('Upstream returned HTTP 401: Authorization: [redacted], api_key=[redacted], [redacted URL]');
	});
});
