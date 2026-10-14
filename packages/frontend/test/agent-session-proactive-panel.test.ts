/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, reactive } from 'vue';
import type { App } from 'vue';
import AgentSessionProactivePanel from '@/pages/chat/agent-session.proactive.vue';
import type { ProactiveSchedule } from '@/pages/chat/agent-session.proactive.vue';

vi.mock('@/i18n.js', () => ({
	i18n: {
		ts: { delete: '删除' },
	},
}));
// Fallback text keeps the assertions independent of locale content.
vi.mock('@/utility/agent-i18n.js', () => ({
	agentI18nText: (_key: string, fallback: string) => fallback,
}));
vi.mock('@/utility/format-time-string.js', () => ({
	formatDateTimeString: (d: Date) => d.toISOString(),
}));

// Stubs are built inside the vi.mock factories: factories are hoisted above
// every local binding, so nothing here may reference top-level variables.
vi.mock('@/components/MkInfo.vue', async () => {
	const { h } = await import('vue');
	return {
		default: {
			props: ['warn'],
			setup: (_props: unknown, { slots }: any) => () => h('div', slots.default?.()),
		},
	};
});

vi.mock('@/components/MkSwitch.vue', async () => {
	const { h } = await import('vue');
	return {
		default: {
			props: ['modelValue', 'disabled'],
			emits: ['update:modelValue'],
			setup: (props: { modelValue: boolean; disabled: boolean }, { emit, slots }: any) => () => h('button', {
				disabled: props.disabled,
				'data-switch': '1',
				onClick: () => emit('update:modelValue', !props.modelValue),
			}, slots.default?.()),
		},
	};
});

vi.mock('@/components/MkInput.vue', async () => {
	const { h } = await import('vue');
	return {
		default: {
			props: ['modelValue', 'type', 'min', 'max', 'small', 'disabled'],
			setup: (props: { modelValue: unknown }, { slots }: any) => () => h('label', {}, [
				h('input', { value: props.modelValue == null ? '' : String(props.modelValue), 'data-input': '1' }),
				slots.label?.(), slots.caption?.(),
			]),
		},
	};
});

vi.mock('@/components/MkButton.vue', async () => {
	const { h } = await import('vue');
	return {
		default: {
			props: ['disabled', 'primary', 'small', 'rounded', 'danger', 'wait'],
			emits: ['click'],
			setup: (props: { disabled: boolean }, { emit, slots }: any) => () => h('button', {
				disabled: props.disabled,
				onClick: () => emit('click'),
			}, slots.default?.()),
		},
	};
});

vi.mock('@/components/global/MkLoading.vue', () => ({ default: { render: () => null } }));
vi.mock('@/pages/agents/control-embed-loading.vue', () => ({ default: { render: () => null } }));

const schedule: ProactiveSchedule = {
	id: 'sched1',
	description: '每晚打招呼',
	trigger: { type: 'recurring', cron: '0 30 20 * * *', repeat: { mode: 'count', count: 3 } },
	status: 'active',
	createdAt: '2026-10-01T00:00:00Z',
	nextRunAt: '2026-10-10T20:30:00Z',
	lastRunAt: null,
	remainingRuns: 2,
};

const emitted = {
	saveParams: vi.fn(),
	resetParams: vi.fn(),
	reloadSchedules: vi.fn(),
	toggleSchedule: vi.fn(),
	deleteSchedule: vi.fn(),
	updateRandom: vi.fn(),
	updateScheduled: vi.fn(),
};

let app: App | undefined;
let host: HTMLElement | undefined;

async function settle() {
	await nextTick();
	await nextTick();
	await nextTick();
}

function baseProps() {
	return {
		moderationLocked: false,
		lockNoticeVisible: false,
		lockNoticeMessage: '已被限制',
		timeAwareness: true,
		randomProactiveLastError: null,
		scheduledProactiveLastError: null,
		saving: false,
		paramsSaving: false,
		paramsDirty: false,
		siteMaxChainLength: 7,
		schedules: [schedule] as ProactiveSchedule[],
		schedulesLoading: false,
		scheduleMutating: null,
		randomProactiveEnabled: false,
		scheduledProactiveEnabled: true,
		minSilence: 30,
		maxWindow: 1440,
		daytimeWeight: 3,
		recencyBias: 1,
		chainLength: 2,
	};
}

