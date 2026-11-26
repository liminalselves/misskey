/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { transpileModule } from 'typescript';
import type { MenuItem } from '@/types/menu.js';
import MkSelect, { type MkSelectItem } from '@/components/MkSelect.vue';

const { popupMenuMock } = vi.hoisted(() => ({
	popupMenuMock: vi.fn(),
}));

vi.mock('@/os.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@/os.js')>();
	return {
		...actual,
		popupMenu: popupMenuMock,
	};
});

const origResizeObserver = globalThis.ResizeObserver;

beforeEach(() => {
	popupMenuMock.mockReset();
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
});

afterEach(() => {
	cleanup();
	globalThis.ResizeObserver = origResizeObserver;
	vi.restoreAllMocks();
});

describe('MkSelect placeholder and stale label handling', () => {
	test('renders placeholder for unmatched value, clears stale label, and selects option cleanly', async () => {
		const selected = ref('');
		const items = ref<MkSelectItem[]>([
			{ value: 'm1', label: 'deepseek-flash' },
			{ value: 'm2', label: 'qwen-vl' },
		]);

		const { container, rerender } = render(MkSelect as any, {
			props: {
				modelValue: selected.value,
				items: items.value,
				placeholder: '请选择识图模型',
				'onUpdate:modelValue': (v: string) => {
					selected.value = v;
				},
			},
			global: {
				directives: {
					'adaptive-border': {},
				},
			},
		});

		expect(container.textContent).toContain('请选择识图模型');

		const trigger = container.querySelector('[tabindex="0"]') as HTMLElement;
		await fireEvent.mouseDown(trigger);
		expect(popupMenuMock).toHaveBeenCalledTimes(1);

		const menuItems = popupMenuMock.mock.calls[0]![0] as MenuItem[];
		expect(menuItems).toHaveLength(2);
		expect((menuItems[0] as unknown as { text?: string }).text).toBe('deepseek-flash');
		(menuItems[0] as unknown as { action: () => void }).action();
		await nextTick();
		await rerender({ modelValue: selected.value });

		expect(selected.value).toBe('m1');
		expect(container.textContent).toContain('deepseek-flash');

		// Switching to an unknown / deleted ID clears the previous label and shows placeholder
		selected.value = 'deleted-id';
		await rerender({ modelValue: selected.value });
		expect(container.textContent).not.toContain('deepseek-flash');
		expect(container.textContent).toContain('请选择识图模型');
	});
});

describe('agent-session vision model selection', () => {
	test('syncs default, clears stale IDs so replacement models are selectable, and saves/reverts cleanly', async () => {
		const source = readFileSync(resolve(process.cwd(), 'src/pages/chat/agent-session.vue'), 'utf8');
		const start = source.indexOf('function syncVisionModelSelection()');
		const end = source.indexOf('\nfunction driveFilePreviewUrl(', start);
		expect(start).toBeGreaterThan(-1);
		expect(end).toBeGreaterThan(start);

		const jsCode = transpileModule(source.slice(start, end), {}).outputText;

		const session = ref<{ agentVisionModelId: string | null } | null>({ agentVisionModelId: 'deleted-vision-id' });
		const visionModels = ref([
			{ id: 'deepseek-flash-id', name: 'deepseek-flash', costPerCall: 1, isDefault: true },
		]);
		const visionModelSelectionId = ref('');
		const savingSettings = ref(false);
		const moderationLocksSessionWrites = ref(false);
		const misskeyApi = vi.fn(async (_ep: string, data: { agentVisionModelId?: string }) => ({
			agentVisionModelId: data.agentVisionModelId ?? null,
		}));
		const loadSession = vi.fn(async () => {});
		const alertMock = vi.fn(async () => {});

		const factory = new Function(
			'session',
			'visionModels',
			'visionModelSelectionId',
			'savingSettings',
			'moderationLocksSessionWrites',
			'misskeyApi',
			'sessionId',
			'i18n',
			'loadSession',
			'os',
			'formatApiError',
			`${jsCode}\nreturn { syncVisionModelSelection, loadVisionModels, selectVisionModel };`,
		);

		const { syncVisionModelSelection, selectVisionModel } = factory(
			session,
			visionModels,
			visionModelSelectionId,
			savingSettings,
			moderationLocksSessionWrites,
			misskeyApi,
			'sess-1',
			{ ts: { _agents: { visionModelSaveFailed: 'save failed' } } },
			loadSession,
			{ alert: alertMock },
			(e: unknown) => (e instanceof Error ? e.message : String(e)),
		) as {
			syncVisionModelSelection: () => void;
			loadVisionModels: () => Promise<void>;
			selectVisionModel: (value: unknown) => Promise<void>;
		};

		// Stale DB model ID should reset to '' so user can click deepseek-flash
		syncVisionModelSelection();
		expect(visionModelSelectionId.value).toBe('');

		await selectVisionModel('deepseek-flash-id');
		expect(misskeyApi).toHaveBeenCalledWith('agents/sessions/update', {
			sessionId: 'sess-1',
			agentVisionModelId: 'deepseek-flash-id',
		});
		expect(visionModelSelectionId.value).toBe('deepseek-flash-id');
		expect(session.value?.agentVisionModelId).toBe('deepseek-flash-id');
		expect(savingSettings.value).toBe(false);

		// Session with null agentVisionModelId resolves to default model
		session.value = { agentVisionModelId: null };
		syncVisionModelSelection();
		expect(visionModelSelectionId.value).toBe('deepseek-flash-id');

		// Failed save reverts selection cleanly
		visionModelSelectionId.value = '';
		misskeyApi.mockRejectedValueOnce(new Error('network error'));
		await selectVisionModel('deepseek-flash-id');
		expect(visionModelSelectionId.value).toBe('');
		expect(loadSession).toHaveBeenCalledTimes(1);
		expect(alertMock).toHaveBeenCalledWith({ type: 'error', text: 'network error' });
		expect(savingSettings.value).toBe(false);
	});
});
