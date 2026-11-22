/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { defineComponent, h, KeepAlive, nextTick, ref } from 'vue';
import { EventEmitter } from 'eventemitter3';
import { prefer } from '@/preferences.js';
import { instance } from '@/instance.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { hotkeyDirective } from '@/directives/hotkey.js';

const {
	mockState,
	mockRouter,
	deckMockState,
	scrollContainerEl,
} = vi.hoisted(() => {
	const emitter = new EventEmitter();
	const routerObj = Object.assign(emitter, {
		currentRoute: { value: { path: '/', name: 'index' } },
		navHook: null as ((path: string, flag?: 'forcePage') => boolean) | null,
		getCurrentFullPath: () => '/',
		push: vi.fn(),
		pushByPath: vi.fn(),
		replaceByPath: vi.fn(),
	});
	return {
		mockState: {
			deviceKind: 'desktop' as 'desktop' | 'tablet' | 'smartphone',
			zIndexCounter: { low: 1000000, middle: 2000000, high: 3000000 },
		},
		mockRouter: routerObj,
		deckMockState: {
			columns: [{ id: 'c1', type: 'main', width: 350, flexible: false }],
			layout: [['c1']],
		},
		scrollContainerEl: {
			scrollTop: 0,
			style: { touchAction: '', overscrollBehavior: '' },
		},
	};
});

vi.mock('@/utility/device-kind.js', () => ({
	get deviceKind() {
		return mockState.deviceKind;
	},
	DEFAULT_DEVICE_KIND: 'desktop',
	updateDeviceKind: vi.fn(),
}));

vi.mock('@/i.js', () => ({
	$i: {
		id: 'u1',
		username: 'alice',
		avatarUrl: '',
		twoFactorEnabled: false,
		policies: { maxFileSizeMb: 50, chatAvailability: 'available' },
	},
	ensureSignin: () => ({
		id: 'u1',
		username: 'alice',
		avatarUrl: '',
		twoFactorEnabled: false,
		policies: { maxFileSizeMb: 50, chatAvailability: 'available' },
	}),
}));

vi.mock('@/utility/misskey-api.js', () => ({
	misskeyApi: vi.fn(),
	formatApiError: (err: any) => String(err?.message ?? err),
}));

vi.mock('@/os.js', () => ({
	alert: vi.fn().mockResolvedValue(undefined),
	confirm: vi.fn().mockResolvedValue({ canceled: false }),
	apiWithDialog: vi.fn().mockResolvedValue(undefined),
	popupMenu: vi.fn(),
	contextMenu: vi.fn(),
	pageWindow: vi.fn(),
	select: vi.fn().mockResolvedValue({ canceled: true }),
	claimZIndex: (priority: 'low' | 'middle' | 'high' = 'low') => {
		mockState.zIndexCounter[priority] += 100;
		return mockState.zIndexCounter[priority];
	},
}));

vi.mock('@/router.js', () => ({
	mainRouter: mockRouter,
	useRouter: () => mockRouter,
}));

vi.mock('@/store.js', () => ({
	store: {
		s: {
			recentlyUsedUsers: [],
			darkMode: false,
			realtimeMode: false,
		},
		r: {
			tips: { value: { deck: true } },
		},
		set: vi.fn(),
	},
}));

vi.mock('@/accounts.js', () => ({
	login: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/theme.js', () => ({
	isPreviewMode: false,
	themeManager: { currentCompiledTheme: { accent: '#86b300' } },
}));

vi.mock('cropperjs', () => ({
	default: class {
		getCropperSelection() {
			return { themeColor: '', aspectRatio: 1, initialAspectRatio: 1, outlined: true, $center: vi.fn() };
		}
		getCropperImage() {
			return { $center: vi.fn() };
		}
	},
}));

vi.mock('@@/js/scroll.js', () => ({
	getScrollContainer: () => scrollContainerEl,
}));

vi.mock('@/utility/touch.js', () => ({
	isTouchUsing: false,
	isHorizontalSwipeSwiping: { value: false },
}));

vi.mock('@/utility/haptic.js', () => ({
	haptic: vi.fn(),
}));

vi.mock('@/deck.js', async () => {
	const { ref: vueRef } = await import('vue');
	return {
		columns: vueRef(deckMockState.columns),
		layout: vueRef(deckMockState.layout),
		columnTypes: ['main', 'widgets'],
		switchProfileMenu: vi.fn(),
		addColumn: vi.fn(),
		deleteProfile: vi.fn(),
	};
});

