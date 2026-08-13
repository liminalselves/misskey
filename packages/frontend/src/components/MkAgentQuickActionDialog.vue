<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow
	ref="dialog"
	:width="560"
	@close="cancel"
	@closed="emit('closed')"
>
	<template #header>{{ i18n.tsx._agents.quickActionTitle({ name: userName }) }}</template>

	<div :class="$style.root">
		<!-- 1. 违规类别（最顶部） -->
		<div :class="$style.field">
			<label :class="$style.label">{{ i18n.ts._agents.quickActionCategory }}</label>
			<div :class="$style.categoryGrid">
				<button
					v-for="cat in categoryOptions"
					:key="cat.value"
					type="button"
					class="_button"
					:class="[$style.categoryBtn, form.category === cat.value ? $style.categoryBtnActive : null]"
					@click="form.category = cat.value"
				>{{ cat.label }}</button>
			</div>
			<MkInput v-if="form.category === '其他违规'" v-model="form.customCategory" type="text" :class="$style.customCategoryInput">
				<template #label>{{ i18n.ts._agents.quickActionCustomCategory }}</template>
			</MkInput>
		</div>

		<!-- 2. 选择会话（多选） -->
		<div :class="$style.field">
			<label :class="$style.label">{{ i18n.tsx._agents.quickActionSelectSessions({ selected: form.selectedSessionIds.size, total: sessions.length }) }}</label>
			<div :class="$style.sessionList">
				<label
					v-for="s in sessions"
					:key="s.id"
					:class="[$style.sessionItem, form.selectedSessionIds.has(s.id) ? $style.sessionItemSelected : null]"
				>
					<input
						type="checkbox"
						:checked="form.selectedSessionIds.has(s.id)"
						@change="toggleSession(s.id)"
					/>
					<span :class="$style.sessionName">{{ s.name }}</span>
					<span v-if="s.banned" :class="$style.sessionBannedTag">{{ i18n.ts._agents.quickActionSessionBanned }}</span>
				</label>
			</div>
		</div>

		<!-- 3. 封禁会话原因 -->
		<div :class="$style.field">
			<label :class="$style.label">{{ i18n.ts._agents.quickActionSessionBanReason }}</label>
			<MkTextarea v-model="form.sessionBanReason" :placeholder="i18n.tsx._agents.quickActionAutoGenerate({ value: effectiveCategory })"/>
		</div>

		<!-- 4. 封禁用户 -->
		<div :class="$style.field">
			<label :class="$style.label">{{ i18n.ts._agents.quickActionBanUser }}</label>
			<div :class="$style.suspendOptions">
				<button
					v-for="opt in suspendOptions"
					:key="opt.value"
					type="button"
					class="_button"
					:class="[$style.suspendBtn, form.suspendHours === opt.value ? $style.suspendBtnActive : null]"
					@click="form.suspendHours = opt.value"
				>{{ opt.label }}</button>
			</div>
		</div>

		<!-- 5. 封禁用户原因 -->
		<div v-if="form.suspendHours >= 0" :class="$style.field">
			<label :class="$style.label">{{ i18n.ts._agents.quickActionUserSuspendReason }}</label>
			<MkTextarea v-model="form.userSuspendReason" :placeholder="i18n.tsx._agents.quickActionAutoGenerate({ value: '智能体' + effectiveCategory })"/>
		</div>

		<!-- 6. 管理笔记（仅封禁用户时显示） -->
		<div v-if="form.suspendHours >= 0" :class="$style.field">
			<label :class="$style.label">{{ i18n.ts._agents.quickActionModerationNote }}</label>
			<div :class="$style.noteFormatHint">
				{{ i18n.ts._agents.quickActionNoteFormat }}：<code>[{{ datePreview }}]智能体{{ effectiveCategory }}{{ suspendText }} -{{ moderatorName }}</code>
			</div>
			<MkTextarea v-model="form.moderationNote" :placeholder="i18n.ts._agents.quickActionAutoGenerate.replace('{value}', '')"/>
		</div>

		<!-- 操作按钮 -->
		<div :class="$style.actions">
			<MkButton rounded @click="cancel">{{ i18n.ts._agents.quickActionCancel }}</MkButton>
			<MkButton
				primary
				rounded
				:disabled="!canSubmit || processing"
				@click="submit"
			>
				<i class="ti ti-gavel"></i>
				{{ processing ? i18n.ts._agents.quickActionProcessing : i18n.ts._agents.quickActionSubmit }}
			</MkButton>
		</div>
	</div>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { computed, reactive, ref, useTemplateRef, watch } from 'vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import { i18n } from '@/i18n.js';

