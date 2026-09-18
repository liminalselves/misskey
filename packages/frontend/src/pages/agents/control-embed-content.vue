<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="rootEl" :class="[$style.root, appearanceReady && $style.visible]">
	<div v-if="invalidPanel" :class="$style.state">
		<i class="ti ti-alert-triangle"></i>
		<div>未知的智能体控制面板。</div>
	</div>
	<div v-else-if="!authenticated" :class="$style.pending">
		<XControlLoading/>
	</div>
	<XAgentSession
		v-else
		:sessionId="sessionId"
		:embeddedPanel="panel"
	/>
</div>
</template>

<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue';
import baseLightTheme from '@@/themes/_light.json5';
import baseDarkTheme from '@@/themes/_dark.json5';
import defaultLightTheme from '@@/themes/l-light.json5';
import defaultDarkTheme from '@@/themes/d-green-lime.json5';
import XAgentSession from '@/pages/chat/agent-session.vue';
import XControlLoading from '@/pages/agents/control-embed-loading.vue';
import { $i } from '@/i.js';
import { compile } from '@/theme.js';
import {
	agentControlSurfaceDefaults,
	isAgentControlPanel,
	readAgentControlBootstrapAppearance,
	setAgentControlEmbedActive,
	setAgentControlRuntimeToken,
} from '@/utility/agent-control-embed.js';
import type {
	AgentControlAppearance,
	AgentControlEmbedMessage,
	AgentControlPanel,
	AgentControlParentMessage,
} from '@/utility/agent-control-embed.js';

const props = defineProps<{
	sessionId: string;
	panel: string;
}>();

const rootEl = useTemplateRef('rootEl');
const isFramed = window.parent !== window;
const authenticated = ref(!isFramed && $i != null);
const appearanceReady = ref(true);
const invalidPanel = computed(() => !isAgentControlPanel(props.panel));
const panel = computed(() => props.panel as AgentControlPanel);
let resizeObserver: ResizeObserver | null = null;
let lastHeight = 0;
let currentAppearance: AgentControlAppearance = readAgentControlBootstrapAppearance();
const colorSchemeMedia = window.matchMedia('(prefers-color-scheme: dark)');

const managedCssProperties = new Set<string>();
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

function postToParent(message: AgentControlEmbedMessage): void {
	if (window.parent === window) return;
	window.parent.postMessage(message, '*');
}

function normalizeCssVariableName(name: string): string | null {
	const normalized = name.trim();
	if (!/^--[A-Za-z0-9_-]+$/.test(normalized)) return null;
	return normalized;
}

function applyAppearance(appearance: AgentControlAppearance = currentAppearance): void {
	currentAppearance = appearance;
	const root = window.document.documentElement;
	window.document.getElementById('agent-control-bootstrap-style')?.remove();
	for (const property of managedCssProperties) root.style.removeProperty(property);
	managedCssProperties.clear();

	const colorScheme = appearance.colorScheme ?? 'auto';
	const dark = colorScheme === 'dark' || (colorScheme === 'auto' && colorSchemeMedia.matches);
	root.dataset.colorScheme = dark ? 'dark' : 'light';
	root.style.colorScheme = dark ? 'dark' : 'light';
	const compiledTheme = compile({
		...(dark ? defaultDarkTheme : defaultLightTheme),
		props: dark
			? { ...baseDarkTheme.props, ...defaultDarkTheme.props }
			: { ...baseLightTheme.props, ...defaultLightTheme.props },
	});
	for (const [name, value] of Object.entries(compiledTheme)) {
		const property = `--MI_THEME-${name}`;
		root.style.setProperty(property, value);
		managedCssProperties.add(property);
	}

	// 宿主未指定的表面色回落到中性灰，不能让默认主题的品牌色透出来
	const surfaceDefaults = agentControlSurfaceDefaults(dark);
	const surfaceFallbacks = {
		accent: surfaceDefaults.accent,
		background: surfaceDefaults.background,
		panel: surfaceDefaults.panel,
		foreground: surfaceDefaults.foreground,
		muted: surfaceDefaults.muted,
		divider: surfaceDefaults.divider,
	} as const;
	for (const [key, property] of Object.entries(appearancePropertyMap)) {
		const value = appearance[key as keyof typeof appearancePropertyMap];
		const fallback = (surfaceFallbacks as Record<string, string | undefined>)[key];
		const resolved = typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
		if (resolved == null) continue;
		root.style.setProperty(property, resolved);
		managedCssProperties.add(property);
	}

	for (const [name, value] of Object.entries(appearance.cssVariables ?? {})) {
		const property = normalizeCssVariableName(name);
		if (property == null || typeof value !== 'string' || value.trim() === '') continue;
		root.style.setProperty(property, value.trim());
		managedCssProperties.add(property);
	}
	appearanceReady.value = true;
}

function acceptToken(token: string): void {
	const normalized = token.trim();
	if (normalized === '') return;
	setAgentControlRuntimeToken(normalized);
	authenticated.value = true;
	postToParent({
		type: 'misskey:agent-control:authenticated',
		sessionId: props.sessionId,
		panel: panel.value,
	});
}

function onParentMessage(event: MessageEvent<AgentControlParentMessage>): void {
	if (event.source !== window.parent || event.data == null || typeof event.data !== 'object') return;
	if (event.data.type === 'misskey:agent-control:configure') {
		applyAppearance(event.data.appearance);
		acceptToken(event.data.token);
	} else if (event.data.type === 'misskey:agent-control:update-appearance') {
		applyAppearance(event.data.appearance);
	} else if (event.data.type === 'misskey:agent-control:update-token') {
		acceptToken(event.data.token);
	}
}

