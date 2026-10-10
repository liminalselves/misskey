<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModal ref="modal" :zPriority="'middle'" :preferType="'dialog'" @closed="emit('closed')" @click="onBgClick" @esc="closeDialog">
	<div ref="rootEl" :class="$style.root">
		<div :class="$style.header">
			<i :class="[$style.headerIcon, hasModelChanges && !hasNotices ? 'ti ti-refresh' : 'ti ti-speakerphone']"></i>
			<span :class="$style.title">{{ dialogTitle }}</span>
			<button class="_button" :class="$style.closeButton" :disabled="reading" @click="closeDialog"><i class="ti ti-x"></i></button>
		</div>
		<div :class="$style.body">
			<section v-for="group in groups" :key="group.key">
				<h2 v-if="group.label" :class="$style.groupLabel">{{ group.label }}</h2>
				<article v-for="announcement in group.items" :key="announcement.id" :class="$style.entry">
					<header :class="$style.entryHeader">
						<span :class="$style.entryTitle">{{ announcement.title }}</span>
						<MkTime :time="announcement.createdAt" :class="$style.entryTime"/>
					</header>
					<div v-if="announcement.text" :class="$style.entryText"><Mfm :text="announcement.text"/></div>

					<template v-for="kind in modelKinds" :key="kind.id">
						<section v-if="announcement.changes.some(change => change.kind === kind.id)" :class="$style.section">
							<h3 :class="$style.sectionTitle">
								<i :class="kind.id === 'chat' ? 'ti ti-messages' : 'ti ti-photo'"></i>
								{{ kind.label }}
							</h3>
							<div v-for="(change, index) in announcement.changes.filter(item => item.kind === kind.id)" :key="`${change.modelId}-${index}`" :class="$style.card">
								<div :class="$style.cardHeader">
									<span :class="$style.cardName">{{ change.modelName }}</span>
									<span :class="change.type === 'removed' ? $style.badgeRemoved : change.type === 'modified' ? $style.badgeModified : $style.badgeAdded">{{ changeLabels[change.type] }}</span>
								</div>
								<dl v-if="change.fields.length > 0" :class="$style.fields">
									<div v-for="field in change.fields" :key="field.label" :class="$style.field">
										<dt :class="$style.fieldLabel">{{ field.label }}</dt>
										<dd v-if="change.type === 'modified' && field.label !== '简介'" :class="$style.fieldValue">
											<span :class="$style.valueBefore">{{ field.before }}</span>
											<i class="ti ti-arrow-right" :class="$style.valueArrow"></i>
											<span :class="$style.valueAfter">{{ field.after }}</span>
										</dd>
										<dd v-else :class="field.label === '简介' ? $style.fieldText : $style.fieldValue">{{ field.after }}</dd>
									</div>
								</dl>
							</div>
						</section>
					</template>
				</article>
			</section>
			<MkInfo v-if="error" warn>{{ error }}</MkInfo>
		</div>
		<div :class="$style.footer">
			<MkButton primary rounded full :disabled="reading" @click="acknowledge"><i class="ti ti-check"></i> {{ reading ? '正在确认…' : '我知道了' }}</MkButton>
		</div>
	</div>
</MkModal>
</template>

<script lang="ts" setup>
import { computed, ref, useTemplateRef } from 'vue';
import type { AgentModelAnnouncement } from '@/utility/agent-model-announcements.js';
import MkModal from '@/components/MkModal.vue';
import MkButton from '@/components/MkButton.vue';
import MkInfo from '@/components/MkInfo.vue';
import { $i } from '@/i.js';
import { misskeyApi, formatApiError } from '@/utility/misskey-api.js';

const props = defineProps<{
	announcements: AgentModelAnnouncement[];
	userId: string;
}>();
const emit = defineEmits<{ (ev: 'closed'): void }>();
const modal = useTemplateRef('modal');
const rootEl = useTemplateRef('rootEl');
const reading = ref(false);
const error = ref('');
const modelKinds = [{ id: 'chat', label: '对话模型' }, { id: 'image', label: '绘图模型' }] as const;
const changeLabels = { added: '新增', relisted: '重新上架', removed: '已下架', modified: '已调整' };
const hasModelChanges = computed(() => props.announcements.some(announcement => announcement.changes.length > 0));
const hasNotices = computed(() => props.announcements.some(announcement => announcement.changes.length === 0));
const dialogTitle = computed(() => hasModelChanges.value && hasNotices.value ? '模型更新与公告' : hasModelChanges.value ? '模型更新' : '公告');
const groups = computed(() => {
	const notices = props.announcements.filter(announcement => announcement.changes.length === 0);
	const updates = props.announcements.filter(announcement => announcement.changes.length > 0);
	const mixed = notices.length > 0 && updates.length > 0;
	return [
		...(notices.length > 0 ? [{ key: 'notices', label: mixed ? '公告' : null, items: notices }] : []),
		...(updates.length > 0 ? [{ key: 'updates', label: mixed ? '模型更新' : null, items: updates }] : []),
	];
});

