/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as mfm from 'mfm-js';

const MAX_NOTIFICATION_TEXT_LENGTH = 200;

type MfmNodeLike = {
	type: string;
	props?: Record<string, unknown>;
	children?: MfmNodeLike[];
};

function renderNodes(nodes: MfmNodeLike[]): string {
	return nodes.map(node => {
		const props = node.props ?? {};
		if (node.children) return renderNodes(node.children);
		switch (node.type) {
			case 'text': return typeof props.text === 'string' ? props.text : '';
			case 'unicodeEmoji': return typeof props.emoji === 'string' ? props.emoji : '';
			case 'mention': return typeof props.acct === 'string' ? props.acct : '';
			case 'hashtag': return typeof props.hashtag === 'string' ? `#${props.hashtag}` : '';
			case 'url': return typeof props.url === 'string' ? props.url : '';
			case 'inlineCode':
			case 'blockCode': return typeof props.code === 'string' ? props.code : '';
			case 'mathInline':
			case 'mathBlock': return typeof props.formula === 'string' ? props.formula : '';
			// Custom emoji names are presentation syntax, not notification prose.
			case 'emojiCode': return '';
			default: return '';
		}
	}).join('');
}

/**
 * Builds a safe one-line notification preview from an agent reply. Rich message
 * rendering remains unchanged in the chat; this is only for notification text.
 */
export function buildAgentProactiveNotificationText(text: string): string {
	const withoutAgentSyntax = text
		.replace(/\[\[agent_draw\b[\s\S]*?\]\]/giu, ' ')
		.replace(/\[\[(?:agent_[a-z_]+|wb:)[\s\S]*?\]\]/giu, ' ')
		.replace(/<proactive_[a-z_]+\b[\s\S]*?<\/proactive_[a-z_]+>/giu, ' ');
	let plain: string;
	try {
		plain = renderNodes(mfm.parse(withoutAgentSyntax) as unknown as MfmNodeLike[]);
	} catch {
		// Invalid model markup must not prevent the proactive notification itself.
		plain = withoutAgentSyntax;
	}
	return plain
		.replace(/[`*_~>#|]/gu, '')
		.replace(/\s+/gu, ' ')
		.trim()
		.slice(0, MAX_NOTIFICATION_TEXT_LENGTH);
}