vi.mock('@/preferences/utility.js', () => ({ shouldSuggestRestoreBackup: false }));
vi.mock('@/utility/reload-suggest.js', () => ({ shouldSuggestReload: false }));
vi.mock('@/utility/tour.js', () => ({ startTour: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/tips.js', () => ({ closeTip: vi.fn() }));

vi.mock('@/components/MkDrive.vue', () => ({ default: { template: '<div data-drive/>' } }));
vi.mock('@/components/MkForm.vue', () => ({ default: { template: '<div data-form/>' } }));
vi.mock('@/components/MkSignin.vue', () => ({ default: { template: '<div data-signin/>' } }));
vi.mock('@/components/MkSignupDialog.rules.vue', () => ({ default: { template: '<div data-rules/>' } }));
vi.mock('@/components/MkStreamingNotificationsTimeline.vue', () => ({ default: { template: '<div data-notif-stream/>' } }));
vi.mock('@/components/MkNotesTimeline.vue', () => ({ default: { template: '<div data-notes-tl/>' } }));
vi.mock('@/components/MkNoteMediaGrid.vue', () => ({ default: { props: ['note'], template: '<div data-media-grid>{{ note.id }}</div>' } }));
vi.mock('@/components/MkReactionIcon.vue', () => ({ default: { template: '<span/>' } }));
vi.mock('@/components/MkUploaderItems.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/composables/use-uploader.js', async () => {
	const { computed, ref: vueRef } = await import('vue');
	const { EventEmitter: EE } = await import('eventemitter3');
	return {
		useUploader: () => ({
			items: vueRef([]),
			addFiles: vi.fn(),
			removeItem: vi.fn(),
			abortAll: vi.fn(),
			reset: vi.fn(),
			dispose: vi.fn(),
			upload: vi.fn(),
			getMenu: vi.fn(() => []),
			uploading: computed(() => false),
			readyForUpload: computed(() => false),
			allItemsUploaded: computed(() => true),
			events: new EE(),
		}),
	};
});

vi.mock('@/ui/_common_/common.vue', () => ({
	default: defineComponent({
		props: ['drawerMenuShowing', 'widgetsShowing'],
		template: '<div data-xcommon :data-drawer="String(drawerMenuShowing)" :data-widgets="String(widgetsShowing)"/>',
	}),
}));
vi.mock('@/ui/_common_/navbar.vue', () => ({
	default: defineComponent({
		props: ['showWidgetButton'],
		template: '<div data-xsidebar :data-widget-button="String(showWidgetButton)"/>',
	}),
}));
vi.mock('@/ui/_common_/navbar-h.vue', () => ({ default: { template: '<div data-xnavbar-h/>' } }));
vi.mock('@/ui/_common_/mobile-footer-menu.vue', () => ({
	default: defineComponent({
		props: ['drawerMenuShowing', 'widgetsShowing'],
		emits: ['update:drawerMenuShowing', 'update:widgetsShowing'],
		template: '<div data-mobile-footer><button data-open-drawer @click="$emit(\'update:drawerMenuShowing\', true)">drawer</button></div>',
	}),
}));
vi.mock('@/ui/_common_/titlebar.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/ui/_common_/PreferenceRestore.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/ui/_common_/ReloadSuggestion.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/ui/_common_/ThemePreviewing.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/ui/_common_/widgets.vue', () => ({ default: { template: '<div data-xwidgets/>' } }));
vi.mock('@/ui/deck/main-column.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/ui/deck/tl-column.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/ui/deck/antenna-column.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/ui/deck/list-column.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/ui/deck/channel-column.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/ui/deck/notifications-column.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/ui/deck/widgets-column.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/ui/deck/mentions-column.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/ui/deck/direct-column.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/ui/deck/role-timeline-column.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/ui/deck/chat-column.vue', () => ({ default: { template: '<div/>' } }));

import MkPullToRefresh from '@/components/MkPullToRefresh.vue';
import MkSignupDialogForm from '@/components/MkSignupDialog.form.vue';
import NotificationsPage from '@/pages/notifications.vue';
import MkNotification from '@/components/MkNotification.vue';
import UserIndexFiles from '@/pages/user/index.files.vue';
import DeckUI from '@/ui/deck.vue';
import UniversalUI from '@/ui/universal.vue';
import CheckinPopup from '@/components/CheckinPopup.vue';
import MkModal from '@/components/MkModal.vue';
import MkUserSelectDialog from '@/components/MkUserSelectDialog.vue';
import MkDriveFileSelectDialog from '@/components/MkDriveFileSelectDialog.vue';
import MkDriveFolderSelectDialog from '@/components/MkDriveFolderSelectDialog.vue';
import MkFormDialog from '@/components/MkFormDialog.vue';
import MkPasswordDialog from '@/components/MkPasswordDialog.vue';
import MkSignupDialog from '@/components/MkSignupDialog.vue';
import MkUploaderDialog from '@/components/MkUploaderDialog.vue';
import MkCropperDialog from '@/components/MkCropperDialog.vue';
import MkSigninDialog from '@/components/MkSigninDialog.vue';
import MkAgentModelFailureDialog from '@/components/MkAgentModelFailureDialog.vue';
import MkAgentQuickActionDialog from '@/components/MkAgentQuickActionDialog.vue';

const apiMock = vi.mocked(misskeyApi);

async function flush() {
	await nextTick();
	await new Promise(resolve => setTimeout(resolve, 0));
	await nextTick();
}

const commonGlobal = {
	components: {
		MkA: { props: ['to'], template: '<a :data-to="to"><slot/></a>' },
		MkButton: defineComponent({
			props: ['disabled'],
			emits: ['click'],
			template: '<button :disabled="disabled" @click="$emit(\'click\', $event)"><slot/></button>',
		}),
		MkLoading: { template: '<span data-loading>Loading</span>' },
		MkError: defineComponent({
			emits: ['retry'],
			template: '<div data-mk-error><button data-retry @click="$emit(\'retry\')">Retry</button></div>',
		}),
		MkContainer: { template: '<div><slot name="icon"/><slot name="header"/><slot/></div>' },
		MkAvatar: { template: '<span/>' },
		MkUserName: { props: ['user'], template: '<span>{{ user?.name ?? user?.username }}</span>' },
		MkAcct: { props: ['user'], template: '<span>{{ user?.username }}</span>' },
		MkTime: { template: '<time/>' },
		MkEllipsis: { template: '<span>...</span>' },
		MkInfo: { template: '<div><slot/></div>' },
		MkTip: { template: '<div><slot/></div>' },
		PageWithHeader: { template: '<div><slot/></div>' },
		RouterView: { template: '<div data-router-view/>' },
		StackingRouterView: { template: '<div/>' },
		Mfm: { props: ['text'], template: '<span>{{ text }}</span>' },
	},
	directives: {
		tooltip: {},
		'user-preview': {},
		hotkey: hotkeyDirective,
		panel: {},
	},
};

beforeEach(() => {
	mockState.deviceKind = 'desktop';
	mockState.zIndexCounter = { low: 1000000, middle: 2000000, high: 3000000 };
	scrollContainerEl.scrollTop = 0;
	Object.assign(prefer.s, {
		animation: false,
		'deck.navWindow': false,
		'deck.wallpaper': null,
		'experimental.stackingRouterView': false,
	});
	Object.assign(prefer.r, {
		showTitlebar: ref(false),
		'deck.navbarPosition': ref('left'),
		'deck.columnAlign': ref('left'),
		'deck.menuPosition': ref('right'),
		'deck.columnGap': ref(8),
	});
	Object.assign(instance, {
		disableRegistration: false,
		emailRequiredForSignup: false,
		enableHcaptcha: false,
		enableMcaptcha: false,
		enableRecaptcha: false,
		enableTurnstile: false,
		enableAliyunCaptcha: false,
		enableTestcaptcha: false,
		federation: 'all',
	});
	deckMockState.columns = [{ id: 'c1', type: 'main', width: 350, flexible: false }];
	deckMockState.layout = [['c1']];
	mockRouter.navHook = null;
	mockRouter.removeAllListeners();
	apiMock.mockReset();
	vi.mocked(os.alert).mockClear();
	vi.mocked(os.confirm).mockClear();
	vi.mocked(os.confirm).mockResolvedValue({ canceled: false } as never);
	vi.mocked(os.pageWindow).mockClear();
	vi.spyOn(window.URL, 'createObjectURL').mockReturnValue('blob:mock');
	vi.spyOn(window.URL, 'revokeObjectURL').mockImplementation(() => {});
	if (typeof globalThis.ResizeObserver === 'undefined') {
		vi.stubGlobal('ResizeObserver', class {
			observe() {}
			unobserve() {}
			disconnect() {}
		});
	}
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('Core UI polish regressions', () => {
	test('MkPullToRefresh resets refreshing state when refresher rejects so subsequent pulls still work', async () => {
		vi.useFakeTimers();
		const refresher = vi.fn()
			.mockRejectedValueOnce(new Error('network error'))
			.mockResolvedValueOnce(undefined);

		const { container } = render(MkPullToRefresh, {
			props: { refresher },
			slots: { default: '<div class="content">timeline</div>' },
			global: commonGlobal,
		});

		const root = container.firstElementChild as HTMLElement;
		const triggerPull = async () => {
			root.dispatchEvent(Object.assign(new Event('touchstart'), { touches: [{ screenY: 0 }] }));
			window.dispatchEvent(Object.assign(new Event('touchmove'), { touches: [{ screenY: 300 }] }));
			window.dispatchEvent(new Event('touchend'));
			await vi.advanceTimersByTimeAsync(250);
			await Promise.resolve();
			await vi.advanceTimersByTimeAsync(250);
			await nextTick();
		};

		await triggerPull();
		expect(refresher).toHaveBeenCalledTimes(1);
		// Must not stay stuck in refreshing state
		expect(container.querySelector('[data-loading]')).toBeNull();

		await triggerPull();
		expect(refresher).toHaveBeenCalledTimes(2);
	});

	test('MkSignupDialog.form revalidates retypedPassword when editing or clearing the first password', async () => {
		apiMock.mockResolvedValue({ available: true } as never);

		const { container } = render(MkSignupDialogForm, {
			global: {
				...commonGlobal,
				stubs: {
					MkCaptcha: true,
					MkInput: defineComponent({
						props: ['modelValue', 'type'],
						emits: ['update:modelValue'],
						template: '<input :type="type" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)">',
					}),
				},
			},
		});

		const usernameInput = container.querySelector('[data-testid="signup-username"] input, input[data-testid="signup-username"]') as HTMLInputElement;
		const passwordInput = container.querySelector('[data-testid="signup-password"] input, input[data-testid="signup-password"]') as HTMLInputElement;
		const retypeInput = container.querySelector('[data-testid="signup-password-retype"] input, input[data-testid="signup-password-retype"]') as HTMLInputElement;
		const submitBtn = container.querySelector('[data-testid="signup-submit"]') as HTMLButtonElement;

		await fireEvent.update(usernameInput, 'alice');
		await flush();
		await fireEvent.update(passwordInput, 'Secret123!');
		await fireEvent.update(retypeInput, 'Secret123!');
		await nextTick();
		expect(submitBtn.disabled).toBe(false);
		expect(container.textContent).toContain(i18n.ts.passwordMatched);

		// Edit first password: match must turn into not-match and disable submit
		await fireEvent.update(passwordInput, 'Secret123');
		await nextTick();
		expect(submitBtn.disabled).toBe(true);
		expect(container.textContent).toContain(i18n.ts.passwordNotMatched);

		// Re-match, then clear first password to empty string: must also invalidate match
		await fireEvent.update(passwordInput, 'Secret123!');
		await nextTick();
		expect(submitBtn.disabled).toBe(false);
		await fireEvent.update(passwordInput, '');
		await nextTick();
		expect(submitBtn.disabled).toBe(true);
		expect(container.textContent).toContain(i18n.ts.passwordNotMatched);
	});

	test('notifications.vue marks read once on initial KeepAlive mount and again on KeepAlive revisits', async () => {
		apiMock.mockResolvedValue(undefined as never);
		const showing = ref(true);

		render(defineComponent({
			setup() {
				return () => h(KeepAlive, null, () => showing.value ? h(NotificationsPage) : null);
			},
		}), { global: commonGlobal });
		await flush();
		expect(apiMock).toHaveBeenCalledTimes(1);
		expect(apiMock).toHaveBeenCalledWith('notifications/mark-all-as-read', {});

		showing.value = false;
		await flush();
		expect(apiMock).toHaveBeenCalledTimes(1);

		showing.value = true;
		await flush();
		expect(apiMock).toHaveBeenCalledTimes(2);
	});

	test('MkNotification follow request locks in-flight, alerts on failure without hiding buttons, and hides only on success', async () => {
		let rejectReq!: (err: Error) => void;
		apiMock.mockImplementationOnce(() => new Promise((_, reject) => { rejectReq = reject; }) as never);

		const notif = {
			id: 'n-follow-1',
			createdAt: '2026-11-22T00:00:00Z',
			type: 'receiveFollowRequest',
			userId: 'bob',
			user: { id: 'bob', username: 'bob', host: null, name: 'Bob', avatarUrl: '' },
		};

		const { container } = render(MkNotification, {
			props: { notification: notif as never, full: true },
			global: commonGlobal,
		});

		const acceptBtn = () => Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes(i18n.ts.accept));
		const rejectBtn = () => Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes(i18n.ts.reject));

		await fireEvent.click(acceptBtn()!);
		await fireEvent.click(acceptBtn()!);
		expect(apiMock).toHaveBeenCalledTimes(1);
		expect(acceptBtn()!.disabled).toBe(true);
		expect(rejectBtn()!.disabled).toBe(true);

		rejectReq(new Error('server error'));
		await flush();

		expect(os.alert).toHaveBeenCalledTimes(1);
		expect(acceptBtn()).toBeDefined();
		expect(acceptBtn()!.disabled).toBe(false);

		apiMock.mockResolvedValueOnce(undefined as never);
		await fireEvent.click(acceptBtn()!);
		await flush();
		expect(acceptBtn()).toBeUndefined();
	});

	test('user/index.files.vue clears spinner on failure, renders retry, and recovers on retry', async () => {
		apiMock
			.mockRejectedValueOnce(new Error('offline'))
			.mockResolvedValueOnce([{ id: 'note-1' }] as never);

		const { container } = render(UserIndexFiles, {
			props: { user: { id: 'u-target' } as never },
			global: commonGlobal,
		});
		await flush();

		expect(container.querySelector('[data-loading]')).toBeNull();
		const retryBtn = container.querySelector('[data-retry]') as HTMLButtonElement;
		expect(retryBtn).not.toBeNull();

		await fireEvent.click(retryBtn);
		await flush();

		expect(container.querySelector('[data-mk-error]')).toBeNull();
		expect(container.querySelector('[data-media-grid]')?.textContent).toBe('note-1');
	});

	test('ui/deck.vue honors deviceKind smartphone and closes drawer on route change and navHook pageWindow', async () => {
		mockState.deviceKind = 'smartphone';
		Object.defineProperty(window, 'innerWidth', { value: 900, configurable: true });

		const { container } = render(DeckUI, { global: commonGlobal });
		await nextTick();

		expect(container.querySelector('[data-mobile-footer]')).not.toBeNull();
		await fireEvent.click(container.querySelector('[data-open-drawer]')!);
		await nextTick();
		expect(container.querySelector('[data-xcommon]')?.getAttribute('data-drawer')).toBe('true');

		mockRouter.emit('change', { beforeFullPath: '/', fullPath: '/notifications' });
		await nextTick();
		expect(container.querySelector('[data-xcommon]')?.getAttribute('data-drawer')).toBe('false');

		await fireEvent.click(container.querySelector('[data-open-drawer]')!);
		await nextTick();
		expect(container.querySelector('[data-xcommon]')?.getAttribute('data-drawer')).toBe('true');

		prefer.s['deck.navWindow'] = true;
		const handled = mockRouter.navHook?.('/settings');
		await nextTick();
		expect(handled).toBe(true);
		expect(os.pageWindow).toHaveBeenCalledWith('/settings');
		expect(container.querySelector('[data-xcommon]')?.getAttribute('data-drawer')).toBe('false');
	});

	test('ui/universal.vue updates showWidgetsSide reactively across 1090px threshold on resize', async () => {
		Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true });
		const { container } = render(UniversalUI, { global: commonGlobal });
		await nextTick();

		expect(container.querySelector('[data-xwidgets]')).not.toBeNull();
		expect(container.querySelector('[data-xsidebar]')?.getAttribute('data-widget-button')).toBe('false');

		Object.defineProperty(window, 'innerWidth', { value: 1090, configurable: true });
		window.dispatchEvent(new Event('resize'));
		await nextTick();

		expect(container.querySelector('[data-xwidgets]')).toBeNull();
		expect(container.querySelector('[data-xsidebar]')?.getAttribute('data-widget-button')).toBe('true');

		Object.defineProperty(window, 'innerWidth', { value: 1091, configurable: true });
		window.dispatchEvent(new Event('resize'));
		await nextTick();

		expect(container.querySelector('[data-xwidgets]')).not.toBeNull();
		expect(container.querySelector('[data-xsidebar]')?.getAttribute('data-widget-button')).toBe('false');
	});

	test('CheckinPopup uses MkModal with middle zPriority, stays interactive above startup modals, and closes on Esc', async () => {
		const onClosed = vi.fn();
		const Host = defineComponent({
			setup() {
				return () => h('div', [
					h(MkModal, { zPriority: 'low', preferType: 'dialog' }, () => h('div', { 'data-startup-modal': '' }, 'startup')),
					h(CheckinPopup, {
						reward: 10,
						streak: 3,
						baseValue: 5,
						streakMultiplier: 2,
						roleMultiplier: 1,
						dayMultiplier: 1,
						onClosed,
					}),
				]);
			},
		});

		const { container } = render(Host, { global: commonGlobal });
		await flush();

		const startupEl = container.querySelector('[data-startup-modal]')!.closest('[style*="z-index"]') as HTMLElement;
		const claimBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes(i18n.ts._agents.checkinPopupClaim))!;
		const checkinModalEl = claimBtn.closest('[style*="z-index"]') as HTMLElement;

		expect(Number(checkinModalEl.style.zIndex)).toBeGreaterThan(Number(startupEl.style.zIndex));
		expect(checkinModalEl.inert).toBe(false);
		expect(startupEl.inert).toBe(true);

		window.document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
		await flush();
		expect(onClosed).toHaveBeenCalledTimes(1);
	});

	test.each([
		{
			name: 'MkDriveFileSelectDialog',
			component: MkDriveFileSelectDialog,
			props: { multiple: false },
			eventKey: 'done',
		},
		{
			name: 'MkDriveFolderSelectDialog',
			component: MkDriveFolderSelectDialog,
			props: { multiple: false },
			eventKey: 'done',
		},
		{
			name: 'MkUserSelectDialog',
			component: MkUserSelectDialog,
			props: {},
			eventKey: 'cancel',
		},
		{
			name: 'MkFormDialog',
			component: MkFormDialog,
			props: { title: 'Test', form: {} },
			eventKey: 'done',
		},
		{
			name: 'MkPasswordDialog',
			component: MkPasswordDialog,
			props: {},
			eventKey: 'cancelled',
		},
		{
			name: 'MkSignupDialog',
			component: MkSignupDialog,
			props: {},
			eventKey: 'cancelled',
		},
		{
			name: 'MkUploaderDialog',
			component: MkUploaderDialog,
			props: { files: [] },
			eventKey: 'canceled',
		},
		{
			name: 'MkCropperDialog',
			component: MkCropperDialog,
			props: { imageFile: new Blob(['x'], { type: 'image/png' }), aspectRatio: 1 },
			eventKey: 'cancel',
		},
		{
			name: 'MkSigninDialog',
			component: MkSigninDialog,
			props: {},
			eventKey: 'cancelled',
		},
		{
			name: 'MkAgentModelFailureDialog',
			component: MkAgentModelFailureDialog,
			props: {},
			eventKey: null,
		},
		{
			name: 'MkAgentQuickActionDialog',
			component: MkAgentQuickActionDialog,
			props: { userName: 'alice', sessions: [], moderatorName: 'mod' },
			eventKey: 'cancel',
		},
	])('$name wires @esc to close/cancel handler', async ({ component, props, eventKey }) => {
		apiMock.mockResolvedValue([] as never);
		const closeSpy = vi.fn();
		const eventSpy = vi.fn();
		const modalStub = defineComponent({
			emits: ['esc', 'close', 'closed', 'click', 'ok'],
			setup(_, { slots, emit, expose }) {
				expose({ close: closeSpy });
				return () => h('div', [
					h('button', { 'data-test-esc': '', onClick: () => emit('esc') }, 'esc'),
					slots.default?.({ type: 'dialog' }),
				]);
			},
		});

		const eventProp = eventKey ? { [`on${eventKey[0].toUpperCase()}${eventKey.slice(1)}`]: eventSpy } : {};
		const { container } = render(component as never, {
			props: { ...props, ...eventProp },
			global: {
				...commonGlobal,
				stubs: {
					MkModalWindow: modalStub,
					MkModal: modalStub,
					MkInput: defineComponent({
						props: ['modelValue'],
						setup(_, { expose }) {
							expose({ focus: vi.fn() });
							return () => h('input');
						},
					}),
					MkTextarea: { props: ['modelValue'], template: '<textarea/>' },
					FormSplit: { template: '<div><slot/></div>' },
				},
			},
		});
		await nextTick();

		await fireEvent.click(container.querySelector('[data-test-esc]')!);
		await flush();

		expect(closeSpy).toHaveBeenCalledTimes(1);
		if (eventKey) {
			expect(eventSpy).toHaveBeenCalledTimes(1);
		}
	});

	test('MkUserSelectDialog debounces search, discards stale search responses, and guards ok()', async () => {
		vi.useFakeTimers();
		let resolveFirstSearch!: (users: any[]) => void;
		let resolveSecondSearch!: (users: any[]) => void;
		let resolveShow!: (user: any) => void;
		let searchCallCount = 0;

		apiMock.mockImplementation((endpoint, data: any) => {
			if (endpoint === 'users/show' && Array.isArray(data?.userIds)) {
				return Promise.resolve([]) as never;
			}
			if (endpoint === 'users/search-by-username-and-host') {
				searchCallCount++;
				if (searchCallCount === 1) {
					return new Promise(resolve => { resolveFirstSearch = resolve; }) as never;
				}
				return new Promise(resolve => { resolveSecondSearch = resolve; }) as never;
			}
			if (endpoint === 'users/show' && data?.userId) {
				return new Promise(resolve => { resolveShow = resolve; }) as never;
			}
			return Promise.resolve([]) as never;
		});

		const okSpy = vi.fn();
		const closeSpy = vi.fn();
		const { container } = render(MkUserSelectDialog, {
			props: { onOk: okSpy },
			global: {
				...commonGlobal,
				stubs: {
					MkModalWindow: defineComponent({
						props: ['withOkButton', 'okButtonDisabled'],
						emits: ['ok', 'close', 'click', 'esc', 'closed'],
						setup(props, { slots, emit, expose }) {
							expose({ close: closeSpy });
							return () => h('div', [
								h('button', { 'data-ok-btn': '', disabled: props.okButtonDisabled, onClick: () => emit('ok') }, 'OK'),
								slots.default?.(),
							]);
						},
					}),
					MkInput: defineComponent({
						props: ['modelValue'],
						emits: ['update:modelValue'],
						template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)">',
					}),
					FormSplit: { template: '<div><slot/></div>' },
				},
			},
		});
		await Promise.resolve();
		await nextTick();

		const usernameInput = container.querySelector('input')!;
		await fireEvent.update(usernameInput, 'a');
		await fireEvent.update(usernameInput, 'al');
		expect(searchCallCount).toBe(0);

		vi.advanceTimersByTime(300);
		expect(searchCallCount).toBe(1);

		await fireEvent.update(usernameInput, 'bob');
		vi.advanceTimersByTime(300);
		expect(searchCallCount).toBe(2);

		// Second search resolves first, then stale first search resolves late
		resolveSecondSearch([{ id: 'u-bob', username: 'bob', host: null, name: 'Bob' }]);
		await Promise.resolve();
		await nextTick();
		expect(container.textContent).toContain('bob');

		resolveFirstSearch([{ id: 'u-stale', username: 'alice_stale', host: null, name: 'Stale' }]);
		await Promise.resolve();
		await nextTick();
		expect(container.textContent).toContain('bob');
		expect(container.textContent).not.toContain('alice_stale');

		// Select user and double-click OK: only one users/show call may fire while in flight
		const row = Array.from(container.querySelectorAll('._button')).find(el => el.textContent?.includes('bob'))!;
		await fireEvent.click(row);
		await nextTick();

		const okBtn = container.querySelector('[data-ok-btn]') as HTMLButtonElement;
		expect(okBtn.disabled).toBe(false);
		await fireEvent.click(okBtn);
		await fireEvent.click(okBtn);
		expect(okBtn.disabled).toBe(true);
		expect(apiMock.mock.calls.filter(([ep]) => ep === 'users/show')).toHaveLength(2); // 1 initial recent + 1 ok()

		resolveShow({ id: 'u-bob', username: 'bob', host: null, name: 'Bob' });
		await Promise.resolve();
		await nextTick();
		expect(okSpy).toHaveBeenCalledTimes(1);
		expect(closeSpy).toHaveBeenCalledTimes(1);
	});
});