function closeDialog() {
	if (!reading.value) modal.value?.close();
}

function onBgClick() {
	rootEl.value?.animate([
		{ offset: 0, transform: 'scale(1)' },
		{ offset: 0.5, transform: 'scale(1.05)' },
		{ offset: 1, transform: 'scale(1)' },
	], { duration: 100 });
}

async function acknowledge() {
	if (reading.value) return;
	if ($i?.id !== props.userId) {
		closeDialog();
		return;
	}
	reading.value = true;
	error.value = '';
	try {
		await (misskeyApi as unknown as (endpoint: string, data: { announcementId: string }) => Promise<void>)(
			'agents/model-announcements/read', { announcementId: props.announcements[props.announcements.length - 1].id },
		);
		modal.value?.close();
	} catch (err) {
		error.value = formatApiError(err);
	} finally {
		reading.value = false;
	}
}
</script>

<style lang="scss" module>
.root {
	margin: auto;
	display: flex;
	flex-direction: column;
	width: min(560px, calc(100vw - 32px));
	max-height: calc(100dvh - 64px);
	box-sizing: border-box;
	background: var(--MI_THEME-panel);
	border-radius: var(--MI-radius);
	overflow: hidden;
}

.header {
	display: flex;
	align-items: center;
	flex-shrink: 0;
	height: 46px;
	padding: 0 8px 0 18px;
	box-sizing: border-box;
	background: var(--MI_THEME-windowHeader);
}

.headerIcon {
	margin-right: 8px;
	color: var(--MI_THEME-accent);
}

.title {
	flex: 1;
	font-weight: bold;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.closeButton {
	width: 38px;
	height: 38px;
	border-radius: 6px;

	&:hover {
		background: var(--MI_THEME-buttonHoverBg);
	}
}

.body {
	flex: 1;
	overflow-y: auto;
	padding: 18px 20px;
	box-sizing: border-box;
	overflow-wrap: anywhere;
}

.groupLabel {
	margin: 0 0 10px;
	font-size: 0.85em;
	font-weight: bold;
	opacity: 0.6;
}

.entry {
	+ .entry {
		margin-top: 20px;
		padding-top: 20px;
		border-top: 1px solid var(--MI_THEME-divider);
	}
}

section + section .groupLabel {
	margin-top: 20px;
	padding-top: 20px;
	border-top: 1px solid var(--MI_THEME-divider);
}

.entryHeader {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: 4px 10px;
}

.entryTitle {
	font-weight: bold;
}

.entryTime {
	font-size: 0.85em;
	opacity: 0.6;
}

.entryText {
	margin-top: 8px;
}

.section {
	margin-top: 14px;
}

.sectionTitle {
	display: flex;
	align-items: center;
	gap: 6px;
	margin: 0 0 8px;
	font-size: 0.9em;
	opacity: 0.7;
}

.card {
	padding: 10px 14px;
	border-radius: 10px;
	background: var(--MI_THEME-bg);

	+ .card {
		margin-top: 8px;
	}
}

.cardHeader {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: 12px;
}

.cardName {
	font-weight: bold;
	overflow: hidden;
	text-overflow: ellipsis;
}

.badgeAdded,
.badgeModified,
.badgeRemoved {
	flex-shrink: 0;
	padding: 1px 8px;
	border-radius: 999px;
	font-size: 0.8em;
}

.badgeAdded {
	color: var(--MI_THEME-accent);
	background: color(from var(--MI_THEME-accent) srgb r g b / 0.12);
}

.badgeModified {
	color: var(--MI_THEME-warn);
	background: color(from var(--MI_THEME-warn) srgb r g b / 0.12);
}

.badgeRemoved {
	color: var(--MI_THEME-error);
	background: color(from var(--MI_THEME-error) srgb r g b / 0.12);
}

.fields {
	display: flex;
	flex-wrap: wrap;
	gap: 6px 16px;
	margin: 8px 0 0;
	font-size: 0.9em;
}

.field {
	min-width: 0;
}

.fieldLabel {
	opacity: 0.6;
	font-size: 0.85em;
}

.fieldValue {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: 0 6px;
	margin: 2px 0 0;
}

.fieldText {
	margin: 2px 0 0;
	white-space: pre-wrap;
	flex-basis: 100%;
}

.valueBefore {
	opacity: 0.55;
	text-decoration: line-through;
}

.valueArrow {
	font-size: 0.8em;
	opacity: 0.5;
}

.valueAfter {
	font-weight: bold;
}

.footer {
	flex-shrink: 0;
	padding: 12px 20px 16px;
	box-sizing: border-box;
	border-top: 1px solid var(--MI_THEME-divider);
}
</style>