export type QuickActionSession = {
	id: string;
	name: string;
	banned: boolean;
};

export type QuickActionResult = {
	sessionIds: string[];
	sessionBanReason: string | null;
	suspendDurationHours: number;
	userSuspendReason: string | null;
	moderationNote: string | null;
	violationCategory: string;
};

const props = withDefaults(defineProps<{
	userName: string;
	sessions: QuickActionSession[];
	defaultCategory?: string;
	defaultSuspendHours?: number;
	moderatorName: string;
}>(), {
	defaultCategory: '色情内容',
	defaultSuspendHours: -1,
});

const emit = defineEmits<{
	(ev: 'done', result: QuickActionResult): void;
	(ev: 'cancel'): void;
	(ev: 'closed'): void;
}>();

const dialog = useTemplateRef('dialog');
const processing = ref(false);

const categoryOptions = [
	{ label: i18n.ts._agents.quickActionCatPorn, value: '色情内容' },
	{ label: i18n.ts._agents.quickActionCatViolence, value: '暴力内容' },
	{ label: i18n.ts._agents.quickActionCatHate, value: '仇恨言论' },
	{ label: i18n.ts._agents.quickActionCatPromptInjection, value: '提示词注入' },
	{ label: i18n.ts._agents.quickActionCatIllegal, value: '违法内容' },
	{ label: i18n.ts._agents.quickActionCatOther, value: '其他违规' },
];

const suspendOptions = [
	{ label: i18n.ts._agents.quickActionNoBan, value: -1 },
	{ label: i18n.ts._agents.quickActionDay, value: 24 },
	{ label: i18n.ts._agents.quickActionWeek, value: 168 },
	{ label: i18n.ts._agents.quickActionMonth, value: 720 },
	{ label: i18n.ts._agents.quickActionForever, value: 0 },
];

const form = reactive({
	category: props.defaultCategory,
	customCategory: '',
	selectedSessionIds: new Set(props.sessions.filter(s => !s.banned).map(s => s.id)),
	sessionBanReason: '',
	suspendHours: props.defaultSuspendHours,
	userSuspendReason: '',
	moderationNote: '',
});

// 会话列表异步加载时，首次到达后同步默认勾选；
// 用户一旦手动勾选过，就不再同步，避免覆盖用户操作
let sessionsSynced = false;
let userInteracted = false;
watch(() => props.sessions, (sessions) => {
	if (sessionsSynced || userInteracted) return;
	if (sessions.length === 0) return;
	sessionsSynced = true;
	form.selectedSessionIds = new Set(sessions.filter(s => !s.banned).map(s => s.id));
}, { deep: true });

const effectiveCategory = computed(() => {
	return form.category === '其他违规' ? (form.customCategory.trim() || '其他违规') : form.category;
});

const suspendText = computed(() => {
	if (form.suspendHours < 0) return i18n.ts._agents.quickActionSessionOnly;
	if (form.suspendHours === 0) return i18n.ts._agents.quickActionPermanent;
	return i18n.tsx._agents.quickActionSuspendHours({ hours: form.suspendHours });
});

const datePreview = computed(() => {
	const now = new Date();
	return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
});

