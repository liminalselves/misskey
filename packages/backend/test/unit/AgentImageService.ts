/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import {
	buildOpenAiImageGenerationRequest,
	buildOpenAiImageGenerationRequestInit,
	buildOpenAiChatImageGenerationRequest,
	buildQwenImageGenerationRequest,
	buildQwenImageGenerationRequestInit,
	getAgentImageErrorDiagnostic,
	openAiImageSize,
	parseOpenAiChatImageResult,
	parseOpenAiImageResult,
	parseQwenImageResult,
	qwenImageSize,
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

describe('Qwen-Image (DashScope-style) generation helpers', () => {
	test('maps agent image sizes to Qwen width*height dimensions', () => {
		expect(qwenImageSize('portrait')).toBe('1728*2368');
		expect(qwenImageSize('landscape')).toBe('2368*1728');
		expect(qwenImageSize('square')).toBe('2048*2048');
	});

	test('builds the DashScope-style input/parameters request body', () => {
		expect(buildQwenImageGenerationRequest('Qwen-Image-2.0', '1girl, solo', 'lowres, bad quality', 'portrait')).toEqual({
			model: 'Qwen-Image-2.0',
			input: { prompt: '1girl, solo' },
			parameters: {
				n: 1,
				size: '1728*2368',
				negative_prompt: 'lowres, bad quality',
			},
		});
	});

	test('omits negative_prompt when none is provided and truncates long ones', () => {
		const withoutNegative = buildQwenImageGenerationRequest('Qwen-Image-2.0', '1girl', null, 'square');
		expect(withoutNegative.parameters).toEqual({ n: 1, size: '2048*2048' });
		const long = buildQwenImageGenerationRequest('Qwen-Image-2.0', '1girl', 'x'.repeat(600), 'square');
		expect((long.parameters as { negative_prompt?: string }).negative_prompt).toHaveLength(500);
	});

	test('uses bearer authorization for Qwen image requests', () => {
		const init = buildQwenImageGenerationRequestInit('secret', 'Qwen-Image-2.0', '1girl', null, 'landscape');
		expect(init.method).toBe('POST');
		expect(init.headers).toEqual({
			'Content-Type': 'application/json',
			Authorization: 'Bearer secret',
		});
		expect(JSON.parse(init.body)).toEqual({
			model: 'Qwen-Image-2.0',
			input: { prompt: '1girl' },
			parameters: { n: 1, size: '2368*1728' },
		});
	});

	test('accepts Qwen output.results URL responses', () => {
		expect(parseQwenImageResult({
			request_id: '93181007-6691-9bf8-810d-c04e37959265',
			output: { task_id: '2069294934625923074', task_status: 'succeeded', results: ['https://example.com/image-1.png'] },
			usage: { image_count: 1, resolution: '2048P' },
		})).toEqual({ type: 'url', value: 'https://example.com/image-1.png' });
	});

	test('rejects Qwen responses without a successful result URL', () => {
		expect(() => parseQwenImageResult({ output: { task_status: 'failed', results: [] } })).toThrow('task did not succeed');
		expect(() => parseQwenImageResult({ output: { task_status: 'succeeded', results: [] } })).toThrow('no image URL');
	});
});
