<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader show-back narrow-merged-row>
	<div class="_spacer" style="--MI_SPACER-w: 700px;">
		<MkLoading v-if="loading"/>
		<div v-else class="_gaps_m">
			<div v-if="form.modified.value" :class="$style.stickySave">
				<MkFormFooter :form="form"/>
			</div>
			<MkFolder :defaultOpen="true">
				<template #icon><i class="ti ti-id"></i></template>
				<template #label>{{ i18n.ts._agents.editCharacterBasic }}</template>
				<div class="_gaps">
					<div :class="$style.avatarRow">
						<img v-if="avatarUrl" :class="$style.avatarImg" :src="avatarUrl" alt="">
						<div v-else :class="$style.avatarPlaceholder"><i class="ti ti-user"></i></div>
						<div class="_buttons">
							<MkButton rounded @click="pickAvatar"><i class="ti ti-photo"></i> {{ i18n.ts._agents.avatarPick }}</MkButton>
							<MkButton v-if="form.state.avatarFileId" rounded @click="clearAvatar">{{ i18n.ts._agents.avatarClear }}</MkButton>
						</div>
					</div>
					<MkInput v-model="form.state.name">
						<template #label>{{ i18n.ts._agents.fieldName }}</template>
					</MkInput>
					<MkTextarea v-model="form.state.summary">
						<template #label>{{ i18n.ts._agents.fieldSummary }}</template>
						<template #caption>{{ i18n.ts._agents.fieldSummaryCaption }}</template>
					</MkTextarea>
				</div>
			</MkFolder>
			<MkFolder>
				<template #icon><i class="ti ti-brain"></i></template>
				<template #label>{{ i18n.ts._agents.editCharacterPersona }}</template>
				<div class="_gaps">
					<MkTextarea v-model="form.state.personality" tall>
						<template #label>{{ i18n.ts._agents.fieldPersonality }}</template>
					</MkTextarea>
					<MkTextarea v-model="form.state.background" tall>
						<template #label>{{ i18n.ts._agents.fieldBackground }}</template>
					</MkTextarea>
					<MkTextarea v-model="form.state.speakingStyle" tall>
						<template #label>{{ i18n.ts._agents.fieldSpeakingStyle }}</template>
					</MkTextarea>
				</div>
			</MkFolder>
			<MkFolder>
				<template #icon><i class="ti ti-message"></i></template>
				<template #label>{{ i18n.ts._agents.editCharacterDialogue }}</template>
				<div class="_gaps">
					<MkTextarea v-model="form.state.greeting" tall>
						<template #label>{{ i18n.ts._agents.fieldGreeting }}</template>
						<template #caption>{{ i18n.ts._agents.fieldGreetingCaption }}</template>
					</MkTextarea>
					<div class="_gaps">
						<div :class="$style.exampleSectionLabel">{{ i18n.ts._agents.fieldExampleDialogue }}</div>
						<p :class="$style.exampleCaption">{{ i18n.ts._agents.fieldExampleDialogueCaption }}</p>
						<div
							v-for="(turn, i) in form.state.exampleTurns"
							:key="i"
							:class="$style.exampleTurnCard"
							class="_gaps_s"
						>
							<MkRadios
								v-model="turn.role"
								:options="exampleRoleOptions"
							>
								<template #label>{{ i18n.ts._agents.exampleTurnRoleLabel }}</template>
							</MkRadios>
							<MkTextarea v-model="turn.content" tall>
								<template #label>{{ i18n.ts._agents.exampleTurnContentLabel }}</template>
							</MkTextarea>
							<div>
								<MkButton danger rounded inline @click="removeExampleTurn(i)">
									<i class="ti ti-trash"></i> {{ i18n.ts._agents.removeExampleTurn }}
								</MkButton>
							</div>
						</div>
						<div>
							<MkButton rounded inline :disabled="form.state.exampleTurns.length >= 24" @click="addExampleTurn">
								<i class="ti ti-plus"></i> {{ i18n.ts._agents.addExampleTurn }}
							</MkButton>
						</div>
					</div>
				</div>
			</MkFolder>
			<MkFolder>
				<template #icon><i class="ti ti-shield"></i></template>
				<template #label>{{ i18n.ts._agents.editCharacterSafety }}</template>
				<div class="_gaps">
					<MkTextarea v-model="form.state.forbiddenBehavior" tall>
						<template #label>{{ i18n.ts._agents.fieldForbidden }}</template>
					</MkTextarea>
				</div>
			</MkFolder>
			<MkFolder>
				<template #icon><i class="ti ti-license"></i></template>
				<template #label>{{ i18n.ts._agents.editCharacterOpenSource }}</template>
				<div class="_gaps">
					<MkSwitch v-model="form.state.promptOpenSourced">
						<template #label>{{ i18n.ts._agents.openSourcePrompt }}</template>
						<template #caption>{{ i18n.ts._agents.openSourcePromptCharacterCaption }}</template>
					</MkSwitch>
				</div>
			</MkFolder>
			<div class="_buttons">
				<MkButton danger rounded @click="remove"><i class="ti ti-trash"></i> {{ i18n.ts._agents.deleteCharacter }}</MkButton>
			</div>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkRadios from '@/components/MkRadios.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkButton from '@/components/MkButton.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkFormFooter from '@/components/MkFormFooter.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { useForm } from '@/composables/use-form.js';
