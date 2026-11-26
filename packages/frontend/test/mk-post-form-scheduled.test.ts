/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { defineComponent, h, nextTick, ref } from 'vue';
import { EventEmitter } from 'eventemitter3';
import { prefer } from '@/preferences.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import * as os from '@/os.js';
import MkPostForm from '@/components/MkPostForm.vue';
import MkNoteDraftsDialog from '@/components/MkNoteDraftsDialog.vue';

const { mockStorage, uploaderState, paginatorMocks } = vi.hoisted(() => ({
	mockStorage: new Map<string, string>(),
	uploaderState: {
		items: [] as any[],
		uploading: false,
		readyForUpload: true,
		allItemsUploaded: true,
		uploadFn: vi.fn().mockResolvedValue(undefined),
		resetFn: vi.fn(),
		abortAllFn: vi.fn(),
	},
	paginatorMocks: new Map<boolean, { items: any; reload: any }>(),
}));

vi.mock('@/i.js', () => ({
	$i: {
		id: 'u1',
		username: 'alice',
		avatarUrl: '',
		isSilenced: false,
		policies: { scheduledNoteLimit: 10, noteDraftLimit: 10 },
	},
	iAmModerator: false,
	iAmAdmin: false,
	ensureSignin: () => ({
		id: 'u1',
		username: 'alice',
		avatarUrl: '',
		isSilenced: false,
		policies: { scheduledNoteLimit: 10, noteDraftLimit: 10 },
	}),
	notesCount: 0,
	incNotesCount: vi.fn(),
}));

vi.mock('@/instance.js', () => ({
	instance: { maxNoteTextLength: 3000 },
}));

vi.mock('@/store.js', async () => {
	const { ref: vueRef } = await import('vue');
	return {
		store: {
			s: {
				showPreview: false,
				localOnly: false,
				visibility: 'public',
				reactionAcceptance: null,
			},
			r: {
				tips: vueRef({ postForm: true }),
			},
			model: (_key: string) => vueRef(false),
			set: vi.fn(),
		},
	};
});

vi.mock('@/local-storage.js', () => ({
	miLocalStorage: {
		getItem: (k: string) => mockStorage.get(k) ?? null,
		setItem: (k: string, v: string) => { mockStorage.set(k, v); },
		removeItem: (k: string) => { mockStorage.delete(k); },
		getItemAsJson: (k: string) => {
			const item = mockStorage.get(k);
			return item === undefined ? undefined : JSON.parse(item);
		},
		setItemAsJson: (k: string, v: any) => {
			mockStorage.set(k, JSON.stringify(v));
		},
	},
}));

vi.mock('@/utility/misskey-api.js', () => ({
	misskeyApi: vi.fn(),
}));

vi.mock('@/os.js', () => ({
	apiWithDialog: vi.fn(),
	alert: vi.fn().mockResolvedValue(undefined),
	confirm: vi.fn().mockResolvedValue({ canceled: false }),
	actions: vi.fn().mockResolvedValue({ canceled: true }),
	popup: vi.fn(() => ({ dispose: vi.fn() })),
	popupMenu: vi.fn(),
	contextMenu: vi.fn(),
	selectUser: vi.fn(),
	inputDatetime: vi.fn(),
	select: vi.fn(),
}));

vi.mock('@/utility/autocomplete.js', () => ({
	Autocomplete: class {
		attach() {}
		detach() {}
	},
}));

vi.mock('@/composables/use-uploader.js', async () => {
	const { computed, ref: vueRef } = await import('vue');
	return {
		useUploader: () => {
			const items = vueRef<any[]>(uploaderState.items);
			return {
				items,
				addFiles: vi.fn(),
				removeItem: vi.fn((item: any) => {
					const idx = items.value.indexOf(item);
					if (idx >= 0) items.value.splice(idx, 1);
				}),
				abortAll: uploaderState.abortAllFn,
				reset: () => {
					uploaderState.resetFn();
					items.value = [];
				},
				dispose: vi.fn(),
				upload: async () => {
					await uploaderState.uploadFn();
				},
				getMenu: vi.fn(() => []),
				uploading: computed(() => uploaderState.uploading),
				readyForUpload: computed(() => uploaderState.readyForUpload),
				allItemsUploaded: computed(() => uploaderState.allItemsUploaded),
				events: new EventEmitter(),
			};
		},
	};
});

