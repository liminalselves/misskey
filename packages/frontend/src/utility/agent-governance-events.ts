/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * 治理操作的跨标签页通知：审查页在桌面以新标签页打开，处理完成后通知治理列表页就地更新，
 * 避免回到列表看到已处理条目仍在「待处理」里。
 */

export type GovernanceEvent =
	| { type: 'reviewResolved'; kind: 'character' | 'style'; id: string; reviewStatus: string }
	| { type: 'characterBanChanged'; id: string; banned: boolean }
	| { type: 'sessionBanChanged'; id: string; banned: boolean };

const CHANNEL_NAME = 'misskey-agent-governance';

export function postGovernanceEvent(event: GovernanceEvent): void {
	if (typeof BroadcastChannel === 'undefined') return;
	const channel = new BroadcastChannel(CHANNEL_NAME);
	channel.postMessage(event);
	channel.close();
}

export function onGovernanceEvent(handler: (event: GovernanceEvent) => void): () => void {
	if (typeof BroadcastChannel === 'undefined') return () => {};
	const channel = new BroadcastChannel(CHANNEL_NAME);
	channel.onmessage = (ev: MessageEvent<GovernanceEvent>) => handler(ev.data);
	return () => channel.close();
}
