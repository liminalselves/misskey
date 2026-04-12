<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div
	:class="$style.root"
>
	<div :class="$style.compose">
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
				<button class="_button" :class="$style.button" type="button" @click="insertEmoji"><i class="ti ti-mood-happy"></i></button>
				<button class="_button" :class="[$style.button, $style.send]" type="button" :disabled="sendDisabled" :title="i18n.ts.send" @click="submit">
					<template v-if="!sending"><i class="ti ti-send"></i></template>
					<template v-else><MkLoading :em="true"/></template>
				</button>
			</div>
		</footer>
	</div>
</div>
</template>

<script lang="ts" setup>
import { onMounted, ref, shallowRef, computed, nextTick, onBeforeUnmount } from 'vue';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';
import { Autocomplete } from '@/utility/autocomplete.js';
import { emojiPicker } from '@/utility/emoji-picker.js';
import MkLoading from '@/components/global/MkLoading.vue';

const props = defineProps<{
	disabled?: boolean;
	sending?: boolean;
}>();

const emit = defineEmits<{
	(e: 'submit', text: string): void;
}>();

const textareaEl = shallowRef<HTMLTextAreaElement>();
const text = ref('');
const textareaReadOnly = ref(false);
let autocompleteInstance: Autocomplete | null = null;

const sendDisabled = computed(() => props.disabled || props.sending || text.value.trim().length === 0);

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
	}
}

function submit() {
	const t = text.value.trim();
	if (!t || props.sending || props.disabled) return;
	emit('submit', t);
	text.value = '';
}

function restoreDraft(t: string) {
	text.value = t;
}

defineExpose({
	focus: () => textareaEl.value?.focus(),
	restoreDraft,
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

@media (max-width: 500px) {
	.root {
		border-radius: 10px 10px 0 0;
		/* 避免横向 flex 略超宽时把右侧发送按钮裁掉 */
		overflow-x: hidden;
		overflow-y: visible;
	}

	.compose {
		flex-direction: row;
		align-items: flex-end;
		gap: 8px;
		box-sizing: border-box;
		width: 100%;
		min-width: 0;
		max-width: 100%;
		padding: 8px max(12px, env(safe-area-inset-right, 0px)) max(8px, env(safe-area-inset-bottom, 0px)) max(12px, env(safe-area-inset-left, 0px));
		background: var(--MI_THEME-panel);
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
}
</style>
