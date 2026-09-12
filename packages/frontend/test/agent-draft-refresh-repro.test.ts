/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { assert, describe, test, vi } from 'vitest';
import { createApp, h, nextTick, defineComponent } from 'vue';

// 桩掉组件依赖的重模块，只保留草稿逻辑
vi.mock('@/os.js', () => ({ alert: vi.fn(), toast: vi.fn() }));
vi.mock('@/utility/drive.js', () => ({ selectFile: vi.fn() }));
vi.mock('@/utility/autocomplete.js', () => ({ Autocomplete: class { constructor() {} detach() {} } }));
vi.mock('@/utility/emoji-picker.js', () => ({ emojiPicker: { show: vi.fn() } }));
vi.mock('@/instance.js', () => ({ instance: { agentStickerEnabled: false } }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { 'chat.sendOnEnter': true } } }));

import AgentSessionForm from '../src/pages/chat/agent-session.form.vue';

type FormExposed = InstanceType<typeof AgentSessionForm>;

type FormHandle = {
	host: HTMLElement;
	app: ReturnType<typeof createApp>;
	textarea: HTMLTextAreaElement;
	form: FormExposed;
};

async function mountForm(sessionId: string, onSubmit: (p: { text: string; file: unknown }) => void): Promise<FormHandle> {
	const host = document.createElement('div');
	document.body.appendChild(host);
	let form: FormExposed | null = null;
	const app = createApp(defineComponent({
		setup() {
			return () => h(AgentSessionForm, {
				ref: (i: unknown) => { form = i as FormExposed; },
				sessionId,
				onSubmit,
			});
		},
	}));
	app.mount(host);
	await nextTick();
	const textarea = host.querySelector('textarea') as HTMLTextAreaElement;
	return { host, app, textarea, form: form! };
}

async function unmount(m: FormHandle) {
	m.app.unmount();
	m.host.remove();
	await nextTick();
}

async function type(textarea: HTMLTextAreaElement, value: string) {
	textarea.value = value;
	textarea.dispatchEvent(new Event('input', { bubbles: true }));
	await nextTick();
}

async function clickSend(m: FormHandle) {
	const sendButton = ([...m.host.querySelectorAll('button')] as HTMLButtonElement[])
		.find(b => b.querySelector('.ti-send'));
	sendButton!.click();
	await nextTick();
	await nextTick();
}

function drafts(): Record<string, { data: { text: string; file: unknown } }> {
	return JSON.parse(window.localStorage.getItem('chatMessageDrafts') || '{}');
}

// 模拟刷新页面：卸载后重新挂载，草稿从 localStorage 恢复
async function refresh(onSubmit: (p: { text: string; file: unknown }) => void): Promise<FormHandle> {
	// localStorage 保留（真实刷新语义）
	return await mountForm('sess1', onSubmit);
}

describe('agent 聊天表单草稿：请求中刷新页面不应残留已发送内容', () => {
	test('正常发送（请求在飞）→ 刷新：输入框为空，且不残留空草稿条目', async () => {
		window.localStorage.clear();
		const onSubmit = () => new Promise<void>(() => {}); // 永不 settle = 请求中

		const m1 = await mountForm('sess1', onSubmit);
		await type(m1.textarea, '你好，这是一条测试消息');
		await clickSend(m1);
		assert.equal(m1.textarea.value, '', '发送后输入框应清空');
		assert.equal(drafts()['agent:sess1'], undefined, '发送后不应残留草稿条目');

		await unmount(m1);
		const m2 = await refresh(onSubmit);
		assert.equal(m2.textarea.value, '', '请求中刷新后输入框不应显示已发送的内容');
		await unmount(m2);
	});

	test('中断回填（restoreDraft）→ 刷新：输入框为空（内容不落草稿）', async () => {
		window.localStorage.clear();
		const onSubmit = () => new Promise<void>(() => {});

		const m1 = await mountForm('sess1', onSubmit);
		await type(m1.textarea, '被中断的消息');
		await clickSend(m1);
		// 模拟 onAbortRequest 的中断回填
		m1.form.restoreDraft('被中断的消息');
		await nextTick();
		await nextTick();
		assert.equal(m1.textarea.value, '被中断的消息', '中断后内容应回到输入框');
		assert.equal(drafts()['agent:sess1'], undefined, '中断回填不应写入草稿');

		await unmount(m1);
		const m2 = await refresh(onSubmit);
		assert.equal(m2.textarea.value, '', '刷新后输入框不应残留中断回填的内容');
		await unmount(m2);
	});

	test('发送失败回填 → 刷新：输入框为空', async () => {
		window.localStorage.clear();
		const onSubmit = () => new Promise<void>(() => {});

		const m1 = await mountForm('sess1', onSubmit);
		await type(m1.textarea, '发送失败的消息');
		await clickSend(m1);
		// 模拟 catch 分支的失败回填
		m1.form.restoreDraft('发送失败的消息');
		await nextTick();
		await nextTick();

		await unmount(m1);
		const m2 = await refresh(onSubmit);
		assert.equal(m2.textarea.value, '', '刷新后输入框不应残留失败回填的内容');
		await unmount(m2);
	});

	test('用户真实输入的草稿：刷新后仍恢复（功能本身不受影响）', async () => {
		window.localStorage.clear();
		const onSubmit = () => new Promise<void>(() => {});

		const m1 = await mountForm('sess1', onSubmit);
		await type(m1.textarea, '我正在编辑的草稿');
		await unmount(m1);

		const m2 = await refresh(onSubmit);
		assert.equal(m2.textarea.value, '我正在编辑的草稿', '用户输入的草稿刷新后应恢复');
		await unmount(m2);
	});

	test('中断回填后用户继续编辑：编辑结果作为草稿保留', async () => {
		window.localStorage.clear();
		const onSubmit = () => new Promise<void>(() => {});

		const m1 = await mountForm('sess1', onSubmit);
		m1.form.restoreDraft('被中断的消息');
		await nextTick();
		await nextTick();
		// 用户手动修改
		await type(m1.textarea, '被中断的消息（改）');
		assert.equal(drafts()['agent:sess1']?.data.text, '被中断的消息（改）', '用户编辑应正常保存草稿');

		await unmount(m1);
		const m2 = await refresh(onSubmit);
		assert.equal(m2.textarea.value, '被中断的消息（改）', '刷新后应恢复用户编辑后的草稿');
		await unmount(m2);
	});
});
