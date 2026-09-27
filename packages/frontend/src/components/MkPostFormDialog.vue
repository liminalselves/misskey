<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModal
	ref="modal"
	v-slot="{ type }"
	:preferType="deviceKind === 'smartphone' ? 'drawer' : 'dialog'"
	@click="onBgClick()"
	@closed="onModalClosed()"
	@esc="onEsc"
>
	<MkPostForm
		ref="form"
		:class="[$style.form, type === 'drawer' ? $style.asDrawer : null]"
		class="_popup"
		v-bind="props"
		autofocus
		freezeAfterPosted
		@posted="onPosted"
		@cancel="_close()"
		@esc="_close()"
	/>
</MkModal>
</template>

<script lang="ts" setup>
import { useTemplateRef } from 'vue';
import type { PostFormProps } from '@/types/post-form.js';
import MkModal from '@/components/MkModal.vue';
import MkPostForm from '@/components/MkPostForm.vue';
import { deviceKind } from '@/utility/device-kind.js';

const props = withDefaults(defineProps<PostFormProps & {
	instant?: boolean;
	fixed?: boolean;
	autofocus?: boolean;
}>(), {
	initialLocalOnly: undefined,
});

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

const modal = useTemplateRef('modal');
const form = useTemplateRef('form');

function onPosted() {
	modal.value?.close({
		useSendAnimation: true,
	});
}

async function _close() {
	const canClose = await form.value?.canClose();
	if (!canClose) return;
	form.value?.abortUploader();
	modal.value?.close();
}

function onEsc() {
	_close();
}

function onBgClick() {
	_close();
}

function onModalClosed() {
	emit('closed');
}
</script>

<style lang="scss" module>
.form {
	width: 100%;
	max-width: 520px;
	margin: 0 auto auto auto;

	&.asDrawer {
		max-width: none;
		height: calc(100dvh - 30px);
		border-radius: 0;
		padding-bottom: env(safe-area-inset-bottom, 0px);
		display: flex;
		flex-direction: column;
		overflow: auto;

		// 工具栏贴面板底部
		> footer {
			margin-top: auto;
		}

		// 抽屉内唯一 textarea 即主输入框（cw/话题用的是 input）
		textarea {
			min-height: 50dvh;
		}
	}
}
</style>
