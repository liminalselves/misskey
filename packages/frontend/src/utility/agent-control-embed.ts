/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const agentControlPanels = [
	'model',
	'draw',
	'proactive',
	'memory',
	'worldbook',
	'rules',
	'style',
	'operations',
] as const;

export type AgentControlPanel = typeof agentControlPanels[number];

export type AgentControlAppearance = {
	colorScheme?: 'light' | 'dark' | 'auto';
	accent?: string;
	background?: string;
	panel?: string;
	foreground?: string;
	muted?: string;
	divider?: string;
	radius?: string;
	fontFamily?: string;
	fontSize?: string;
	contentMaxWidth?: string;
	spacing?: string;
	cssVariables?: Record<string, string>;
};

export type AgentControlParentMessage = {
	type: 'misskey:agent-control:configure';
	token: string;
	appearance?: AgentControlAppearance;
} | {
	type: 'misskey:agent-control:update-appearance';
	appearance: AgentControlAppearance;
} | {
	type: 'misskey:agent-control:update-token';
	token: string;
} | {
	type: 'misskey:agent-control:set-panel';
	panel: string;
};

export type AgentControlEmbedMessage = {
	type: 'misskey:agent-control:ready';
	version: 1;
	sessionId: string;
	panel: AgentControlPanel;
} | {
	type: 'misskey:agent-control:authenticated';
	sessionId: string;
	panel: AgentControlPanel;
} | {
	type: 'misskey:agent-control:height';
	height: number;
} | {
	type: 'misskey:agent-control:api-success';
	endpoint: string;
} | {
	type: 'misskey:agent-control:navigate-message';
	messageId: string;
} | {
	type: 'misskey:agent-control:navigate-context-divider';
	messageId: string;
} | {
	type: 'misskey:agent-control:open-url';
	url: string;
} | {
	type: 'misskey:agent-control:close-requested';
	reason: 'session-deleted';
} | {
	type: 'misskey:agent-control:error';
	code: 'INVALID_PANEL' | 'AUTHENTICATION_FAILED';
	message: string;
};

const appearancePropertyMap: Record<Exclude<keyof AgentControlAppearance, 'colorScheme' | 'cssVariables'>, string> = {
	accent: '--MI_THEME-accent',
	background: '--MI_THEME-bg',
	panel: '--MI_THEME-panel',
	foreground: '--MI_THEME-fg',
	muted: '--MI_THEME-fgTransparentWeak',
	divider: '--MI_THEME-divider',
	radius: '--MI-radius',
	fontFamily: '--agent-control-font-family',
	fontSize: '--agent-control-font-size',
	contentMaxWidth: '--agent-control-content-max-width',
	spacing: '--agent-control-spacing',
};

let runtimeToken: string | null = null;
let embedActive = false;

export function isAgentControlPanel(value: string): value is AgentControlPanel {
	return (agentControlPanels as readonly string[]).includes(value);
}

function normalizeCssVariableName(name: string): string | null {
	const normalized = name.trim();
	if (!/^--[A-Za-z0-9_-]+$/.test(normalized)) return null;
	return normalized;
}

export function encodeAgentControlAppearance(appearance: AgentControlAppearance): string {
	return btoa(unescape(encodeURIComponent(JSON.stringify(appearance))));
}

export function readAgentControlBootstrapAppearance(): AgentControlAppearance {
	const encoded = new URLSearchParams(window.location.search).get('appearance');
	if (encoded == null || encoded.length > 12_000) return {};
	try {
		const value = JSON.parse(decodeURIComponent(escape(atob(encoded)))) as unknown;
		return value != null && typeof value === 'object' ? value as AgentControlAppearance : {};
	} catch {
		return {};
	}
}

// 宿主外观到达前的首屏兜底：刻意使用无品牌倾向的中性灰，避免任何项目看到 msk 主题色一闪而过
export function agentControlSurfaceDefaults(dark: boolean): Required<Pick<AgentControlAppearance, 'background' | 'panel' | 'foreground' | 'muted' | 'divider' | 'accent'>> {
	return dark
		? { background: '#131516', panel: '#1c1f22', foreground: '#e3e6e8', muted: '#98a0a6', divider: '#32373c', accent: '#a8b0b8' }
		: { background: '#f7f7f8', panel: '#ffffff', foreground: '#5f6367', muted: '#9aa0a6', divider: '#e5e6e8', accent: '#8a9096' };
}

export function applyAgentControlBootstrapAppearance(): AgentControlAppearance {
	const appearance = readAgentControlBootstrapAppearance();
	const root = window.document.documentElement;
	const colorScheme = appearance.colorScheme ?? 'auto';
	const dark = colorScheme === 'dark' || (colorScheme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
	const defaults = agentControlSurfaceDefaults(dark);
	root.dataset.colorScheme = dark ? 'dark' : 'light';
	root.style.colorScheme = dark ? 'dark' : 'light';
	root.style.setProperty('--MI_THEME-bg', appearance.background?.trim() || defaults.background);
	root.style.setProperty('--MI_THEME-panel', appearance.panel?.trim() || defaults.panel);
	root.style.setProperty('--MI_THEME-fg', appearance.foreground?.trim() || defaults.foreground);
	root.style.setProperty('--MI_THEME-fgTransparentWeak', appearance.muted?.trim() || defaults.muted);
	root.style.setProperty('--MI_THEME-divider', appearance.divider?.trim() || defaults.divider);
	root.style.setProperty('--MI_THEME-accent', appearance.accent?.trim() || defaults.accent);
	for (const [key, property] of Object.entries(appearancePropertyMap)) {
		const value = appearance[key as keyof typeof appearancePropertyMap];
		if (typeof value === 'string' && value.trim() !== '') root.style.setProperty(property, value.trim());
	}
	for (const [name, value] of Object.entries(appearance.cssVariables ?? {})) {
		const property = normalizeCssVariableName(name);
		if (property != null && typeof value === 'string' && value.trim() !== '') root.style.setProperty(property, value.trim());
	}
	window.document.getElementById('agent-control-bootstrap-style')?.remove();
	return appearance;
}

export function setAgentControlRuntimeToken(token: string | null): void {
	runtimeToken = token;
}

export function getAgentControlRuntimeToken(): string | null {
	return runtimeToken;
}

export function setAgentControlEmbedActive(active: boolean): void {
	embedActive = active;
}

export function notifyAgentControlApiSuccess(endpoint: string): void {
	if (!embedActive || !endpoint.startsWith('agents/')) return;
	window.dispatchEvent(new CustomEvent('misskey:agent-control:api-success', {
		detail: { endpoint },
	}));
}

export function notifyAgentControlAuthenticationFailure(message: string): void {
	if (!embedActive) return;
	window.dispatchEvent(new CustomEvent('misskey:agent-control:authentication-failed', {
		detail: { message },
	}));
}

export function requestAgentControlNavigation(type: 'message' | 'context-divider', messageId: string): void {
	if (!embedActive) return;
	window.dispatchEvent(new CustomEvent('misskey:agent-control:navigate', {
		detail: { type, messageId },
	}));
}

export function requestAgentControlOpenUrl(url: string): void {
	if (!embedActive) return;
	window.dispatchEvent(new CustomEvent('misskey:agent-control:open-url', {
		detail: { url },
	}));
}

export function requestAgentControlClose(reason: 'session-deleted'): void {
	if (!embedActive) return;
	window.dispatchEvent(new CustomEvent('misskey:agent-control:close-requested', {
		detail: { reason },
	}));
}