async function mountPanel(overrides: Record<string, unknown> = {}) {
	// Only one mounted panel at a time: drop the previous instance first.
	app?.unmount();
	host?.remove();

	const props = reactive({ ...baseProps(), ...overrides });
	host = document.createElement('div');
	document.body.append(host);
	app = createApp(defineComponent({
		setup: () => () => h(AgentSessionProactivePanel, {
			...props,
			'onUpdate:randomProactiveEnabled': emitted.updateRandom,
			'onUpdate:scheduledProactiveEnabled': emitted.updateScheduled,
			'onSaveParams': emitted.saveParams,
			'onResetParams': emitted.resetParams,
			'onReloadSchedules': emitted.reloadSchedules,
			'onToggleSchedule': emitted.toggleSchedule,
			'onDeleteSchedule': emitted.deleteSchedule,
		}),
	}));
	// The real app registers v-panel globally; a no-op keeps the test output clean.
	app.directive('panel', {});
	app.mount(host);
	await settle();
	return { host, props };
}

function buttons(root: HTMLElement): HTMLButtonElement[] {
	return [...root.querySelectorAll('button')];
}

/** Exact label match, so e.g. 恢复 (resume) does not hit 恢复默认 (reset params). */
function byText(root: HTMLElement, text: string): HTMLButtonElement | undefined {
	return buttons(root).find(b => (b.textContent ?? '').trim() === text);
}

beforeEach(() => {
	for (const fn of Object.values(emitted)) fn.mockClear();
});

afterEach(() => {
	app?.unmount();
	host?.remove();
	app = undefined;
	host = undefined;
});

describe('agent-session.proactive panel', () => {
	test('warns and disables the main switches when time awareness is off', async () => {
		const { host } = await mountPanel({ timeAwareness: false });

		expect(host.textContent).toContain('开启主动消息前需要先开启时间感知。');
		const switches = buttons(host).filter(b => b.dataset.switch === '1');
		expect(switches.length).toBe(2);
		expect(switches.every(s => s.disabled)).toBe(true);
	});

	test('forwards schedule actions and keeps them locked under moderation lock', async () => {
		const { host } = await mountPanel();

		byText(host, '暂停')!.click();
		expect(emitted.toggleSchedule).toHaveBeenCalledExactlyOnceWith(schedule);

		byText(host, '删除')!.click();
		expect(emitted.deleteSchedule).toHaveBeenCalledExactlyOnceWith(schedule);
	});

	test('disables every mutating control while the moderation lock is active', async () => {
		const { host } = await mountPanel({ moderationLocked: true, lockNoticeVisible: true });

		expect(host.textContent).toContain('已被限制');
		expect(byText(host, '暂停')!.disabled).toBe(true);
		expect(byText(host, '删除')!.disabled).toBe(true);
		expect(byText(host, '恢复默认')!.disabled).toBe(true);
	});

	test('save params button only fires when the form is dirty', async () => {
		const { host } = await mountPanel();
		expect(byText(host, '保存参数')!.disabled).toBe(true);

		const dirty = await mountPanel({ paramsDirty: true });
		const save = byText(dirty.host, '保存参数')!;
		expect(save.disabled).toBe(false);
		save.click();
		expect(emitted.saveParams).toHaveBeenCalledTimes(1);
	});

	test('paused schedules cannot resume without time awareness or the scheduled switch', async () => {
		const paused: ProactiveSchedule = { ...schedule, id: 'sched2', status: 'paused' };
		const { host } = await mountPanel({ schedules: [paused], scheduledProactiveEnabled: false });

		const resume = byText(host, '恢复');
		expect(resume).toBeDefined();
		expect(resume!.disabled).toBe(true);

		const enabled = await mountPanel({ schedules: [paused], scheduledProactiveEnabled: true });
		expect(byText(enabled.host, '恢复')!.disabled).toBe(false);
	});
});
