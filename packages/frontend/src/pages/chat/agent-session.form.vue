<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div
	:class="$style.root"
>
	<!-- 编辑提示栏：复用输入框，但外观与功能切到「保存修改」 -->
	<div v-if="editing" :class="$style.editHint">
		<i :class="$style.editHintIcon" class="ti ti-pencil"></i>
		<div :class="$style.editHintMain">
			<span :class="$style.editHintLabel">{{ i18n.ts._agents.editingMessageHint }}</span>
			<span v-if="editing.preview" :class="$style.editHintPreview">{{ editing.preview }}</span>
		</div>
		<button
			class="_button"
			:class="$style.editHintCancel"
			type="button"
			:title="i18n.ts._agents.editingCancel"
			:aria-label="i18n.ts._agents.editingCancel"
			@click="onCancelEdit"
		>
			<i class="ti ti-x"></i>
		</button>
	</div>
	<div :class="$style.compose">
		<div v-if="file && !editing" :class="$style.filePreview">
			<img :src="file.thumbnailUrl ?? file.url" :class="$style.filePreviewImage" alt=""/>
			<span :class="$style.filePreviewName">{{ file.name }}</span>
			<button class="_button" :class="$style.fileRemove" type="button" :title="i18n.ts.remove" @click="file = null"><i class="ti ti-x"></i></button>
		</div>
		<textarea
			ref="textareaEl"
			v-model="text"
			:class="$style.textarea"
			class="_acrylic"
			:placeholder="i18n.ts.inputMessageHere"
			:readonly="textareaReadOnly || disabled"
			@keydown="onKeydown"
		></textarea>
		<footer :class="$style.footer">
			<div :class="$style.buttons">
				<button v-if="!editing" class="_button" :class="$style.button" type="button" :disabled="disabled || sending || !attachmentEnabled" :title="i18n.ts.selectFile" @click="chooseFile"><i class="ti ti-photo-plus"></i></button>
				<button class="_button" :class="$style.button" type="button" @click="insertEmoji"><i class="ti ti-mood-happy"></i></button>
				<button
					v-if="sending"
					class="_button"
					:class="[$style.button, $style.abort]"
					type="button"
					:title="i18n.ts._agents.abortRequestTooltip"
					:aria-label="i18n.ts._agents.abortRequestTooltip"
					@click="onAbortClick"
				>
					<i class="ti ti-x"></i>
				</button>
				<button
					v-else
					class="_button"
					:class="[$style.button, $style.send]"
					type="button"
					:disabled="sendDisabled"
					:title="submitTitle"
					@click="submit"
				>
					<i class="ti ti-send"></i>
				</button>
			</div>
		</footer>
	</div>
</div>
</template>

<script lang="ts" setup>
import { onMounted, ref, shallowRef, computed, nextTick, onBeforeUnmount, watch } from 'vue';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';
import { Autocomplete } from '@/utility/autocomplete.js';
import { emojiPicker } from '@/utility/emoji-picker.js';
import type { DriveFile } from 'misskey-js/entities.js';
import { selectFile } from '@/utility/drive.js';
import * as os from '@/os.js';

const props = defineProps<{
	disabled?: boolean;
	sending?: boolean;
	attachmentEnabled?: boolean;
	editing?: { id: string; preview: string } | null;
}>();

const emit = defineEmits<{
	(e: 'submit', payload: { text: string; file: DriveFile | null }): void;
	(e: 'cancelEdit'): void;
	(e: 'abort'): void;
}>();

const textareaEl = shallowRef<HTMLTextAreaElement>();
const text = ref('');
const file = ref<DriveFile | null>(null);
const textareaReadOnly = ref(false);
let autocompleteInstance: Autocomplete | null = null;

const sendDisabled = computed(() => props.disabled || props.sending || (text.value.trim().length === 0 && file.value == null));

const submitTitle = computed(() => props.editing ? i18n.ts.save : i18n.ts.send);

function onKeydown(ev: KeyboardEvent) {
	if (ev.key === 'Enter') {
		if (prefer.s['chat.sendOnEnter']) {
			if (!(ev.ctrlKey || ev.metaKey || ev.shiftKey)) {
				ev.preventDefault();
				submit();
			}
		} else {
			if ((ev.ctrlKey || ev.metaKey)) {
				ev.preventDefault();
				submit();
			}
		}
	} else if (ev.key === 'Escape' && props.editing) {
		ev.preventDefault();
		onCancelEdit();
	}
}

function submit() {
	const t = text.value.trim();
	if ((!t && file.value == null) || props.sending || props.disabled) return;
	emit('submit', { text: t, file: file.value });
	if (!props.editing) {
		text.value = '';
		file.value = null;
	}
}

async function chooseFile(ev: PointerEvent) {
	const selected = await selectFile({ anchorElement: ev.currentTarget ?? ev.target, multiple: false, label: i18n.ts.selectFile });
	if (!selected.type.startsWith('image/')) {
		await os.alert({ type: 'error', text: i18n.ts._agents.imageMessageImagesOnly });
		return;
	}
	file.value = selected;
}

