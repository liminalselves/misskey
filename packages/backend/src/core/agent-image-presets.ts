/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export type AgentImageArtistPreset = {
	id: string;
	name: string;
	promptPrefix: string;
	promptSuffix: string;
	negativePrompt: string;
	thumbnailUrl: string | null;
};

export const AGENT_IMAGE_WORLD_PROMPT = `
Image generation protocol:
- You may insert an image only when it improves the current reply.
- Output exactly this placeholder, outside code blocks: [[agent_draw size=<portrait|landscape|square> tag=<positive Danbooru tags>]]
- Only include positive visual tags in tag. Do not include negative prompts, model names, artist strings, token, URL, HTML, Markdown, or quality boilerplate.
- Choose size yourself: portrait for single-character portraits and full-body shots, landscape for interaction or scenes, square for avatar-like close-ups.
- Organize tags in this order: character count and identity, core appearance, pose/action, composition, outfit, expression/gaze, environment, lighting, final visual details.
- Each visible character should have count/gender, eye color, hair color/style, skin tone or notable feature, body shape when relevant, and outfit.
- Each image should include a camera distance or composition tag such as close-up, bust shot, upper body, cowboy shot, full body, wide shot, from side, from above, or dynamic angle.
- Keep the image safe for work. Do not request nudity, explicit sexual acts, sexualized minors, coercion, gore, dismemberment, bodily waste, or harm.
`.trim();

export const AGENT_IMAGE_DEFAULT_PRESETS: AgentImageArtistPreset[] = [
	{
		id: 'default-anime',
		name: '二次元插画',
		promptPrefix: '[artist:ningen_mame],artist:ciloranko,[artist:sho_(sho_lwlw)]',
		promptSuffix: 'masterpiece,best quality,very aesthetic,highres,absurdres',
		negativePrompt: '',
		thumbnailUrl: null,
	},
	{
		id: 'warm-game-portrait',
		name: '暖色系游戏立绘',
		promptPrefix: 'artist:moccha_(mochancc),artist:uminonew,artist:ask_(askzy),artist:liduke,artist:wanke,cinematic lighting,watercolor texture,matte glow',
		promptSuffix: 'masterpiece,best quality,very aesthetic,highres,absurdres,detailed eyes,clean lineart',
		negativePrompt: 'text,logo,signature,watermark,too many watermarks,bad anatomy,bad hands,bad feet,extra digits,extra arms,extra legs,lowres,worst quality,bad quality,jpeg artifacts',
		thumbnailUrl: null,
	},
	{
		id: 'soft-fantasy',
		name: '轻柔幻想风',
		promptPrefix: 'artist:fuzichoco,artist:ask_(askzy),soft lighting,dreamy atmosphere,delicate colors',
		promptSuffix: 'masterpiece,best quality,very aesthetic,detailed eyes,clean image,no text,highres',
		negativePrompt: 'text,logo,signature,watermark,lowres,worst quality,bad quality,bad anatomy,bad hands,extra digits,blurry',
		thumbnailUrl: null,
	},
	{
		id: 'clear-sweet',
		name: '清透甜绘风',
		promptPrefix: 'artist:ningen_mame,artist:ciloranko,clear colors,soft light,cute illustration,delicate face',
		promptSuffix: 'masterpiece,best quality,very aesthetic,highres,detailed eyes,polished illustration',
		negativePrompt: 'text,logo,signature,watermark,lowres,worst quality,bad quality,bad anatomy,bad hands,extra digits,blurry',
		thumbnailUrl: null,
	},
	{
		id: 'light-thick-paint',
		name: '轻厚涂二次元',
		promptPrefix: 'artist:wlop,artist:ask_(askzy),semi-realistic anime,soft rendering,cinematic lighting,rich texture',
		promptSuffix: 'masterpiece,best quality,very aesthetic,highres,absurdres,detailed face,detailed eyes',
		negativePrompt: 'text,logo,signature,watermark,lowres,worst quality,bad quality,bad anatomy,bad hands,extra digits,flat color,blurry',
		thumbnailUrl: null,
	},
	{
		id: 'line-manga',
		name: '日系线稿漫画',
		promptPrefix: 'clean lineart,anime coloring,manga style,sharp focus,delicate linework',
		promptSuffix: 'masterpiece,best quality,very aesthetic,highres,detailed eyes,clean composition',
		negativePrompt: 'text,logo,signature,watermark,lowres,worst quality,bad quality,bad anatomy,bad hands,extra digits,halftone,screentone,blurry',
		thumbnailUrl: null,
	},
];

function sanitizePreset(item: unknown): AgentImageArtistPreset | null {
	if (item == null || typeof item !== 'object') return null;
	const o = item as Record<string, unknown>;
	const id = typeof o.id === 'string' ? o.id.trim() : '';
	const name = typeof o.name === 'string' ? o.name.trim() : '';
	if (!id || !name) return null;
	return {
		id,
		name,
		promptPrefix: typeof o.promptPrefix === 'string' ? o.promptPrefix : '',
		promptSuffix: typeof o.promptSuffix === 'string' ? o.promptSuffix : '',
		negativePrompt: typeof o.negativePrompt === 'string' ? o.negativePrompt : '',
		thumbnailUrl: typeof o.thumbnailUrl === 'string' && o.thumbnailUrl.trim() !== '' ? o.thumbnailUrl.trim() : null,
	};
}

export function resolveAgentImageArtistPresets(raw: unknown): AgentImageArtistPreset[] {
	if (!Array.isArray(raw)) return AGENT_IMAGE_DEFAULT_PRESETS;
	const presets = raw.map(sanitizePreset).filter((p): p is AgentImageArtistPreset => p != null);
	return presets.length > 0 ? presets : AGENT_IMAGE_DEFAULT_PRESETS;
}

export function getAgentImagePreset(id: string | null | undefined, raw?: unknown): AgentImageArtistPreset | null {
	if (!id) return null;
	return resolveAgentImageArtistPresets(raw).find(p => p.id === id) ?? null;
}