import * as os from '@/os.js';
import { useRouter } from '@/router.js';

const props = defineProps<{
	characterId: string;
}>();

const router = useRouter();
const loading = ref(true);
const avatarUrl = ref<string | null>(null);

type ExampleTurnForm = { role: 'user' | 'assistant'; content: string };

const exampleRoleOptions = computed(() => [
	{ value: 'user' as const, label: i18n.ts._agents.exampleTurnRoleUser },
	{ value: 'assistant' as const, label: i18n.ts._agents.exampleTurnRoleAssistant },
]);

const empty = () => ({
	name: '',
	summary: '',
	personality: '',
	background: '',
	speakingStyle: '',
	greeting: '',
	exampleTurns: [] as ExampleTurnForm[],
	forbiddenBehavior: '',
	avatarFileId: null as string | null,
	promptOpenSourced: false,
});

const form = useForm(empty(), async (state) => {
	const exampleTurns = state.exampleTurns
		.map(t => ({ role: t.role, content: t.content.trim() }))
		.filter(t => t.content.length > 0);
	await misskeyApi('agents/characters/update', {
		characterId: props.characterId,
		name: state.name,
		summary: state.summary.trim() === '' ? null : state.summary,
		personality: state.personality,
		background: state.background,
		speakingStyle: state.speakingStyle,
		greeting: state.greeting,
		exampleTurns,
		forbiddenBehavior: state.forbiddenBehavior,
		avatarFileId: state.avatarFileId,
		promptOpenSourced: state.promptOpenSourced,
	});
});

function addExampleTurn() {
	if (form.state.exampleTurns.length >= 24) return;
	form.state.exampleTurns.push({ role: 'user', content: '' });
}

function removeExampleTurn(index: number) {
	form.state.exampleTurns.splice(index, 1);
}

async function refreshAvatarPreview(fileId: string | null) {
	if (!fileId) {
		avatarUrl.value = null;
		return;
	}
	try {
		const f = await misskeyApi('drive/files/show', { fileId });
		avatarUrl.value = f.thumbnailUrl ?? f.url;
	} catch {
		avatarUrl.value = null;
	}
}

watch(() => form.state.avatarFileId, (id) => {
	void refreshAvatarPreview(id);
});

async function load() {
	loading.value = true;
	try {
		const row = await misskeyApi('agents/characters/show', { characterId: props.characterId });
		const turns: ExampleTurnForm[] = (row.exampleTurns ?? []).map(t => ({
			role: t.role,
			content: t.content,
		}));
		const next = {
			name: row.name,
			summary: row.summary ?? '',
			personality: row.personality ?? '',
			background: row.background ?? '',
			speakingStyle: row.speakingStyle ?? '',
			greeting: row.greeting ?? '',
			exampleTurns: turns,
			forbiddenBehavior: row.forbiddenBehavior ?? '',
			avatarFileId: row.avatarFileId,
			promptOpenSourced: row.promptOpenSourced === true,
		};
		Object.assign(form.state, next);
		Object.assign(form.savedState, JSON.parse(JSON.stringify(next)));
		await refreshAvatarPreview(row.avatarFileId);
	} catch {
		os.alert({ type: 'error', text: i18n.ts.somethingHappened });
		router.push('/agents');
	} finally {
		loading.value = false;
	}
}

onMounted(() => {
	void load();
});

definePage(computed(() => ({
	title: form.state.name.trim() || i18n.ts._agents.editCharacter,
	icon: 'ti ti-user',
})));

async function pickAvatar() {
	const files = await os.chooseFileFromPc({ multiple: false });
	if (files.length === 0) return;
	try {
		const [df] = await os.launchUploader(files, { multiple: false });
		form.state.avatarFileId = df.id;
	} catch {
		// user cancelled uploader
	}
}

function clearAvatar() {
	form.state.avatarFileId = null;
}

async function remove() {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.ts._agents.deleteCharacterConfirm,
	});
	if (canceled) return;
	await misskeyApi('agents/characters/delete', { characterId: props.characterId });
	os.toast(i18n.ts._agents.deleteDone);
	router.push('/agents');
}
</script>

<style lang="scss" module>
.avatarRow {
	display: flex;
	align-items: center;
	gap: 12px;
	flex-wrap: wrap;
}
.avatarImg {
	width: 64px;
	height: 64px;
	border-radius: 12px;
	object-fit: cover;
	border: solid 1px var(--MI_THEME-divider);
}
.avatarPlaceholder {
	width: 64px;
	height: 64px;
	border-radius: 12px;
	display: flex;
	align-items: center;
	justify-content: center;
	background: var(--MI_THEME-panel);
	border: dashed 1px var(--MI_THEME-divider);
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 1.5rem;
}
.stickySave {
	position: sticky;
	top: 0;
	z-index: 1;
	padding-bottom: 8px;
	background: var(--MI_THEME-bg);
}

.exampleSectionLabel {
	font-weight: 700;
	font-size: 0.95em;
}

.exampleCaption {
	margin: 0;
	font-size: 0.88em;
	line-height: 1.45;
	opacity: 0.78;
}

.exampleTurnCard {
	padding: 12px;
	border-radius: var(--MI-radius);
	border: solid 1px var(--MI_THEME-divider);
	background: color-mix(in srgb, var(--MI_THEME-panel) 88%, transparent);
}
</style>