function onCancelEdit() {
	emit('cancelEdit');
}

function onAbortClick() {
	emit('abort');
}

function restoreDraft(t: string) {
	text.value = t;
}

function setText(t: string) {
	text.value = t;
}

function clearText() {
	text.value = '';
}

defineExpose({
	focus: () => textareaEl.value?.focus(),
	restoreDraft,
	setText,
	setAttachment: (next: DriveFile | null) => { file.value = next; },
	clearText,
	clearAttachment: () => { file.value = null; },
});

watch(() => props.editing?.id ?? null, async (id) => {
	if (id != null) {
		await nextTick();
		const el = textareaEl.value;
		if (el) {
			el.focus();
			const len = text.value.length;
			try { el.setSelectionRange(len, len); } catch { /* ignore */ }
		}
	}
});

async function insertEmoji(ev: MouseEvent) {
	textareaReadOnly.value = true;
	const target = ev.currentTarget ?? ev.target;
	if (target == null) return;

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

onMounted(() => {
	if (textareaEl.value != null) {
		autocompleteInstance = new Autocomplete(textareaEl.value, text);
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
	box-sizing: border-box;
	min-width: 0;
	max-width: 100%;
}

.compose {
	display: flex;
	flex-direction: column;
	width: 100%;
	min-width: 0;
}

.filePreview {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 8px 12px;
	border-bottom: 1px solid var(--MI_THEME-divider);
	background: var(--MI_THEME-panel);
}

.filePreviewImage {
	width: 42px;
	height: 42px;
	object-fit: cover;
	border-radius: 6px;
}

.filePreviewName {
	min-width: 0;
	flex: 1;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.fileRemove {
	width: 32px;
	height: 32px;
	border-radius: 6px;
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

.buttons {
	display: flex;
	align-items: center;
}

.button {
	height: 50px;
	aspect-ratio: 1;
	flex-shrink: 0;

	&:hover {
		color: var(--MI_THEME-accent);
	}
}
.send {
	margin-left: auto;
	color: var(--MI_THEME-accent);
}

.abort {
	margin-left: auto;
	color: var(--MI_THEME-error);

	&:hover,
	&:focus-visible {
		background: color-mix(in srgb, var(--MI_THEME-error) 14%, transparent);
		color: var(--MI_THEME-error);
	}
}

.editHint {
	display: flex;
	align-items: center;
	gap: 0.55em;
	padding: 0.5em 0.75em;
	background: color-mix(in srgb, var(--MI_THEME-accent) 14%, var(--MI_THEME-panel));
	border-bottom: solid 1px color-mix(in srgb, var(--MI_THEME-accent) 28%, var(--MI_THEME-divider));
	color: var(--MI_THEME-fg);
	font-size: 0.88em;
	min-width: 0;
}

.editHintIcon {
	flex-shrink: 0;
	color: var(--MI_THEME-accent);
}

.editHintMain {
	flex: 1 1 auto;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 0.15em;
	overflow: hidden;
}

.editHintLabel {
	font-weight: 600;
	color: var(--MI_THEME-accent);
}

.editHintPreview {
	font-size: 0.92em;
	opacity: 0.72;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.editHintCancel {
	flex-shrink: 0;
	width: 28px;
	height: 28px;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	border-radius: 999px;
	color: color-mix(in srgb, var(--MI_THEME-fg) 78%, transparent);

	&:hover,
	&:focus-visible {
		background: color-mix(in srgb, var(--MI_THEME-fg) 8%, transparent);
		color: var(--MI_THEME-fg);
	}
}

@media (max-width: 500px) {
	.root {
		border-radius: 10px 10px 0 0;
		/* 避免横向 flex 略超宽时把右侧发送按钮裁掉 */
		overflow-x: hidden;
		overflow-y: visible;
	}

	.compose {
		flex-direction: row;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 8px;
		box-sizing: border-box;
		width: 100%;
		min-width: 0;
		max-width: 100%;
		padding: 8px max(12px, env(safe-area-inset-right, 0px)) max(8px, env(safe-area-inset-bottom, 0px)) max(12px, env(safe-area-inset-left, 0px));
		background: var(--MI_THEME-panel);
	}

	/* 附件预览独占一整行，避免长文件名把输入框/发送按钮挤出屏幕；
	   文件名获得全宽并由 text-overflow: ellipsis 截断 */
	.filePreview {
		flex: 0 0 100%;
		min-width: 0;
		padding: 6px 4px;
	}

	.textarea:global(._acrylic) {
		min-height: 36px;
		max-height: 76px;
		min-width: 0;
		flex: 1 1 0;
		width: 0;
		max-width: 100%;
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

		&:hover,
		&:focus-visible {
			color: var(--MI_THEME-accent);
			background: color-mix(in srgb, var(--MI_THEME-fg) 6%, transparent);
		}
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

	.abort {
		margin-left: 0;
		color: var(--MI_THEME-error);
	}

	.editHint {
		padding: 0.45em 0.65em;
		font-size: 0.82em;
	}
}
</style>
