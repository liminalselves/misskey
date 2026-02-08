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
	<!-- 引用预览条 -->
	<div v-if="replyTo" :class="$style.replyPreview">
		<div :class="$style.replyBar"></div>
		<div :class="$style.replyInfo">
			<span :class="$style.replyLabel">回复</span>
			<span :class="$style.replyText">{{ replyTo.text || '[附件]' }}</span>
		</div>
		<button class="_button" :class="$style.replyCancelBtn" @click="cancelReply"><i class="ti ti-x"></i></button>
	</div>
	<textarea
		ref="textareaEl"
		v-model="text"
		:class="$style.textarea"
		class="_acrylic"
		:placeholder="i18n.ts.inputMessageHere"
		:readonly="textareaReadOnly"
		@keydown="onKeydown"
		@paste="onPaste"
	></textarea>
	<footer :class="$style.footer">
		<div v-if="file" :class="$style.file" @click="file = null">{{ file.name }}</div>
		<div :class="$style.buttons">
			<button class="_button" :class="$style.button" @click="chooseFile"><i class="ti ti-photo-plus"></i></button>
			<button class="_button" :class="$style.button" @click="insertEmoji"><i class="ti ti-mood-happy"></i></button>
			<button class="_button" :class="[$style.button, $style.send]" :disabled="!canSend || sending" :title="i18n.ts.send" @click="send">
				<template v-if="!sending"><i class="ti ti-send"></i></template><template v-if="sending"><MkLoading :em="true"/></template>
			</button>
		</div>
	</footer>
	<input ref="fileEl" style="display: none;" type="file" @change="onChangeFile"/>
</div>
</template>

<script lang="ts" setup>
import { onMounted, watch, ref, shallowRef, computed, nextTick, readonly, onBeforeUnmount } from 'vue';
import * as Misskey from 'misskey-js';
//import insertTextAtCursor from 'insert-text-at-cursor';
import { formatTimeString } from '@/utility/format-time-string.js';
import { selectFile } from '@/utility/drive.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { miLocalStorage } from '@/local-storage.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { prefer } from '@/preferences.js';
import { Autocomplete } from '@/utility/autocomplete.js';
import { emojiPicker } from '@/utility/emoji-picker.js';
import { checkDragDataType, getDragData } from '@/drag-and-drop.js';

const props = defineProps<{
	user?: Misskey.entities.UserDetailed | null;
	room?: Misskey.entities.ChatRoom | null;
	replyTo?: { id: string; text?: string | null } | null;
}>();

const emit = defineEmits<{
	(e: 'cancelReply'): void;
	(e: 'sent'): void;
}>();

const textareaEl = shallowRef<HTMLTextAreaElement>();
const fileEl = shallowRef<HTMLInputElement>();

const text = ref<string>('');
const file = ref<Misskey.entities.DriveFile | null>(null);
const sending = ref(false);
const textareaReadOnly = ref(false);
let autocompleteInstance: Autocomplete | null = null;

const canSend = computed(() => (text.value != null && text.value !== '') || file.value != null);

function cancelReply() {
	emit('cancelReply');
}

function getDraftKey() {
	return props.user ? 'user:' + props.user.id : 'room:' + props.room?.id;
}

watch([text, file], saveDraft);

async function onPaste(ev: ClipboardEvent) {
	if (!ev.clipboardData) return;

	const pastedFileName = 'yyyy-MM-dd HH-mm-ss [{{number}}]';

	const clipboardData = ev.clipboardData;
	const items = clipboardData.items;

	if (items.length === 1) {
		if (items[0].kind === 'file') {
			const pastedFile = items[0].getAsFile();
			if (!pastedFile) return;
			const lio = pastedFile.name.lastIndexOf('.');
			const ext = lio >= 0 ? pastedFile.name.slice(lio) : '';
			const formattedName = formatTimeString(new Date(pastedFile.lastModified), pastedFileName).replace(/{{number}}/g, '1') + ext;
			const renamedFile = new File([pastedFile], formattedName, { type: pastedFile.type });
			os.launchUploader([renamedFile], { multiple: false }).then(driveFiles => {
				file.value = driveFiles[0];
			});
		}
	} else {
		if (items[0].kind === 'file') {
			os.alert({
				type: 'error',
				text: i18n.ts.onlyOneFileCanBeAttached,
			});
		}
	}
}

function onDragover(ev: DragEvent) {
	if (!ev.dataTransfer) return;

	const isFile = ev.dataTransfer.items[0].kind === 'file';
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
	if (!ev.dataTransfer) return;

	// ファイルだったら
	if (ev.dataTransfer.files.length === 1) {
		ev.preventDefault();
		os.launchUploader([Array.from(ev.dataTransfer.files)[0]], { multiple: false });
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
		if (droppedData != null) {
			file.value = droppedData[0];
			ev.preventDefault();
		}
	}
	//#endregion
}