vi.mock('@/utility/paginator.js', async () => {
	const { ref: vueRef } = await import('vue');
	return {
		Paginator: class {
			items: any = vueRef<any[]>([]);
			reload: any = vi.fn();
			constructor(_ep: string, opts?: { params?: { scheduled?: boolean } }) {
				const isScheduled = Boolean(opts?.params?.scheduled);
				const entry = paginatorMocks.get(isScheduled);
				if (entry) {
					this.items = entry.items;
					this.reload = entry.reload;
				} else {
					paginatorMocks.set(isScheduled, { items: this.items, reload: this.reload });
				}
			}
		},
	};
});

vi.mock('@/accounts.js', () => ({ getAccounts: vi.fn().mockResolvedValue([]), getAccountMenu: vi.fn().mockResolvedValue([]) }));
vi.mock('@/utility/drive.js', () => ({ chooseDriveFile: vi.fn() }));
vi.mock('@/utility/achievements.js', () => ({ claimAchievement: vi.fn() }));
vi.mock('@/utility/emoji-picker.js', () => ({ emojiPicker: { show: vi.fn() } }));
vi.mock('@/utility/mfm-function-picker.js', () => ({ mfmFunctionPicker: vi.fn() }));
vi.mock('@/plugin.js', () => ({ getPluginHandlers: () => [] }));
vi.mock('@/events.js', () => ({ globalEvents: { emit: vi.fn() } }));
vi.mock('@/utility/tour.js', () => ({ startTour: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/tips.js', () => ({ closeTip: vi.fn() }));

const apiMock = vi.mocked(misskeyApi);
const apiWithDialogMock = vi.mocked(os.apiWithDialog);

const global = {
	stubs: {
		MkPostFormAttaches: true,
		MkPollEditor: true,
		MkNotePreview: true,
		MkNoteSimple: true,
		MkInfo: { template: '<div><slot/></div>' },
		MkTip: { template: '<div><slot/></div>' },
		MkUploaderItems: true,
		MkTime: true,
		MkEllipsis: { template: '<span data-ellipsis>...</span>' },
		MkLoading: true,
		MkAcct: true,
		I18n: { template: '<span><slot name="x"/></span>' },
		Mfm: { props: ['text'], template: '<span>{{ text }}</span>' },
		MkResult: { template: '<div><slot/></div>' },
		MkStickyContainer: { template: '<div><slot name="header"/><slot/></div>' },
		MkModalWindow: defineComponent({
			setup(_, { slots, expose }) {
				expose({ close: vi.fn() });
				return () => h('div', [slots.header?.(), slots.default?.()]);
			},
		}),
		MkTabs: { props: ['tabs', 'tab'], template: '<div/>' },
		MkPagination: defineComponent({
			props: ['paginator'],
			setup(props, { slots }) {
				return () => h('div', slots.default?.({ items: props.paginator.items.value }));
			},
		}),
		MkButton: defineComponent({
			props: ['disabled'],
			emits: ['click'],
			template: '<button :disabled="disabled" @click="$emit(\'click\', $event)"><slot/></button>',
		}),
	},
	directives: {
		tooltip: {},
		'click-anime': {},
	},
};

async function flush() {
	await nextTick();
	await new Promise(resolve => setTimeout(resolve, 0));
	await nextTick();
}

beforeEach(() => {
	mockStorage.clear();
	paginatorMocks.clear();
	Object.assign(prefer.s, {
		rememberNoteVisibility: false,
		defaultNoteLocalOnly: false,
		defaultNoteVisibility: 'public',
		enableQuickAddMfmFunction: false,
		animation: false,
	});
	uploaderState.items = [];
	uploaderState.uploading = false;
	uploaderState.readyForUpload = true;
	uploaderState.allItemsUploaded = true;
	uploaderState.uploadFn = vi.fn().mockResolvedValue(undefined);
	uploaderState.resetFn.mockReset();
	apiMock.mockReset();
	apiWithDialogMock.mockReset();
	vi.mocked(os.alert).mockClear();
	vi.mocked(os.confirm).mockClear();
});

afterEach(() => {
	cleanup();
});

describe('Scheduled note submit & drafts dialog delete', () => {
	test('MkPostForm scheduled submit guards posting, deletes local draft, and emits posted', async () => {
		mockStorage.set('drafts', JSON.stringify({
			'note:u1': {
				updatedAt: '2026-11-22T00:00:00.000Z',
				data: {
					text: 'Scheduled post body',
					useCw: false,
					cw: null,
					visibility: 'public',
					localOnly: false,
					files: [],
					poll: null,
					quoteId: null,
					reactionAcceptance: null,
					scheduledAt: Date.now() + 60_000,
				},
			},
		}));

		let resolveDraft!: (v: unknown) => void;
		apiWithDialogMock.mockImplementation(() => new Promise(resolve => { resolveDraft = resolve; }) as never);

		const onPosted = vi.fn();
		const { container } = render(MkPostForm, {
			props: { freezeAfterPosted: true, onPosted },
			global,
		});
		await flush();

		const submitBtn = container.querySelector('[data-testid="post-form-submit"]') as HTMLButtonElement;
		expect(submitBtn.disabled).toBe(false);

		// Rapid clicks while in-flight must only submit once
		await fireEvent.click(submitBtn);
		await fireEvent.click(submitBtn);
		await nextTick();

		expect(apiWithDialogMock).toHaveBeenCalledTimes(1);
		expect(apiWithDialogMock).toHaveBeenCalledWith('notes/drafts/create', expect.objectContaining({
			text: 'Scheduled post body',
			isActuallyScheduled: true,
		}));
		expect(submitBtn.disabled).toBe(true);
		expect(onPosted).not.toHaveBeenCalled();

		resolveDraft({ id: 'draft-1' });
		await flush();

		expect(onPosted).toHaveBeenCalledTimes(1);
		const draftsAfter = JSON.parse(mockStorage.get('drafts') ?? '{}');
		expect(draftsAfter['note:u1']).toBeUndefined();
	});

	test('MkPostForm scheduled submit alerts when file upload fails instead of failing silently', async () => {
		mockStorage.set('drafts', JSON.stringify({
			'note:u1': {
				updatedAt: '2026-11-22T00:00:00.000Z',
				data: {
					text: 'Scheduled with attachment',
					useCw: false,
					cw: null,
					visibility: 'public',
					localOnly: false,
					files: [],
					poll: null,
					quoteId: null,
					reactionAcceptance: null,
					scheduledAt: Date.now() + 60_000,
				},
			},
		}));

		uploaderState.items = [{ id: 'up1', uploaded: null, uploadFailed: true, aborted: false }];
		const onPosted = vi.fn();

		const { container } = render(MkPostForm, {
			props: { onPosted },
			global,
		});
		await flush();

		const submitBtn = container.querySelector('[data-testid="post-form-submit"]') as HTMLButtonElement;
		await fireEvent.click(submitBtn);
		await flush();

		expect(os.alert).toHaveBeenCalledTimes(1);
		expect(apiWithDialogMock).not.toHaveBeenCalled();
		expect(onPosted).not.toHaveBeenCalled();
		expect(submitBtn.disabled).toBe(false);
	});

	test('MkNoteDraftsDialog deleting a scheduled note reloads scheduledPaginator and decrements count', async () => {
		const draftsReload = vi.fn();
		const scheduledReload = vi.fn();
		const scheduledItem = {
			id: 'sch-1',
			createdAt: '2026-11-22T00:00:00.000Z',
			scheduledAt: Date.now() + 60_000,
			isActuallyScheduled: true,
			text: 'Future note',
			visibility: 'public',
			localOnly: false,
			user: { id: 'u1', username: 'alice', host: null },
		};

		paginatorMocks.set(false, { items: ref([]), reload: draftsReload });
		paginatorMocks.set(true, { items: ref([scheduledItem]), reload: scheduledReload });

		apiMock.mockResolvedValue(2 as never);
		apiWithDialogMock.mockResolvedValue(undefined as never);
		vi.mocked(os.confirm).mockResolvedValue({ canceled: false } as never);

		const { container } = render(MkNoteDraftsDialog, {
			props: { scheduled: true },
			global,
		});
		await flush();

		expect(container.textContent).toContain('(2/10)');

		const buttons = Array.from(container.querySelectorAll('button'));
		const deleteBtn = buttons.at(-1)!;
		await fireEvent.click(deleteBtn);
		await waitFor(() => expect(apiWithDialogMock).toHaveBeenCalledWith('notes/drafts/delete', { draftId: 'sch-1' }));
		await flush();

		expect(scheduledReload).toHaveBeenCalledTimes(1);
		expect(draftsReload).not.toHaveBeenCalled();
		expect(container.textContent).toContain('(1/10)');
	});
});
