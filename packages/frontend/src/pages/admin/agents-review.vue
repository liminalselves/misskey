<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader>
	<div class="_spacer" style="--MI_SPACER-w: 900px;">
		<div class="_gaps">
			<MkInfo>{{ i18n.ts._agents.adminAgentReviewDescription }}</MkInfo>
			<MkLoading v-if="loading"/>
			<MkInfo v-else-if="characters.length === 0 && styles.length === 0">{{ i18n.ts._agents.noPendingAgentReviews }}</MkInfo>
			<template v-else>
				<MkFolder v-for="c in characters" :key="'c-' + c.id" :defaultOpen="true">
					<template #label>{{ c.name }}</template>
					<template #icon><i class="ti ti-user"></i></template>
					<template #caption>{{ i18n.ts._agents.reviewKindCharacter }} · ID {{ c.id }}</template>
					<div class="_gaps">
						<p><MkUserName :user="c.user" class="_noSelect"/> · <MkAcct :user="c.user"/></p>
						<p v-if="c.publishedVersion != null" class="_text">{{ i18n.ts._agents.publishedBadge }} · V{{ c.publishedVersion }} → {{ i18n.ts._agents.pendingReviewBadge }}</p>

						<div v-if="c.avatar" :class="$style.avatarRow">
							<MkDriveFileThumbnail :file="c.avatar" fit="cover" :class="$style.avatar"/>
						</div>

						<section :class="$style.block">
							<h4 :class="$style.h">{{ i18n.ts._agents.fieldName }}</h4>
							<pre :class="$style.pre">{{ c.name }}</pre>
						</section>
						<section :class="$style.block">
							<h4 :class="$style.h">{{ i18n.ts._agents.fieldSummary }}</h4>
							<pre :class="$style.pre">{{ c.summary ?? '—' }}</pre>
						</section>
						<section :class="$style.block">
							<h4 :class="$style.h">{{ i18n.ts._agents.fieldPersonality }}</h4>
							<pre :class="$style.pre">{{ c.personality }}</pre>
						</section>
						<section :class="$style.block">
							<h4 :class="$style.h">{{ i18n.ts._agents.fieldBackground }}</h4>
							<pre :class="$style.pre">{{ c.background }}</pre>
						</section>
						<section :class="$style.block">
							<h4 :class="$style.h">{{ i18n.ts._agents.fieldSpeakingStyle }}</h4>
							<pre :class="$style.pre">{{ c.speakingStyle }}</pre>
						</section>
						<section :class="$style.block">
							<h4 :class="$style.h">{{ i18n.ts._agents.fieldGreeting }}</h4>
							<pre :class="$style.pre">{{ c.greeting }}</pre>
						</section>
						<section :class="$style.block">
							<h4 :class="$style.h">{{ i18n.ts._agents.fieldExampleDialogue }}</h4>
							<div v-if="c.exampleTurns.length === 0" class="_text">—</div>
							<div v-else :class="$style.turns">
								<div v-for="(t, i) in c.exampleTurns" :key="i" :class="$style.turn">
									<span :class="$style.turnRole">{{ t.role === 'user' ? i18n.ts._agents.exampleTurnRoleUser : i18n.ts._agents.exampleTurnRoleAssistant }}</span>
									<pre :class="$style.pre">{{ t.content }}</pre>
								</div>
							</div>
						</section>
						<section :class="$style.block">
							<h4 :class="$style.h">{{ i18n.ts._agents.fieldForbidden }}</h4>
							<pre :class="$style.pre">{{ c.forbiddenBehavior }}</pre>
						</section>

						<div class="_buttons">
							<MkButton primary rounded @click="resolve('character', c.id, 'approve')"><i class="ti ti-check"></i> {{ i18n.ts._agents.approveReview }}</MkButton>
							<MkButton danger rounded @click="resolve('character', c.id, 'reject')"><i class="ti ti-x"></i> {{ i18n.ts._agents.rejectReview }}</MkButton>
						</div>
					</div>
				</MkFolder>
				<MkFolder v-for="s in styles" :key="'s-' + s.id" :defaultOpen="true">
					<template #label>{{ s.name }}</template>
					<template #icon><i class="ti ti-message-cog"></i></template>
					<template #caption>{{ i18n.ts._agents.reviewKindStyle }} · ID {{ s.id }}</template>
					<div class="_gaps">
						<p><MkUserName :user="s.user" class="_noSelect"/> · <MkAcct :user="s.user"/></p>
						<p v-if="s.publishedVersion != null" class="_text">{{ i18n.ts._agents.publishedBadge }} · V{{ s.publishedVersion }} → {{ i18n.ts._agents.pendingReviewBadge }}</p>

						<section :class="$style.block">
							<h4 :class="$style.h">{{ i18n.ts._agents.fieldStyleName }}</h4>
							<pre :class="$style.pre">{{ s.name }}</pre>
						</section>
						<section :class="$style.block">
							<h4 :class="$style.h">{{ i18n.ts._agents.fieldStyleSummary }}</h4>
							<pre :class="$style.pre">{{ s.summary ?? '—' }}</pre>
						</section>
						<section :class="$style.block">
							<h4 :class="$style.h">{{ i18n.ts._agents.fieldStyleBody }}</h4>
							<pre :class="$style.pre">{{ s.body }}</pre>
						</section>

						<div class="_buttons">
							<MkButton primary rounded @click="resolve('style', s.id, 'approve')"><i class="ti ti-check"></i> {{ i18n.ts._agents.approveReview }}</MkButton>
							<MkButton danger rounded @click="resolve('style', s.id, 'reject')"><i class="ti ti-x"></i> {{ i18n.ts._agents.rejectReview }}</MkButton>
						</div>
					</div>
				</MkFolder>
			</template>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import type { AdminAgentsReviewListPendingResponse } from 'misskey-js/entities.js';
