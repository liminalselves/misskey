<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div
	:class="$style.root"
	@dragover.stop="onDragover"
	@drop.stop="onDrop"
>
	<!-- 群内 @mention 自动补全浮层 -->
	<div v-if="mentionOpen && mentionSuggestions.length > 0" :class="$style.mentionPopup" class="_popup _shadow" role="listbox">
		<button
			v-for="(candidate, idx) in mentionSuggestions"
			:key="candidate.id"
			type="button"
			role="option"
			:aria-selected="idx === mentionSelectedIndex"
			class="_button"
			:class="[$style.mentionItem, { [$style.mentionItemSelected]: idx === mentionSelectedIndex }]"
			@mousedown.prevent="selectMentionCandidate(candidate)"
		>
			<MkAvatar :user="candidate" :link="false" :class="$style.mentionAvatar"/>
			<span :class="$style.mentionName"><MkUserName :user="candidate"/></span>
			<span :class="$style.mentionAcct">@{{ formatUserAcct(candidate) }}</span>
		</button>
	</div>

	<!-- 编辑消息提示条 -->
	<div v-if="editingMessage" :class="$style.replyPreview">
		<div :class="$style.replyBar"></div>
		<div :class="$style.replyInfo">
			<span :class="$style.replyLabel"><i class="ti ti-pencil"></i> {{ i18n.ts._chat.editMessage }}</span>
			<span :class="$style.replyText">{{ editingMessage.text || i18n.ts._chat.attachmentPlaceholder }}</span>
		</div>
		<button
			type="button"
			class="_button"
			:class="$style.replyCancelBtn"
			:aria-label="i18n.ts._chat.cancelEdit"
			:title="i18n.ts._chat.cancelEdit"
			@click="cancelEdit"
		>
			<i class="ti ti-x"></i>
		</button>
	</div>

	<!-- 引用预览条 -->
	<div v-else-if="replyTo" :class="$style.replyPreview">
		<div :class="$style.replyBar"></div>
		<div :class="$style.replyInfo">
			<span :class="$style.replyLabel">{{ i18n.ts._chat.reply }}</span>
			<span :class="$style.replyText">{{ replyTo.text || i18n.ts._chat.attachmentPlaceholder }}</span>
		</div>
		<button
			type="button"
			class="_button"
			:class="$style.replyCancelBtn"
			:aria-label="i18n.ts.cancel"
			:title="i18n.ts.cancel"
			@click="cancelReply"
		>
			<i class="ti ti-x"></i>
		</button>
	</div>

	<!-- 附件芯片 -->
	<div v-if="file && !isEditing" :class="$style.fileWrap">
		<button
			type="button"
			class="_button"
			:class="$style.fileChip"
			:aria-label="`${i18n.ts.remove}: ${file.name}`"
			@click="file = null"
		>
			<img v-if="file.type.startsWith('image/') && (file.thumbnailUrl || file.url)" :src="file.thumbnailUrl ?? file.url" :alt="file.name" :class="$style.fileThumb"/>
			<i v-else class="ti ti-file" :class="$style.fileIcon"></i>
			<span :class="$style.fileName">{{ file.name }}</span>
			<i class="ti ti-x" :class="$style.fileClear"></i>
		</button>
	</div>

	<div :class="$style.compose">
		<textarea
			ref="textareaEl"
			v-model="text"
			:class="$style.textarea"
			class="_acrylic"
			:placeholder="i18n.ts.inputMessageHere"
			:disabled="isFormDisabled"
			:readonly="textareaReadOnly"
			@input="onTextareaInput"
			@keydown="onKeydown"
			@keyup="onTextareaCaretMove"
			@click="onTextareaCaretMove"
			@paste="onPaste"
		></textarea>
		<footer :class="$style.footer">
			<div :class="$style.buttons">
				<button
					type="button"
					class="_button"
					:class="$style.button"
					:disabled="isFormDisabled || isEditing"
					:aria-label="i18n.ts.attachFile"
					:title="i18n.ts.attachFile"
					@click="chooseFile"
				>
					<i class="ti ti-photo-plus"></i>
				</button>
				<button
					type="button"
					class="_button"
					:class="$style.button"
					:disabled="isFormDisabled"
					:aria-label="i18n.ts.emoji"
					:title="i18n.ts.emoji"
					@click="insertEmoji"
				>
					<i class="ti ti-mood-happy"></i>
				</button>
				<span
					v-if="textLength > 0"
					:class="[$style.charCount, { [$style.charCountOver]: isOverLimit }]"
				>{{ textLength }} / {{ MAX_MESSAGE_LENGTH }}</span>
				<button
					type="button"
					class="_button"
					:class="[$style.button, $style.send]"
					:disabled="!canSend || sending"
					:aria-label="isEditing ? i18n.ts.save : i18n.ts._chat.send"
					:title="isEditing ? i18n.ts.save : i18n.ts._chat.send"
					@click="send"
				>
					<template v-if="!sending">
						<i :class="isEditing ? 'ti ti-check' : 'ti ti-send'"></i>
					</template>
					<template v-else><MkLoading :em="true"/></template>
				</button>
			</div>
		</footer>
	</div>
