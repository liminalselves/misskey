/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { effectScope, nextTick, ref, watch } from 'vue';
import { transpileModule } from 'typescript';

const source = readFileSync(resolve(process.cwd(), 'src/pages/chat/agent-session.vue'), 'utf8');
const pagination = source.slice(source.indexOf('async function fetchOlderMessages()'), source.indexOf('\nlet proactiveNotificationConnection'));
const notificationStart = source.includes('let pendingAgentMessageNotification') ? 'let pendingAgentMessageNotification' : 'async function onNewAgentMessage(';
const notification = source.slice(source.indexOf(notificationStart), source.indexOf('\nfunction onAgentMessageDeleted('));
const send = source.slice(source.indexOf('async function onFormSubmit('), source.indexOf('\nfunction nullableNumberInput('));
const abort = source.slice(source.indexOf('async function onAbortRequest('), source.indexOf('\n</script>'));
const poll = source.slice(source.indexOf('function startReplyPendingPoll()'), source.indexOf('\nfunction isAgentReplyPendingError('));
const script = transpileModule(`${pagination}\n${notification}\n${send}\n${abort}\n${poll}\nreturn { fetchOlderMessages, fetchNewerMessages, onNewAgentMessage, onFormSubmit, onAbortRequest, startReplyPendingPoll, setUnmounted: () => { isComponentUnmounted = true; } };`, {}).outputText;
const optimisticId = 'agent-opt:12345678-1234-1234-1234-123456789012';
const scopes: ReturnType<typeof effectScope>[] = [];

afterEach(() => scopes.splice(0).forEach(scope => scope.stop()));

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
	return { promise, resolve, reject };
}

function setup(ids: string[], sending = false) {
	const state = {
		messages: ref(ids.map(id => ({ id }))),
		sending: ref(sending),
		moreFetching: ref(false),
		fetchingNewer: ref(false),
		canFetchMore: ref(true),
		canFetchNewer: ref(true),
		OPTIMISTIC_MESSAGE_ID_PREFIX: 'agent-opt:',
		sessionId: 'session1',
		PAGE_LIMIT: 30,
		callAgentApi: vi.fn(async (_endpoint: string, data: { sinceId?: string; untilId?: string }) => {
			const cursor = data.sinceId ?? data.untilId;
			if (cursor != null && !/^[a-zA-Z0-9]+$/.test(cursor)) throw new Error('Invalid misskey:id');
			return [] as { id: string }[];
		}),
		os: { alert: vi.fn(), toast: vi.fn() },
		formatApiError: String,
		refreshContextWindow: vi.fn(async () => {}),
		markAgentSessionRead: vi.fn(async () => {}),
		loadInitialTimeline: vi.fn(async () => [] as { id: string; role?: string }[]),
		isPageActivated: true,
		isComponentUnmounted: false,
		proactiveMessageSyncing: false,
		window: { document: { hidden: false }, setTimeout: vi.fn(), clearTimeout: vi.fn() },
		liveArrivedMessageIds: new Set<string>(),
		tab: ref('chat'),
		scrollToLatest: vi.fn(async () => {}),
		playSegmentedReply: vi.fn(async (_message: { id: string }) => true),
		watch,
		isReviewMode: ref(false),
		editingMessage: ref(null),
		stopReplyPendingPoll: vi.fn(),
		session: ref({ id: 'session1', dialogueStyleId: 'style1' }),
		expectedCallCostForSession: ref(0),
		currentClientRequestId: null,
		getStoredPendingRequestId: () => null,
		setStoredPendingRequestId: vi.fn(),
		sendAbortController: null,
		crypto,
		AbortController,
		DOMException,
		previewPendingWorldbookMatches: vi.fn(async () => {}),
		misskeyApi: vi.fn(async (): Promise<Record<string, unknown>> => ({ userMessageId: 'user1', assistantMessageId: 'reply1', assistantText: 'Reply' })),
		segmentPlayback: ref<{ messageId: string } | null>(null),
		finishSegmentPlayback: vi.fn(),
		replyPollTimer: null,
		pollSessionReplyState: vi.fn(async () => {}),
		abortedRequestIds: new Set<string>(),
		formRef: { value: { restoreDraft: vi.fn() } },
		i18n: { ts: { _agents: {} } },
		playableSegmentsFor: () => [],
		showMemoryAddScheduledHintNow: () => false,
		loadSession: vi.fn(async () => {}),
		loadAgentCreditBalance: vi.fn(),
		scheduleCompressionOverviewAfterSidecar: vi.fn(),
		pendingWorldbookMatches: ref([]),
		isAgentReplyPendingError: () => false,
		showAgentModelFailureFeedback: vi.fn(),
		agentModelFailureFromError: (error: unknown) => error,
	};
	const scope = effectScope();
	scopes.push(scope);
	const actions = scope.run(() => new Function(...Object.keys(state), script)(...Object.values(state))) as {
		fetchOlderMessages: () => Promise<void>;
		fetchNewerMessages: () => Promise<void>;
		onNewAgentMessage: (payload: { sessionId: string; messageId: string }) => Promise<void>;
		onFormSubmit: (payload: { text: string; file: null }) => Promise<void>;
		onAbortRequest: () => Promise<void>;
		startReplyPendingPoll: () => void;
		setUnmounted: () => void;
	};
	return { ...state, ...actions };
}

