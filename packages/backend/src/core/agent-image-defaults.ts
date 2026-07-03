/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const QUALITY_NEGATIVE_TAGS = [
	'lowres',
	'worst quality',
	'low quality',
	'normal quality',
	'bad quality',
	'jpeg artifacts',
	'blurry',
	'out of focus',
	'cropped',
	'bad anatomy',
	'bad proportions',
	'bad hands',
	'bad feet',
	'poorly drawn face',
	'poorly drawn hands',
	'deformed',
	'disfigured',
	'malformed limbs',
	'mutation',
	'mutated hands',
	'extra arms',
	'extra legs',
	'extra limbs',
	'extra digit',
	'extra digits',
	'fewer digits',
	'missing arms',
	'missing legs',
	'missing fingers',
	'fused fingers',
	'too many fingers',
	'long neck',
	'ugly',
	'error',
	'text',
	'logo',
	'signature',
	'watermark',
	'username',
];

const SAFETY_NEGATIVE_TAGS = [
	'nsfw',
	'explicit',
	'adult content',
	'porn',
	'pornography',
	'erotic',
	'nude',
	'naked',
	'nudity',
	'bare breasts',
	'breasts out',
	'nipples',
	'areola',
	'genitals',
	'penis',
	'testicles',
	'vagina',
	'pussy',
	'anus',
	'sex',
	'intercourse',
	'oral sex',
	'fellatio',
	'masturbation',
	'cum',
	'semen',
	'rape',
	'forced',
	'non-consensual',
	'sexual violence',
	'minor',
	'underage',
	'loli',
	'shota',
	'child',
	'toddler',
	'baby',
	'infant',
	'gore',
	'guro',
	'blood',
	'wound',
	'injury',
	'amputation',
	'dismemberment',
	'decapitation',
	'scat',
	'feces',
	'urine',
	'vomit',
];

function splitNegativePrompt(prompt: string | null | undefined): string[] {
	return (prompt ?? '')
		.split(',')
		.map(tag => tag.trim())
		.filter(tag => tag.length > 0);
}

export function joinAgentImageNegativePrompts(...prompts: Array<string | null | undefined>): string {
	const seen = new Set<string>();
	const tags: string[] = [];
	for (const prompt of prompts) {
		for (const tag of splitNegativePrompt(prompt)) {
			const key = tag.toLowerCase();
			if (seen.has(key)) continue;
			seen.add(key);
			tags.push(tag);
		}
	}
	return tags.join(',');
}

export const AGENT_IMAGE_SAFETY_NEGATIVE_PROMPT = SAFETY_NEGATIVE_TAGS.join(',');

export const DEFAULT_AGENT_IMAGE_NEGATIVE_PROMPT = joinAgentImageNegativePrompts(
	QUALITY_NEGATIVE_TAGS.join(','),
	AGENT_IMAGE_SAFETY_NEGATIVE_PROMPT,
);

export function resolveAgentImageNegativePrompt(basePrompt: string | null | undefined, extraPrompt?: string | null): string {
	const base = basePrompt?.trim() ? basePrompt : DEFAULT_AGENT_IMAGE_NEGATIVE_PROMPT;
	return joinAgentImageNegativePrompts(base, AGENT_IMAGE_SAFETY_NEGATIVE_PROMPT, extraPrompt);
}