import MkButton from '@/components/MkButton.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkUserName from '@/components/global/MkUserName.vue';
import MkAcct from '@/components/global/MkAcct.vue';
import MkDriveFileThumbnail from '@/components/MkDriveFileThumbnail.vue';
import { misskeyApi, formatApiError } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import * as os from '@/os.js';

const loading = ref(true);
const characters = ref<AdminAgentsReviewListPendingResponse['characters']>([]);
const styles = ref<AdminAgentsReviewListPendingResponse['styles']>([]);

definePage({
	title: i18n.ts._agents.adminAgentReview,
	icon: 'ti ti-checkbox',
});

async function load() {
	loading.value = true;
	try {
		const res = await misskeyApi('admin/agents/review/list-pending', {});
		characters.value = res.characters;
		styles.value = res.styles;
	} catch (e) {
		os.alert({ type: 'error', text: formatApiError(e) });
	} finally {
		loading.value = false;
	}
}

async function resolve(kind: 'character' | 'style', id: string, decision: 'approve' | 'reject') {
	const { canceled } = await os.confirm({
		type: decision === 'approve' ? 'info' : 'warning',
		text: decision === 'approve' ? i18n.ts._agents.approveReview : i18n.ts._agents.rejectReview,
	});
	if (canceled) return;
	try {
		await misskeyApi('admin/agents/review/resolve', {
			kind,
			id,
			decision,
		});
		os.toast(i18n.ts.done);
		await load();
	} catch (e) {
		os.alert({ type: 'error', text: formatApiError(e) });
	}
}

onMounted(() => {
	void load();
});
</script>

<style lang="scss" module>
.block {
	margin-top: 12px;
}
.h {
	margin: 0 0 6px;
	font-size: 0.9em;
	font-weight: 600;
	color: var(--MI_THEME-fgTransparentWeak);
}
.pre {
	margin: 0;
	padding: 10px 12px;
	border-radius: var(--MI-radius);
	background: var(--MI_THEME-panel);
	border: solid 1px var(--MI_THEME-divider);
	white-space: pre-wrap;
	word-break: break-word;
	font-size: 0.95em;
	line-height: 1.45;
	max-height: min(60vh, 480px);
	overflow: auto;
}
.avatarRow {
	margin: 8px 0;
}
.avatar {
	width: 96px;
	height: 96px;
	border-radius: 999px;
	overflow: hidden;
	border: solid 1px var(--MI_THEME-divider);
}
.turns {
	display: flex;
	flex-direction: column;
	gap: 10px;
}
.turnRole {
	display: inline-block;
	margin-bottom: 4px;
	font-size: 0.85em;
	font-weight: 600;
	color: var(--MI_THEME-accent);
}
.turn .pre {
	max-height: 240px;
}
</style>