function onColorSchemeChange(): void {
	if ((currentAppearance.colorScheme ?? 'auto') === 'auto') applyAppearance(currentAppearance);
}

function reportHeight(): void {
	const height = Math.ceil(rootEl.value?.scrollHeight ?? window.document.documentElement.scrollHeight);
	if (height <= 0 || height === lastHeight) return;
	lastHeight = height;
	postToParent({ type: 'misskey:agent-control:height', height });
}

function onApiSuccess(event: Event): void {
	const endpoint = (event as CustomEvent<{ endpoint?: unknown }>).detail?.endpoint;
	if (typeof endpoint !== 'string') return;
	postToParent({ type: 'misskey:agent-control:api-success', endpoint });
	void nextTick(reportHeight);
}

function onAuthenticationFailure(event: Event): void {
	const message = (event as CustomEvent<{ message?: unknown }>).detail?.message;
	postToParent({
		type: 'misskey:agent-control:error',
		code: 'AUTHENTICATION_FAILED',
		message: typeof message === 'string' ? message : 'Authentication failed',
	});
}

function onNavigateRequested(event: Event): void {
	const detail = (event as CustomEvent<{ type?: unknown; messageId?: unknown }>).detail;
	if (typeof detail?.messageId !== 'string') return;
	if (detail.type === 'message') {
		postToParent({ type: 'misskey:agent-control:navigate-message', messageId: detail.messageId });
	} else if (detail.type === 'context-divider') {
		postToParent({ type: 'misskey:agent-control:navigate-context-divider', messageId: detail.messageId });
	}
}

function onOpenUrlRequested(event: Event): void {
	const url = (event as CustomEvent<{ url?: unknown }>).detail?.url;
	if (typeof url !== 'string' || !url.startsWith('/')) return;
	postToParent({ type: 'misskey:agent-control:open-url', url });
}

function onCloseRequested(event: Event): void {
	const reason = (event as CustomEvent<{ reason?: unknown }>).detail?.reason;
	if (reason !== 'session-deleted') return;
	postToParent({ type: 'misskey:agent-control:close-requested', reason });
}

onMounted(() => {
	setAgentControlEmbedActive(true);
	applyAppearance(currentAppearance);
	window.addEventListener('message', onParentMessage);
	window.addEventListener('misskey:agent-control:api-success', onApiSuccess);
	window.addEventListener('misskey:agent-control:authentication-failed', onAuthenticationFailure);
	window.addEventListener('misskey:agent-control:navigate', onNavigateRequested);
	window.addEventListener('misskey:agent-control:open-url', onOpenUrlRequested);
	window.addEventListener('misskey:agent-control:close-requested', onCloseRequested);
	colorSchemeMedia.addEventListener('change', onColorSchemeChange);
	resizeObserver = new ResizeObserver(reportHeight);
	resizeObserver.observe(rootEl.value ?? window.document.body);
	if (invalidPanel.value) {
		postToParent({
			type: 'misskey:agent-control:error',
			code: 'INVALID_PANEL',
			message: `Unknown agent control panel: ${props.panel}`,
		});
		return;
	}
	postToParent({
		type: 'misskey:agent-control:ready',
		version: 1,
		sessionId: props.sessionId,
		panel: panel.value,
	});
	void nextTick(reportHeight);
});

onBeforeUnmount(() => {
	window.removeEventListener('message', onParentMessage);
	window.removeEventListener('misskey:agent-control:api-success', onApiSuccess);
	window.removeEventListener('misskey:agent-control:authentication-failed', onAuthenticationFailure);
	window.removeEventListener('misskey:agent-control:navigate', onNavigateRequested);
	window.removeEventListener('misskey:agent-control:open-url', onOpenUrlRequested);
	window.removeEventListener('misskey:agent-control:close-requested', onCloseRequested);
	colorSchemeMedia.removeEventListener('change', onColorSchemeChange);
	resizeObserver?.disconnect();
	setAgentControlEmbedActive(false);
	setAgentControlRuntimeToken(null);
	for (const property of managedCssProperties) window.document.documentElement.style.removeProperty(property);
});
</script>

<style lang="scss" module>
:global(html),
:global(body) {
	min-height: 100%;
	background: var(--MI_THEME-bg);
	font-family: var(--agent-control-font-family, inherit);
	font-size: var(--agent-control-font-size, inherit);
}

.root {
	min-height: 100dvh;
	background: transparent;
	color: var(--MI_THEME-fg);
	opacity: 0;
}

.visible {
	background: var(--MI_THEME-bg);
	opacity: 1;
}

.root :global(._spacer) {
	box-sizing: border-box;
	width: min(100%, var(--agent-control-content-max-width, 760px));
	margin-inline: auto;
	padding: var(--agent-control-spacing, var(--MI-margin));
}

.pending {
	box-sizing: border-box;
	width: min(100%, var(--agent-control-content-max-width, 760px));
	margin-inline: auto;
	padding: var(--agent-control-spacing, var(--MI-margin));
}

.state {
	min-height: 240px;
	display: grid;
	place-content: center;
	justify-items: center;
	gap: 16px;
	padding: 24px;
	box-sizing: border-box;
	color: var(--MI_THEME-fgTransparentWeak);
	text-align: center;
}

.state > i {
	font-size: 2rem;
	color: var(--MI_THEME-warn);
}
</style>