function onKeydown(ev: KeyboardEvent) {
	if (ev.key === 'Enter') {
		if (prefer.s['chat.sendOnEnter']) {
			if (!(ev.ctrlKey || ev.metaKey || ev.shiftKey)) {
				send();
			}
		} else {
			if ((ev.ctrlKey || ev.metaKey)) {
				send();
			}
		}
	}
}

function chooseFile(ev: PointerEvent) {
	selectFile({
		anchorElement: ev.currentTarget ?? ev.target,
		multiple: false,
		label: i18n.ts.selectFile,
	}).then(selectedFile => {
		file.value = selectedFile;
	});
}

function onChangeFile() {
	if (fileEl.value == null || fileEl.value.files == null) return;

	if (fileEl.value.files[0]) {
		os.launchUploader(Array.from(fileEl.value.files), { multiple: false }).then(driveFiles => {
			file.value = driveFiles[0];
		});
	}
}

function send() {
	if (!canSend.value) return;

	sending.value = true;

	if (props.user) {
		misskeyApi('chat/messages/create-to-user', {
			toUserId: props.user.id,
			text: text.value ? text.value : undefined,
			fileId: file.value ? file.value.id : undefined,
			replyId: props.replyTo?.id,
		}).then(message => {
			clear();
			emit('sent');
		}).catch(err => {
			console.error(err);
		}).then(() => {
			sending.value = false;
		});
	} else if (props.room) {
		misskeyApi('chat/messages/create-to-room', {
			toRoomId: props.room.id,
			text: text.value ? text.value : undefined,
			fileId: file.value ? file.value.id : undefined,
			replyId: props.replyTo?.id,
		}).then(message => {
			clear();
			emit('sent');
		}).catch(err => {
			console.error(err);

			if (err?.code === 'ROOM_SUSPENDED') {
				const remainingMs = err.info?.remainingMs as number | null | undefined;
				const isPermanent = err.info?.isPermanent as boolean | undefined;

				let message = '你已被该群聊禁言。';
				if (isPermanent) {
					message += ' 禁言为永久。';
				} else if (typeof remainingMs === 'number' && remainingMs > 0) {
					const totalSeconds = Math.floor(remainingMs / 1000);
					const d = Math.floor(totalSeconds / 86400);
					const h = Math.floor((totalSeconds % 86400) / 3600);
					const m = Math.floor((totalSeconds % 3600) / 60);
					const s = totalSeconds % 60;

					let parts: string[] = [];
					if (d > 0) parts.push(`${d}天`);
					if (h > 0) parts.push(`${h}小时`);
					if (m > 0) parts.push(`${m}分钟`);
					if (s > 0 && parts.length === 0) parts.push(`${s}秒`);

					if (parts.length > 0) {
						message += ` 剩余时间：${parts.join(' ')}。`;
					}
				}

				os.alert({
					type: 'error',
					text: message,
				});
			}
		}).then(() => {
			sending.value = false;
		});
	}
}

function clear() {
	text.value = '';
	file.value = null;
	deleteDraft();
}

function saveDraft() {
	const drafts = JSON.parse(miLocalStorage.getItem('chatMessageDrafts') || '{}');

	drafts[getDraftKey()] = {
		updatedAt: new Date(),
		data: {
			text: text.value,
			file: file.value,
		},
	};

	miLocalStorage.setItem('chatMessageDrafts', JSON.stringify(drafts));
}

function deleteDraft() {
	const drafts = JSON.parse(miLocalStorage.getItem('chatMessageDrafts') || '{}');

	delete drafts[getDraftKey()];

	miLocalStorage.setItem('chatMessageDrafts', JSON.stringify(drafts));
}

async function insertEmoji(ev: MouseEvent) {
	textareaReadOnly.value = true;
	const target = ev.currentTarget ?? ev.target;
	if (target == null) return;

	// emojiPickerはダイアログが閉じずにtextareaとやりとりするので、
	// focustrapをかけているとinsertTextAtCursorが効かない
	// そのため、投稿フォームのテキストに直接注入する
	// See: https://github.com/misskey-dev/misskey/pull/14282
	//      https://github.com/misskey-dev/misskey/issues/14274

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
			nextTick(() => focus());
		},
	);
}

onMounted(() => {
	if (textareaEl.value != null) {
		autocompleteInstance = new Autocomplete(textareaEl.value, text);
	}

	// 書きかけの投稿を復元
	const draft = JSON.parse(miLocalStorage.getItem('chatMessageDrafts') || '{}')[getDraftKey()];
	if (draft) {
		text.value = draft.data.text;
		file.value = draft.data.file;
	}
});

onBeforeUnmount(() => {
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
}

.footer {
	position: sticky;
	bottom: 0;
	background: var(--MI_THEME-panel);
}

.file {
	padding: 8px;
	cursor: pointer;
}

.buttons {
	display: flex;
}

.button {
	height: 50px;
	aspect-ratio: 1;

	&:hover {
		color: var(--MI_THEME-accent);
	}
}
.send {
	margin-left: auto;
	color: var(--MI_THEME-accent);
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