const canSubmit = computed(() => {
	if (form.selectedSessionIds.size === 0) return false;
	if (form.category === '其他违规' && form.customCategory.trim() === '') return false;
	return true;
});

function toggleSession(id: string) {
	userInteracted = true;
	if (form.selectedSessionIds.has(id)) {
		form.selectedSessionIds.delete(id);
	} else {
		form.selectedSessionIds.add(id);
	}
}

function cancel() {
	emit('cancel');
	dialog.value?.close();
}

function submit() {
	if (!canSubmit.value || processing.value) return;
	processing.value = true;
	emit('done', {
		sessionIds: [...form.selectedSessionIds],
		sessionBanReason: form.sessionBanReason.trim() || null,
		suspendDurationHours: form.suspendHours,
		userSuspendReason: form.userSuspendReason.trim() || null,
		moderationNote: form.moderationNote.trim() || null,
		violationCategory: effectiveCategory.value,
	});
	dialog.value?.close();
}
</script>

<style lang="scss" module>
.root {
	display: flex;
	flex-direction: column;
	gap: 16px;
	padding: 20px;
	max-height: 70vh;
	overflow-y: auto;
}

.field {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.label {
	font-size: 0.88em;
	font-weight: 600;
	color: var(--MI_THEME-fgTransparentWeak);
}

.categoryGrid {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.categoryBtn {
	padding: 8px 14px;
	border-radius: 999px;
	border: 1px solid var(--MI_THEME-divider);
	background: var(--MI_THEME-panel);
	font-size: 0.88em;
	transition: border-color 0.15s, background 0.15s;

	&:hover {
		border-color: var(--MI_THEME-accent);
	}
}

.categoryBtnActive {
	border-color: var(--MI_THEME-accent);
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
	font-weight: 600;
}

.customCategoryInput {
	margin-top: 4px;
}

.sessionList {
	display: flex;
	flex-direction: column;
	gap: 6px;
	max-height: 160px;
	overflow-y: auto;
}

.sessionItem {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 10px 12px;
	border-radius: 8px;
	border: 1px solid var(--MI_THEME-divider);
	background: var(--MI_THEME-bg);
	cursor: pointer;
	transition: border-color 0.15s, background 0.15s;

	&:hover {
		border-color: var(--MI_THEME-accent);
	}

	input[type="checkbox"] {
		flex-shrink: 0;
	}
}

.sessionItemSelected {
	border-color: var(--MI_THEME-accent);
	background: var(--MI_THEME-accentedBg);
}

.sessionName {
	flex: 1;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.sessionBannedTag {
	flex-shrink: 0;
	font-size: 0.78em;
	padding: 2px 6px;
	border-radius: 4px;
	background: var(--MI_THEME-errorBg);
	color: var(--MI_THEME-error);
}

.suspendOptions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.suspendBtn {
	padding: 8px 14px;
	border-radius: 999px;
	border: 1px solid var(--MI_THEME-divider);
	background: var(--MI_THEME-panel);
	font-size: 0.88em;
	transition: border-color 0.15s, background 0.15s;

	&:hover {
		border-color: var(--MI_THEME-accent);
	}
}

.suspendBtnActive {
	border-color: var(--MI_THEME-error);
	background: var(--MI_THEME-errorBg);
	color: var(--MI_THEME-error);
	font-weight: 600;
}

.noteFormatHint {
	padding: 8px 10px;
	border-radius: 6px;
	background: var(--MI_THEME-bg);
	border: 1px solid var(--MI_THEME-divider);
	font-size: 0.82em;
	color: var(--MI_THEME-fgTransparentWeak);
	line-height: 1.4;

	code {
		word-break: break-all;
	}
}

.actions {
	display: flex;
	justify-content: flex-end;
	gap: 10px;
	padding-top: 8px;
	border-top: 1px solid var(--MI_THEME-divider);
}
</style>