</div>
</template>

<script lang="ts">
import * as Misskey from 'misskey-js';

export const MAX_MESSAGE_LENGTH = 2000;

export function extractMentionQuery(text: string, caretPos: number): { start: number; query: string } | null {
	const beforeCaret = text.slice(0, caretPos);
	const lastLine = beforeCaret.split('\n').pop() ?? '';
	const lineStartOffset = beforeCaret.length - lastLine.length;
	const match = /(^|[\s\u3000(（[【「『])@([a-zA-Z0-9_.-]*)$/.exec(lastLine);
	if (!match) return null;
	const atIndexInLine = lastLine.length - match[2].length - 1;
	return {
		start: lineStartOffset + atIndexInLine,
		query: match[2],
	};
}

export function filterRoomMentionCandidates(
	members: readonly Misskey.entities.UserLite[],
	query: string,
	myUserId: string,
): Misskey.entities.UserLite[] {
	const q = query.trim().toLowerCase();
	const seen = new Set<string>();
	const result: Misskey.entities.UserLite[] = [];

	for (const user of members) {
		if (!user || user.id === myUserId || seen.has(user.id)) continue;
		seen.add(user.id);
		if (!q) {
			result.push(user);
			continue;
		}
		const username = user.username.toLowerCase();
		const name = (user.name ?? '').toLowerCase();
		if (username.includes(q) || name.includes(q)) {
			result.push(user);
		}
	}

	return result.slice(0, 12);
}
</script>

<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { toASCII } from 'punycode.js';
import { formatTimeString } from '@/utility/format-time-string.js';
import { selectFile } from '@/utility/drive.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { miLocalStorage } from '@/local-storage.js';
import { misskeyApi, formatApiError } from '@/utility/misskey-api.js';
import { prefer } from '@/preferences.js';
import { Autocomplete } from '@/utility/autocomplete.js';
import { emojiPicker } from '@/utility/emoji-picker.js';
import { checkDragDataType, getDragData } from '@/drag-and-drop.js';
import { ensureSignin } from '@/i.js';
import MkUserName from '@/components/global/MkUserName.vue';

const $i = ensureSignin();

const props = defineProps<{
	user?: Misskey.entities.UserDetailed | null;
	room?: Misskey.entities.ChatRoom | null;
	replyTo?: { id: string; text?: string | null } | null;
	editingMessage?: { id: string; text?: string | null } | null;
	roomMembers?: Misskey.entities.UserLite[];
	isSuspended?: boolean;
}>();

const emit = defineEmits<{
	(e: 'cancelReply'): void;
	(e: 'cancelEdit'): void;
	(e: 'sent'): void;
	(e: 'edited', message: Misskey.entities.ChatMessage): void;
}>();

const textareaEl = shallowRef<HTMLTextAreaElement>();

const text = ref<string>('');
const file = ref<Misskey.entities.DriveFile | null>(null);
const sending = ref(false);
const textareaReadOnly = ref(false);
let autocompleteInstance: Autocomplete | null = null;
let draftBeforeEdit: string | null = null;

// 群内 @mention 自动补全状态
const mentionOpen = ref(false);
const mentionQuery = ref('');
const mentionStartIndex = ref(-1);
const mentionSelectedIndex = ref(0);
const remoteMentionCandidates = ref<Misskey.entities.UserLite[]>([]);
let mentionFetchSeq = 0;
let mentionFetchTimer: number | null = null;

const isEditing = computed(() => props.editingMessage != null);
const isFormDisabled = computed(() => $i.policies.chatAvailability !== 'available' || Boolean(props.room?.isArchived) || Boolean(props.isSuspended));
const textLength = computed(() => text.value.length);
const isOverLimit = computed(() => textLength.value > MAX_MESSAGE_LENGTH);
const canSend = computed(() => {
	if (isFormDisabled.value || isOverLimit.value) return false;
	const hasText = text.value.trim().length > 0;
	if (isEditing.value) return hasText;
	return hasText || file.value != null;
});

const allLocalRoomMembers = computed<Misskey.entities.UserLite[]>(() => {
	if (!props.room) return [];
	const list: Misskey.entities.UserLite[] = [];
	if (props.room.owner) list.push(props.room.owner);
	if (props.roomMembers) list.push(...props.roomMembers);
	return list;
});

const mentionSuggestions = computed<Misskey.entities.UserLite[]>(() => {
	if (!props.room || !mentionOpen.value) return [];
	const local = filterRoomMentionCandidates(allLocalRoomMembers.value, mentionQuery.value, $i.id);
	if (remoteMentionCandidates.value.length === 0) return local;
	const seen = new Set(local.map(u => u.id));
	const merged = [...local];
	for (const u of remoteMentionCandidates.value) {
		if (u.id !== $i.id && !seen.has(u.id)) {
			seen.add(u.id);
			merged.push(u);
		}
	}
	return merged.slice(0, 12);
});

function formatUserAcct(user: Misskey.entities.UserLite): string {
	return user.host == null ? user.username : `${user.username}@${toASCII(user.host)}`;
}

function focus() {
	textareaEl.value?.focus();
}

function insertMention(user: Misskey.entities.UserLite) {
	if (isFormDisabled.value) return;
	const acct = formatUserAcct(user);
	const insertion = `@${acct} `;
	const el = textareaEl.value;
	if (el) {
		const start = el.selectionStart ?? text.value.length;
		const end = el.selectionEnd ?? text.value.length;
		const before = text.value.slice(0, start);
		const after = text.value.slice(end);
		text.value = `${before}${insertion}${after}`;
		void nextTick(() => {
			el.focus();
			const nextPos = start + insertion.length;
			el.setSelectionRange(nextPos, nextPos);
			adjustTextareaHeight();
		});
	} else {
		text.value = text.value ? `${text.value} ${insertion}` : insertion;
	}
}

defineExpose({
	focus,
	insertMention,
});

function adjustTextareaHeight() {
	const el = textareaEl.value;
	if (!el) return;
	if (typeof CSS !== 'undefined' && CSS.supports?.('field-sizing', 'content')) return;
	el.style.height = 'auto';
	const isMobile = typeof window !== 'undefined' && window.innerWidth <= 500;
	const maxH = isMobile ? 76 : 220;
	el.style.height = `${Math.min(el.scrollHeight, maxH)}px`;
}

function closeMentionPopup() {
	mentionOpen.value = false;
	mentionQuery.value = '';
	mentionStartIndex.value = -1;
	mentionSelectedIndex.value = 0;
	remoteMentionCandidates.value = [];
	if (mentionFetchTimer != null) {
		window.clearTimeout(mentionFetchTimer);
		mentionFetchTimer = null;
	}
}

function updateRoomMentionState() {
	if (!props.room || isFormDisabled.value || !textareaEl.value) {
		closeMentionPopup();
		return;
	}
	const caretPos = textareaEl.value.selectionStart ?? 0;
	const extracted = extractMentionQuery(text.value, caretPos);
	if (!extracted) {
		closeMentionPopup();
		return;
	}

	mentionOpen.value = true;
	mentionStartIndex.value = extracted.start;
	mentionQuery.value = extracted.query;
	mentionSelectedIndex.value = 0;

	const localMatches = filterRoomMentionCandidates(allLocalRoomMembers.value, extracted.query, $i.id);
	if (mentionFetchTimer != null) {
		window.clearTimeout(mentionFetchTimer);
		mentionFetchTimer = null;
	}
	if (extracted.query.length > 0 && localMatches.length === 0) {
		const seq = ++mentionFetchSeq;
		const q = extracted.query;
		const roomId = props.room.id;
		mentionFetchTimer = window.setTimeout(async () => {
			try {
				const members = await (misskeyApi as unknown as (ep: string, data: Record<string, unknown>) => Promise<Misskey.entities.ChatRoomMembership[]>)(
					'chat/rooms/members',
					{ roomId, query: q, limit: 10 },
				);
				if (seq !== mentionFetchSeq) return;
				const matchedUsers = members.map(m => m.user).filter((u): u is Misskey.entities.UserLite => u != null);
				if (matchedUsers.length > 0) {
					remoteMentionCandidates.value = matchedUsers;
					return;
				}
				const [username, host] = q.split('@');
				const fallbackUsers = await misskeyApi('users/search-by-username-and-host', {
					username,
					host,
					limit: 8,
					detail: false,
				});
				if (seq !== mentionFetchSeq) return;
				remoteMentionCandidates.value = fallbackUsers;
			} catch {
				// 自动补全回退失败静默忽略
			}
		}, 180);
	} else {
		remoteMentionCandidates.value = [];
	}
}

function selectMentionCandidate(user: Misskey.entities.UserLite) {
	if (mentionStartIndex.value < 0 || !textareaEl.value) {
		closeMentionPopup();
		return;
	}
	const caretPos = textareaEl.value.selectionStart ?? text.value.length;
	const before = text.value.slice(0, mentionStartIndex.value);
	const after = text.value.slice(caretPos);
	const acct = formatUserAcct(user);
	const inserted = `@${acct} `;
	text.value = `${before}${inserted}${after}`;
	closeMentionPopup();
	void nextTick(() => {
		const el = textareaEl.value;
		if (!el) return;
		el.focus();
		const nextPos = before.length + inserted.length;
		el.setSelectionRange(nextPos, nextPos);
		adjustTextareaHeight();
	});
}

function onTextareaInput() {
	adjustTextareaHeight();
	updateRoomMentionState();
}

function onTextareaCaretMove() {
	updateRoomMentionState();
}

function cancelReply() {
	emit('cancelReply');
}

function cancelEdit() {
	emit('cancelEdit');
}

function getDraftKey() {
	return props.user ? 'user:' + props.user.id : 'room:' + props.room?.id;
}

function readDrafts(): Record<string, { updatedAt: string; data: { text: string; file: Misskey.entities.DriveFile | null } }> {
	try {
		const raw = miLocalStorage.getItem('chatMessageDrafts');
		if (!raw) return {};
		const parsed = JSON.parse(raw);
		return parsed != null && typeof parsed === 'object' ? parsed : {};
	} catch {
		return {};
	}
}

function writeDrafts(drafts: Record<string, unknown>) {
	try {
		miLocalStorage.setItem('chatMessageDrafts', JSON.stringify(drafts));
	} catch {
		// localStorage 写入受限时静默忽略
	}
}

function restoreDraft() {
	const draft = readDrafts()[getDraftKey()];
	if (draft?.data) {
		text.value = typeof draft.data.text === 'string' ? draft.data.text : '';
		file.value = draft.data.file ?? null;
	} else {
		text.value = '';
		file.value = null;
	}
	void nextTick(() => adjustTextareaHeight());
}

watch([text, file], () => {
	if (!isEditing.value) {
		saveDraft();
	}
	void nextTick(() => adjustTextareaHeight());
});

watch(() => props.editingMessage, (nextEdit, prevEdit) => {
	if (nextEdit != null) {
		if (prevEdit == null) {
			draftBeforeEdit = text.value;
		}
		text.value = nextEdit.text ?? '';
		closeMentionPopup();
		void nextTick(() => {
			textareaEl.value?.focus();
			adjustTextareaHeight();
		});
	} else if (prevEdit != null) {
		if (draftBeforeEdit != null) {
			text.value = draftBeforeEdit;
			draftBeforeEdit = null;
		} else {
			restoreDraft();
		}
		void nextTick(() => adjustTextareaHeight());
	}
});

watch(() => [props.user?.id, props.room?.id], () => {
	closeMentionPopup();
	setupAutocomplete();
	if (!isEditing.value) {
		restoreDraft();
	}
});

async function onPaste(ev: ClipboardEvent) {
	if (isFormDisabled.value || isEditing.value) return;
	if (!ev.clipboardData) return;

	const pastedFileName = 'yyyy-MM-dd HH-mm-ss [{{number}}]';
	const items = ev.clipboardData.items;
	if (items.length === 0) return;

	if (items.length === 1) {
		if (items[0].kind === 'file') {
			const pastedFile = items[0].getAsFile();
			if (!pastedFile) return;
			const lio = pastedFile.name.lastIndexOf('.');
			const ext = lio >= 0 ? pastedFile.name.slice(lio) : '';
			const formattedName = formatTimeString(new Date(pastedFile.lastModified), pastedFileName).replace(/{{number}}/g, '1') + ext;
			const renamedFile = new File([pastedFile], formattedName, { type: pastedFile.type });
			os.launchUploader([renamedFile], { multiple: false }).then(driveFiles => {
				if (driveFiles[0]) {
					file.value = driveFiles[0];
				}
			}).catch(() => {});
		}
	} else if (Array.from(items).some(i => i.kind === 'file')) {
		os.alert({
			type: 'error',
			text: i18n.ts.onlyOneFileCanBeAttached,
		});
	}
}

function onDragover(ev: DragEvent) {
	if (isFormDisabled.value || isEditing.value) return;
	if (!ev.dataTransfer) return;

	const isFile = ev.dataTransfer.items.length > 0 && ev.dataTransfer.items[0].kind === 'file';
	if (isFile || checkDragDataType(ev, ['driveFiles'])) {
		ev.preventDefault();
		switch (ev.dataTransfer.effectAllowed) {
			case 'all':
			case 'uninitialized':
			case 'copy':
			case 'copyLink':
			case 'copyMove':
				ev.dataTransfer.dropEffect = 'copy';
				break;
			case 'linkMove':
			case 'move':
				ev.dataTransfer.dropEffect = 'move';
				break;
			default:
				ev.dataTransfer.dropEffect = 'none';
				break;
		}
	}
}

function onDrop(ev: DragEvent): void {
	if (isFormDisabled.value || isEditing.value) return;
	if (!ev.dataTransfer) return;

	// ファイルだったら
	if (ev.dataTransfer.files.length === 1) {
		ev.preventDefault();
		os.launchUploader([Array.from(ev.dataTransfer.files)[0]], { multiple: false }).then(driveFiles => {
			if (driveFiles[0]) {
				file.value = driveFiles[0];
			}
		}).catch(() => {});
		return;
	} else if (ev.dataTransfer.files.length > 1) {
		ev.preventDefault();
		os.alert({
			type: 'error',
			text: i18n.ts.onlyOneFileCanBeAttached,
		});
		return;
	}

	//#region ドライブのファイル
	{
		const droppedData = getDragData(ev, 'driveFiles');
		if (droppedData != null && droppedData.length > 0) {
			file.value = droppedData[0];
			ev.preventDefault();
		}
	}
	//#endregion
}

function onKeydown(ev: KeyboardEvent) {
	if (ev.isComposing || ev.key === 'Process' || ev.keyCode === 229) return;

	if (mentionOpen.value && mentionSuggestions.value.length > 0) {
		if (ev.key === 'ArrowDown') {
			ev.preventDefault();
			mentionSelectedIndex.value = (mentionSelectedIndex.value + 1) % mentionSuggestions.value.length;
			return;
		}
		if (ev.key === 'ArrowUp') {
			ev.preventDefault();
			mentionSelectedIndex.value = (mentionSelectedIndex.value - 1 + mentionSuggestions.value.length) % mentionSuggestions.value.length;
			return;
		}
		if (ev.key === 'Enter' || ev.key === 'Tab') {
			ev.preventDefault();
			selectMentionCandidate(mentionSuggestions.value[mentionSelectedIndex.value]);
			return;
		}
		if (ev.key === 'Escape') {
			ev.preventDefault();
			closeMentionPopup();
			return;
		}
	}

	if (ev.key === 'Enter') {
		if (prefer.s['chat.sendOnEnter']) {
			if (!(ev.ctrlKey || ev.metaKey || ev.shiftKey)) {
				ev.preventDefault();
				void send();
			}
		} else if (ev.ctrlKey || ev.metaKey) {
			ev.preventDefault();
			void send();
		}
	}
}

function chooseFile(ev: PointerEvent) {
	if (isFormDisabled.value || isEditing.value) return;
	selectFile({
		anchorElement: ev.currentTarget ?? ev.target,
		multiple: false,
		label: i18n.ts.selectFile,
	}).then(selectedFile => {
		if (selectedFile) {
			file.value = selectedFile;
		}
	}).catch(() => {});
}

async function send() {
	if (!canSend.value || sending.value || isFormDisabled.value) return;

	sending.value = true;
	closeMentionPopup();

	try {
		if (isEditing.value && props.editingMessage) {
			const edited = await (misskeyApi as unknown as (ep: string, data: Record<string, unknown>) => Promise<Misskey.entities.ChatMessage>)(
				'chat/messages/edit',
				{
					messageId: props.editingMessage.id,
					text: text.value.trim(),
				},
			);
			draftBeforeEdit = null;
			text.value = '';
			emit('edited', edited);
			return;
		}

		if (props.user) {
			try {
				await misskeyApi('chat/messages/create-to-user', {
					toUserId: props.user.id,
					text: text.value.trim() ? text.value : undefined,
					fileId: file.value ? file.value.id : undefined,
					replyId: props.replyTo?.id,
				});
				clear();
				emit('sent');
			} catch (err: any) {
				console.error(err);

				const chatScopeErrorMessages: Record<string, string> = {
					RECIPIENT_CHAT_SCOPE_NONE: i18n.ts._chat.thisUserNotAllowedChatAnyone,
					RECIPIENT_CHAT_SCOPE_FOLLOWERS: i18n.ts._chat.thisUserAllowsChatOnlyFromFollowers,
					RECIPIENT_CHAT_SCOPE_FOLLOWING: i18n.ts._chat.thisUserAllowsChatOnlyFromFollowing,
					RECIPIENT_CHAT_SCOPE_MUTUAL: i18n.ts._chat.thisUserAllowsChatOnlyFromMutualFollowing,
					RECIPIENT_CHAT_UNAVAILABLE: i18n.ts._chat.chatNotAvailableInOtherAccount,
					YOU_HAVE_BEEN_BLOCKED: i18n.ts._chat.youHaveBeenBlockedByThisUser,
				};

				const message = chatScopeErrorMessages[err?.code];
				await os.alert({ type: 'error', text: message ?? formatApiError(err) });
			}
		} else if (props.room) {
			try {
				await misskeyApi('chat/messages/create-to-room', {
					toRoomId: props.room.id,
					text: text.value.trim() ? text.value : undefined,
					fileId: file.value ? file.value.id : undefined,
					replyId: props.replyTo?.id,
				});
				clear();
				emit('sent');
			} catch (err: any) {
				console.error(err);

				if (err?.code === 'ROOM_SUSPENDED') {
					const remainingMs = err.info?.remainingMs as number | null | undefined;
					const isPermanent = err.info?.isPermanent as boolean | undefined;

					let message: string;
					if (isPermanent || typeof remainingMs !== 'number' || remainingMs <= 0) {
						message = i18n.ts._chat.suspendedBannerPermanent;
					} else {
						const untilText = new Date(Date.now() + remainingMs).toLocaleString();
						message = i18n.tsx._chat.suspendedBanner({ until: untilText });
					}

					await os.alert({ type: 'error', text: message });
				} else {
					await os.alert({ type: 'error', text: formatApiError(err) });
				}
			}
		}
	} catch (err) {
		console.error(err);
		await os.alert({ type: 'error', text: formatApiError(err) });
	} finally {
		sending.value = false;
	}
}

function clear() {
	text.value = '';
	file.value = null;
	deleteDraft();
}

function saveDraft() {
	if (text.value === '' && file.value == null) {
		deleteDraft();
		return;
	}
	const drafts = readDrafts();
	drafts[getDraftKey()] = {
		updatedAt: new Date().toISOString(),
		data: {
			text: text.value,
			file: file.value,
		},
	};
	writeDrafts(drafts);
}

function deleteDraft() {
	const drafts = readDrafts();
	if (!(getDraftKey() in drafts)) return;
	delete drafts[getDraftKey()];
	writeDrafts(drafts);
}

async function insertEmoji(ev: MouseEvent) {
	if (isFormDisabled.value) return;
	textareaReadOnly.value = true;
	const target = ev.currentTarget ?? ev.target;
	if (target == null) {
		textareaReadOnly.value = false;
		return;
	}

	let pos = textareaEl.value?.selectionStart ?? 0;
	let posEnd = textareaEl.value?.selectionEnd ?? text.value.length;
	emojiPicker.show(
		target as HTMLElement,
		emoji => {
			const textBefore = text.value.substring(0, pos);
			const textAfter = text.value.substring(posEnd);
			text.value = textBefore + emoji + textAfter;
			pos += emoji.length;
			posEnd += emoji.length;
		},
		() => {
			textareaReadOnly.value = false;
			nextTick(() => textareaEl.value?.focus());
		},
	);
}

function setupAutocomplete() {
	if (autocompleteInstance) {
		autocompleteInstance.detach();
		autocompleteInstance = null;
	}
	if (textareaEl.value != null) {
		// 群聊中禁用全局 user 自动补全，改用当前群成员 @mention 自动补全
		const types = props.room != null
			? (['hashtag', 'emoji', 'mfmTag', 'mfmParam'] as const)
			: undefined;
		autocompleteInstance = new Autocomplete(textareaEl.value, text, types ? [...types] : undefined);
	}
}

onMounted(() => {
	setupAutocomplete();
	if (!isEditing.value) {
		restoreDraft();
	}
});

onBeforeUnmount(() => {
	closeMentionPopup();
	if (autocompleteInstance) {
		autocompleteInstance.detach();
		autocompleteInstance = null;
	}
});
</script>

<style lang="scss" module>
.root {
	position: relative;
	border-bottom: none;
	border-radius: 14px 14px 0 0;
	overflow: visible;
	box-sizing: border-box;
	min-width: 0;
	max-width: 100%;
}

.mentionPopup {
	position: absolute;
	bottom: calc(100% + 6px);
	left: 0;
	right: 0;
	max-height: 220px;
	overflow-y: auto;
	z-index: 20;
	padding: 4px 0;
}

.mentionItem {
	display: flex;
	align-items: center;
	gap: 8px;
	width: 100%;
	padding: 8px 12px;
	text-align: left;
	font-size: 0.9em;

	&:hover,
	&.mentionItemSelected {
		background: var(--MI_THEME-accentedBg);
		color: var(--MI_THEME-accent);
	}
}

.mentionAvatar {
	width: 24px;
	height: 24px;
	flex-shrink: 0;
}

.mentionName {
	font-weight: bold;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.mentionAcct {
	margin-left: auto;
	font-size: 0.85em;
	color: var(--MI_THEME-fgTransparentWeak);
	white-space: nowrap;
}

.compose {
	display: flex;
	flex-direction: column;
	width: 100%;
	min-width: 0;
	border-radius: 14px 14px 0 0;
	overflow: clip;
}

.textarea {
	cursor: auto;
	display: block;
	width: 100%;
	min-width: 100%;
	max-width: 100%;
	min-height: 80px;
	margin: 0;
	padding: 16px 16px 0 16px;
	resize: none;
	font-size: 1em;
	font-family: inherit;
	outline: none;
	border: none;
	border-radius: 0;
	box-shadow: none;
	box-sizing: border-box;
	color: var(--MI_THEME-fg);
	field-sizing: content;

	&:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
}

.footer {
	position: sticky;
	bottom: 0;
	background: var(--MI_THEME-panel);
}

.fileWrap {
	padding: 8px 12px;
	background: var(--MI_THEME-panel);
	border-bottom: 1px solid var(--MI_THEME-divider);
}

.fileChip {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	max-width: 100%;
	padding: 4px 10px 4px 6px;
	border-radius: 999px;
	background: var(--MI_THEME-bg);
	border: 1px solid var(--MI_THEME-divider);
	font-size: 0.85em;
}

.fileThumb {
	width: 24px;
	height: 24px;
	border-radius: 50%;
	object-fit: cover;
	flex-shrink: 0;
}

.fileIcon {
	font-size: 16px;
	flex-shrink: 0;
}

.fileName {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	max-width: 220px;
}

.fileClear {
	opacity: 0.65;
	flex-shrink: 0;
}

.buttons {
	display: flex;
	align-items: center;
}

.button {
	height: 50px;
	aspect-ratio: 1;
	flex-shrink: 0;

	&:hover:not(:disabled) {
		color: var(--MI_THEME-accent);
	}

	&:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
}

.charCount {
	margin-left: auto;
	margin-right: 4px;
	font-size: 0.8em;
	color: var(--MI_THEME-fgTransparentWeak);
	font-variant-numeric: tabular-nums;

	&.charCountOver {
		color: var(--MI_THEME-error);
		font-weight: bold;
	}
}

.send {
	margin-left: auto;
	color: var(--MI_THEME-accent);
}

.charCount + .send {
	margin-left: 0;
}

@media (max-width: 500px) {
	.root {
		border-radius: 10px 10px 0 0;
	}

	.compose {
		flex-direction: row;
		align-items: flex-end;
		gap: 8px;
		box-sizing: border-box;
		width: 100%;
		min-width: 0;
		max-width: 100%;
		border-radius: 10px 10px 0 0;
		padding: 8px max(12px, env(safe-area-inset-right, 0px)) max(8px, env(safe-area-inset-bottom, 0px)) max(12px, env(safe-area-inset-left, 0px));
		background: var(--MI_THEME-panel);
	}

	/* 覆盖全局 _acrylic，避免底栏里出现半透明模糊块；16px 防止 iOS 自动放大 */
	.textarea:global(._acrylic) {
		min-height: 36px;
		max-height: 76px;
		min-width: 0;
		flex: 1 1 0;
		width: 0;
		max-width: 100%;
		font-size: 16px;
		padding: 7px 12px;
		border-radius: 18px;
		border: none;
		overflow-y: auto;
		overflow-wrap: anywhere;
		word-break: break-word;
		line-height: 1.4;
		align-self: flex-end;
		background: color-mix(in srgb, var(--MI_THEME-fg) 6%, var(--MI_THEME-panel));
		box-shadow: inset 0 0 0 0.5px color-mix(in srgb, var(--MI_THEME-divider) 70%, transparent);
		-webkit-backdrop-filter: none;
		backdrop-filter: none;
	}

	.footer {
		position: static;
		background: transparent;
		flex-shrink: 0;
		min-width: 0;
		padding-bottom: 1px;
	}

	.buttons {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 2px;
	}

	.button {
		height: 36px;
		width: 36px;
		min-width: 36px;
		aspect-ratio: 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 10px;
		color: color-mix(in srgb, var(--MI_THEME-fg) 72%, transparent);

		&:hover:not(:disabled),
		&:focus-visible:not(:disabled) {
			color: var(--MI_THEME-accent);
			background: color-mix(in srgb, var(--MI_THEME-fg) 6%, transparent);
		}
	}

	.charCount {
		font-size: 0.72em;
	}

	.send {
		margin-left: 0;
		color: color-mix(in srgb, var(--MI_THEME-fg) 72%, transparent);

		&:not(:disabled) {
			color: var(--MI_THEME-accent);
		}

		&:disabled {
			opacity: 0.38;
			color: color-mix(in srgb, var(--MI_THEME-fg) 50%, transparent);
		}
	}

	.fileWrap {
		padding: 6px 12px;
	}
}

.replyPreview {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 8px 12px;
	background: var(--MI_THEME-bg);
	border-bottom: 1px solid var(--MI_THEME-divider);
}

.replyBar {
	width: 3px;
	height: 24px;
	background: var(--MI_THEME-accent);
	border-radius: 2px;
	flex-shrink: 0;
}

.replyInfo {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.replyLabel {
	font-size: 0.8em;
	color: var(--MI_THEME-accent);
	font-weight: bold;
	display: inline-flex;
	align-items: center;
	gap: 4px;
}

.replyText {
	font-size: 0.85em;
	color: var(--MI_THEME-fg);
	opacity: 0.8;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.replyCancelBtn {
	padding: 4px;
	color: var(--MI_THEME-fg);
	opacity: 0.6;

	&:hover {
		opacity: 1;
	}
}
</style>