describe('Agent message synchronization', () => {
	test('defers notifications and does not mark them read ahead of the send response', async () => {
		const state = setup([optimisticId, 'message1'], true);
		await state.onNewAgentMessage({ sessionId: 'session1', messageId: 'message2' });
		expect(state.callAgentApi).not.toHaveBeenCalled();
		expect(state.os.alert).not.toHaveBeenCalled();
		expect(state.markAgentSessionRead).not.toHaveBeenCalled();
	});

	test('automatically synchronizes after sending finishes without another notification', async () => {
		const state = setup([optimisticId], true);
		await state.onNewAgentMessage({ sessionId: 'session1', messageId: 'message3' });
		state.messages.value = [{ id: 'message2' }, { id: 'message1' }];
		state.callAgentApi.mockResolvedValueOnce([{ id: 'message3' }]);
		state.sending.value = false;
		await vi.waitFor(() => expect(state.messages.value[0].id).toBe('message3'));
		expect(state.callAgentApi).toHaveBeenCalledExactlyOnceWith('agents/messages/timeline', {
			sessionId: 'session1', limit: 30, sinceId: 'message2',
		});
		expect(state.markAgentSessionRead).toHaveBeenCalledOnce();
	});

	test('coalesces notifications while sending and preserves background unread state', async () => {
		const state = setup(['message1'], true);
		state.window.document.hidden = true;
		await state.onNewAgentMessage({ sessionId: 'session1', messageId: 'message2' });
		await state.onNewAgentMessage({ sessionId: 'session1', messageId: 'message3' });
		state.callAgentApi.mockResolvedValueOnce([{ id: 'message2' }, { id: 'message3' }]);
		state.sending.value = false;
		await vi.waitFor(() => expect(state.messages.value[0].id).toBe('message3'));
		expect(state.callAgentApi).toHaveBeenCalledOnce();
		expect(state.markAgentSessionRead).not.toHaveBeenCalled();
	});

	test('retains a notification that arrives during an existing synchronization', async () => {
		const state = setup(['message1']);
		const request = deferred<{ id: string }[]>();
		state.callAgentApi.mockReturnValueOnce(request.promise).mockResolvedValueOnce([{ id: 'message3' }]);
		const first = state.onNewAgentMessage({ sessionId: 'session1', messageId: 'message2' });
		await state.onNewAgentMessage({ sessionId: 'session1', messageId: 'message3' });
		request.resolve([{ id: 'message2' }]);
		await first;
		await vi.waitFor(() => expect(state.messages.value[0].id).toBe('message3'));
		expect(state.callAgentApi).toHaveBeenCalledTimes(2);
		expect(state.messages.value.map(message => message.id)).toEqual(['message3', 'message2', 'message1']);
	});

	test('fetches a later reply after the actual send response and segmented playback finish', async () => {
		const state = setup(['message1']);
		const playback = deferred<boolean>();
		state.playSegmentedReply.mockImplementation(message => message.id === 'reply1' ? playback.promise : Promise.resolve(true));
		const request = state.onFormSubmit({ text: 'Hello', file: null });
		await vi.waitFor(() => expect(state.playSegmentedReply).toHaveBeenCalled());
		state.markAgentSessionRead.mockClear();
		await state.onNewAgentMessage({ sessionId: 'session1', messageId: 'reply2' });
		expect(state.callAgentApi).not.toHaveBeenCalled();
		expect(state.markAgentSessionRead).not.toHaveBeenCalled();
		state.callAgentApi.mockResolvedValueOnce([{ id: 'reply2' }]);
		playback.resolve(true);
		await request;
		await vi.waitFor(() => expect(state.messages.value.map(message => message.id)).toEqual(['reply2', 'reply1', 'user1', 'message1']));
		expect(state.os.alert).not.toHaveBeenCalled();
		expect(state.showAgentModelFailureFeedback).not.toHaveBeenCalled();
	});

	test('flushes notifications after an actual send failure and restores the draft', async () => {
		const state = setup(['message1']);
		const response = deferred<{ userMessageId: string; assistantMessageId: string; assistantText: string }>();
		state.misskeyApi.mockReturnValueOnce(response.promise);
		const request = state.onFormSubmit({ text: 'Hello', file: null });
		await vi.waitFor(() => expect(state.misskeyApi).toHaveBeenCalled());
		await state.onNewAgentMessage({ sessionId: 'session1', messageId: 'reply2' });
		state.callAgentApi.mockResolvedValueOnce([{ id: 'reply2' }]);
		response.reject(new Error('Send failed'));
		await request;
		await vi.waitFor(() => expect(state.messages.value.map(message => message.id)).toEqual(['reply2', 'message1']));
		expect(state.formRef.value.restoreDraft).toHaveBeenCalledWith('Hello', null);
		expect(state.loadInitialTimeline).toHaveBeenCalledOnce();
		expect(state.sending.value).toBe(false);
	});

	test('flushes notifications when the user interrupts segmented playback', async () => {
		const state = setup(['message1']);
		const playback = deferred<boolean>();
		state.playSegmentedReply.mockImplementation(message => message.id === 'reply1' ? playback.promise : Promise.resolve(true));
		const request = state.onFormSubmit({ text: 'Hello', file: null });
		await vi.waitFor(() => expect(state.playSegmentedReply).toHaveBeenCalled());
		state.segmentPlayback.value = { messageId: 'reply1' };
		state.finishSegmentPlayback.mockImplementation(() => playback.resolve(true));
		await state.onNewAgentMessage({ sessionId: 'session1', messageId: 'reply2' });
		state.callAgentApi.mockResolvedValueOnce([{ id: 'reply2' }]);
		await state.onAbortRequest();
		await request;
		await vi.waitFor(() => expect(state.messages.value[0].id).toBe('reply2'));
		expect(state.finishSegmentPlayback).toHaveBeenCalledOnce();
		expect(state.sending.value).toBe(false);
	});

	test('flushes notifications after a pending send is interrupted', async () => {
		const state = setup(['message1']);
		const response = deferred<Record<string, unknown>>();
		state.misskeyApi.mockReturnValueOnce(response.promise).mockResolvedValueOnce({ aborted: true });
		const request = state.onFormSubmit({ text: 'Hello', file: null });
		await vi.waitFor(() => expect(state.misskeyApi).toHaveBeenCalled());
		await state.onNewAgentMessage({ sessionId: 'session1', messageId: 'reply2' });
		state.callAgentApi.mockResolvedValueOnce([{ id: 'reply2' }]);
		await state.onAbortRequest();
		response.resolve({ userMessageId: 'user1', assistantMessageId: 'reply1', assistantText: 'Late reply' });
		await request;
		await vi.waitFor(() => expect(state.messages.value.map(message => message.id)).toEqual(['reply2', 'message1']));
		expect(state.formRef.value.restoreDraft).toHaveBeenCalledWith('Hello', null);
		expect(state.showAgentModelFailureFeedback).not.toHaveBeenCalled();
	});

	test('flushes notifications when refreshed-session recovery polling completes', async () => {
		const state = setup(['message1'], true);
		state.loadInitialTimeline.mockImplementation(async () => {
			const rows = [{ id: 'reply1', role: 'assistant' }, { id: 'message1', role: 'user' }];
			state.messages.value = rows;
			return rows;
		});
		await state.onNewAgentMessage({ sessionId: 'session1', messageId: 'reply2' });
		state.callAgentApi.mockResolvedValueOnce([{ id: 'reply2' }]);
		state.startReplyPendingPoll();
		await vi.waitFor(() => expect(state.messages.value.map(message => message.id)).toEqual(['reply2', 'reply1', 'message1']));
		expect(state.pollSessionReplyState).toHaveBeenCalledOnce();
		expect(state.sending.value).toBe(false);
	});

	test('does not flush deferred notifications after the component unmounts', async () => {
		const state = setup(['message1'], true);
		await state.onNewAgentMessage({ sessionId: 'session1', messageId: 'message2' });
		state.setUnmounted();
		state.sending.value = false;
		await nextTick();
		expect(state.callAgentApi).not.toHaveBeenCalled();
		expect(state.markAgentSessionRead).not.toHaveBeenCalled();
	});

	test('does not fetch when sending finishes without a deferred notification', async () => {
		const state = setup(['message1'], true);
		state.sending.value = false;
		await nextTick();
		expect(state.callAgentApi).not.toHaveBeenCalled();
	});

	test('ignores other-session notifications even while sending', async () => {
		const state = setup(['message1'], true);
		await state.onNewAgentMessage({ sessionId: 'session2', messageId: 'message3' });
		state.sending.value = false;
		await nextTick();
		expect(state.callAgentApi).not.toHaveBeenCalled();
		expect(state.markAgentSessionRead).not.toHaveBeenCalled();
	});

	test.each(['fetchOlderMessages', 'fetchNewerMessages'] as const)('%s skips temporary cursor messages', async (action) => {
		const state = setup([optimisticId, 'message2', 'message1', optimisticId]);
		await state[action]();
		expect(state.callAgentApi).toHaveBeenCalledExactlyOnceWith('agents/messages/timeline', {
			sessionId: 'session1', limit: 30,
			...(action === 'fetchNewerMessages' ? { sinceId: 'message2' } : { untilId: 'message1' }),
		});
		expect(state.os.alert).not.toHaveBeenCalled();
	});

	test.each(['fetchOlderMessages', 'fetchNewerMessages'] as const)('%s waits when no persisted message exists', async (action) => {
		const state = setup([optimisticId]);
		await state[action]();
		expect(state.callAgentApi).not.toHaveBeenCalled();
		expect(state.os.alert).not.toHaveBeenCalled();
		expect(state.moreFetching.value).toBe(false);
		expect(state.fetchingNewer.value).toBe(false);
	});

	test.each(['fetchOlderMessages', 'fetchNewerMessages'] as const)('%s preserves persisted message ordering', async (action) => {
		const state = setup(['message2', 'message1']);
		state.callAgentApi.mockResolvedValueOnce([{ id: 'message3' }, { id: 'message4' }]);
		await state[action]();
		expect(state.messages.value.map(message => message.id)).toEqual(action === 'fetchNewerMessages'
			? ['message4', 'message3', 'message2', 'message1']
			: ['message2', 'message1', 'message3', 'message4']);
		expect(state.os.alert).not.toHaveBeenCalled();
	});
});
