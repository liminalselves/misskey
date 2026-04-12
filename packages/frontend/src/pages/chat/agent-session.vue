<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="tab" :reversed="tab === 'chat'" :tabs="headerTabs" narrow-merged-row show-back :actions="headerActions">
	<div v-if="tab === 'chat'" class="_spacer" style="--MI_SPACER-w: 700px;">
		<div v-if="loading || chatInitializing" class="_gaps">
			<MkLoading/>
		</div>
		<div v-else class="_gaps">
			<div v-if="messages.length === 0">
				<div class="_gaps" style="text-align: center;">
					<div>{{ i18n.ts._agents.emptyThread }}</div>
				</div>
			</div>

			<div v-else ref="timelineEl" class="_gaps" style="container-type: inline-size;">
				<div v-if="canFetchMore">
					<MkButton :class="$style.more" :wait="moreFetching" primary rounded @click="fetchOlderMessages">{{ i18n.ts.loadMore }}</MkButton>
				</div>
				<TransitionGroup
					:enterActiveClass="prefer.s.animation ? $style.transition_x_enterActive : ''"
					:leaveActiveClass="prefer.s.animation ? $style.transition_x_leaveActive : ''"
					:enterFromClass="prefer.s.animation ? $style.transition_x_enterFrom : ''"
					:leaveToClass="prefer.s.animation ? $style.transition_x_leaveTo : ''"
					:moveClass="prefer.s.animation ? $style.transition_x_move : ''"
					tag="div" class="_gaps"
				>
					<template v-for="item in timelineForChat.toReversed()" :key="item.id">
						<XAgentMessage
							v-if="item.type === 'item'"
							:sessionId="sessionId"
							:message="item.data"
							:assistantName="character?.name ?? null"
							:assistantAvatarUrl="assistantAvatarUrl"
							:highlighted="highlightedMessageId === item.data.id"
							@deleted="onAgentMessageDeleted"
						/>
						<div
							v-else-if="item.type === 'contextWindow'"
							:class="[$style.contextWindowDivider, { [$style.contextWindowDividerHighlight]: highlightedContextDivider }]"
							role="separator"
							:data-agent-context-window-divider="contextWindowBoundaryId ?? ''"
						>
							<span :class="$style.contextWindowLine"></span>
							<span :class="$style.contextWindowLabel">{{ i18n.ts._agents.contextWindowDivider }}</span>
							<span :class="$style.contextWindowLine"></span>
						</div>
						<div v-else-if="item.type === 'date'" :class="$style.dateDivider">
							<span><i class="ti ti-chevron-up"></i> {{ item.nextText }}</span>
							<span style="height: 1em; width: 1px; background: var(--MI_THEME-divider);"></span>
							<span>{{ item.prevText }} <i class="ti ti-chevron-down"></i></span>
						</div>
					</template>
				</TransitionGroup>
				<div v-if="canFetchNewer">
					<MkButton :class="$style.more" :wait="fetchingNewer" primary rounded @click="fetchNewerMessages">{{ i18n.ts.loadMore }}</MkButton>
				</div>
			</div>
		</div>
	</div>

	<div v-else-if="tab === 'search'" class="_spacer" style="--MI_SPACER-w: 700px;">
		<XAgentSearch
			:sessionId="sessionId"
			:assistantName="character?.name ?? null"
			:assistantAvatarUrl="assistantAvatarUrl"
			@scrollToMessage="handleScrollToMessageFromSearch"
			@messageDeleted="onAgentMessageDeleted"
		/>
	</div>

	<div v-else-if="tab === 'memory'" class="_spacer" style="--MI_SPACER-w: 700px;">
		<div v-if="loading" class="_gaps">
			<MkLoading/>
		</div>
		<div v-else class="_gaps">
			<MkInfo v-if="session == null">{{ i18n.ts.somethingHappened }}</MkInfo>
			<template v-else>
				<MkInfo>
					<span :class="$style.sessionMemoryHint">{{ i18n.ts._agents.sessionMemoryHint }}</span>
				</MkInfo>
				<MkInfo v-if="moderationLocksSessionWrites" warn>{{ moderationBlockUserMessage }}</MkInfo>
				<div v-if="contextWindowTruncated && contextWindowBoundaryId" :class="$style.memContextDividerRow">
					<MkButton rounded primary @click="scrollToContextWindowDivider">
						<i class="ti ti-messages"/>
						{{ i18n.ts._agents.sessionMemoryLocateContextDivider }}
					</MkButton>
				</div>
				<MkSwitch v-model="memLongMemoryEnabled" :disabled="memSaving || moderationLocksSessionWrites">
					<template #label>{{ i18n.ts._agents.sessionMemoryEnable }}</template>
				</MkSwitch>
				<FormSplit :minWidth="260">
					<MkInput v-model="memTopK" type="text" :disabled="memSaving || moderationLocksSessionWrites">
						<template #label>{{ i18n.ts._agents.sessionMemoryTopK }}</template>
						<template #caption>{{ i18n.ts._agents.sessionMemoryTopKCaption }}</template>
					</MkInput>
					<MkInput v-model="memInject" type="text" :disabled="memSaving || moderationLocksSessionWrites">
						<template #label>{{ i18n.ts._agents.sessionMemoryInjectMaxChars }}</template>
					</MkInput>
				</FormSplit>
				<MkInput v-model="memAddMaxRounds" type="text" :disabled="memSaving || moderationLocksSessionWrites">
					<template #label>{{ i18n.ts._agents.sessionMemoryAddMaxRounds }}</template>
					<template #caption>{{ addMemRoundsCaption }}</template>
				</MkInput>
				<MkInput v-model="memAddEveryN" type="text" :disabled="memSaving || moderationLocksSessionWrites">
					<template #label>{{ i18n.ts._agents.sessionMemoryAddEveryNRounds }}</template>
					<template #caption>{{ addMemEveryNCaption }}</template>
				</MkInput>
				<MkInput v-model="memMinScore" type="text" :disabled="memSaving || moderationLocksSessionWrites">
					<template #label>{{ i18n.ts._agents.sessionMemoryMinScore }}</template>
					<template #caption>{{ i18n.ts._agents.sessionMemoryMinScoreCaption }}</template>
				</MkInput>
				<div>
					<MkButton primary rounded :disabled="memSaving || moderationLocksSessionWrites" @click="saveMemorySessionSettings">
						<template v-if="memSaving"><MkLoading :em="true"/></template>
						<template v-else>{{ i18n.ts.save }}</template>
					</MkButton>
				</div>

				<hr :class="$style.memDivider">

				<div class="_gaps_s">
					<div :class="$style.memNodesHeader">
						<span :class="$style.settingLabel">{{ i18n.ts._agents.sessionMemoryNodesTitle }}</span>
						<div :class="$style.memNodesActions">
							<MkButton rounded small :disabled="memoryListLoading" @click="loadMemoryNodes">
								<i class="ti ti-refresh"/>
							</MkButton>
						</div>
					</div>
					<MkInfo warn>{{ i18n.ts._agents.sessionMemoryNodesHint }}</MkInfo>
				</div>

				<div v-if="memoryListLoading" class="_gaps">
					<MkLoading/>
				</div>
				<template v-else>
					<div class="_gaps">
						<MkTextarea v-model="newMemoryText" :disabled="memoryMutating || moderationLocksSessionWrites" tall pre>
							<template #label>{{ i18n.ts._agents.sessionMemoryAddLabel }}</template>
						</MkTextarea>
						<MkButton primary rounded :disabled="memoryMutating || moderationLocksSessionWrites || newMemoryText.trim() === ''" @click="submitNewMemory">
							<template v-if="memoryMutating"><MkLoading :em="true"/></template>
							<template v-else>{{ i18n.ts._agents.sessionMemoryAddSubmit }}</template>
						</MkButton>
					</div>

					<div v-if="memoryNodes.length === 0" class="_note">{{ i18n.ts._agents.sessionMemoryNodesEmpty }}</div>
					<div v-else class="_gaps">
						<div
							v-for="node in memoryNodes"
							:key="node.memoryNodeId"
							:class="$style.memCard"
						>
							<div v-if="editingMemoryId === node.memoryNodeId" class="_gaps">
								<MkTextarea v-model="editingMemoryText" :disabled="memoryMutating || moderationLocksSessionWrites" tall pre/>
								<div :class="$style.memCardActions">
									<MkButton rounded :disabled="memoryMutating || moderationLocksSessionWrites" @click="cancelEditMemory">{{ i18n.ts.cancel }}</MkButton>
									<MkButton primary rounded :disabled="memoryMutating || moderationLocksSessionWrites || editingMemoryText.trim() === ''" @click="submitEditMemory(node.memoryNodeId)">
										<template v-if="memoryMutating"><MkLoading :em="true"/></template>
										<template v-else>{{ i18n.ts.save }}</template>
									</MkButton>
								</div>
							</div>
							<template v-else>
								<div :class="$style.memMeta">
									<span v-if="node.updatedAt != null">{{ formatMemTs(node.updatedAt) }}</span>
									<span v-else-if="node.createdAt != null">{{ formatMemTs(node.createdAt) }}</span>
								</div>
								<div :class="$style.memContent">{{ node.content }}</div>
								<div :class="$style.memCardActions">
									<MkButton rounded danger :disabled="memoryMutating || moderationLocksSessionWrites" @click="confirmDeleteMemory(node.memoryNodeId)">
										{{ i18n.ts.delete }}
									</MkButton>
									<MkButton rounded :disabled="memoryMutating || moderationLocksSessionWrites" @click="startEditMemory(node)">
										{{ i18n.ts.edit }}
									</MkButton>
								</div>
							</template>
						</div>
					</div>

					<div v-if="memoryTotalPages > 1" :class="$style.memPager">
						<MkButton rounded small :disabled="memoryMutating || moderationLocksSessionWrites || memoryPage <= 1" @click="memoryPrevPage">
							{{ i18n.ts._agents.sessionMemoryPrevPage }}
						</MkButton>
						<span>{{ memoryPage }} / {{ memoryTotalPages }}</span>
						<MkButton rounded small :disabled="memoryMutating || moderationLocksSessionWrites || memoryPage >= memoryTotalPages" @click="memoryNextPage">
							{{ i18n.ts._agents.sessionMemoryNextPage }}
						</MkButton>
					</div>
				</template>
			</template>
		</div>
	</div>

	<div v-else-if="tab === 'style'" class="_spacer" style="--MI_SPACER-w: 700px;">
		<div v-if="loading" class="_gaps">
			<MkLoading/>
		</div>
		<div v-else class="_gaps">
			<MkInfo v-if="session == null">{{ i18n.ts.somethingHappened }}</MkInfo>
			<template v-else>
				<MkInfo v-if="moderationLocksSessionWrites" warn>{{ moderationBlockUserMessage }}</MkInfo>
				<div class="_gaps_s">
					<div :class="$style.settingTitleRow">
						<span :class="$style.settingLabel">{{ i18n.ts._agents.sessionDialogueStyle }}</span>
						<span :class="$style.settingValue">{{ selectedStyleMeta?.name ?? (session.dialogueStyleId ? '-' : i18n.ts._agents.sessionStyleNotSelected) }}</span>
					</div>
					<MkInfo v-if="usableStyles.length === 0">{{ i18n.ts._agents.sessionNoUsableStyles }}</MkInfo>
					<div v-else :class="$style.selectCardList">
						<div
							v-for="s in usableStyles"
							:key="s.id"
							v-panel
							:class="[$style.selectCard, styleCardSelectionId === s.id ? $style.selectCardActive : '']"
						>
							<div :class="$style.selectCardMain">
								<div :class="$style.selectCardHead">
									<div :class="$style.selectCardTitleWrap">
										<div :class="$style.selectCardTitle">{{ s.name }}</div>
										<div :class="$style.selectCardSub">
											<span v-if="!s.isMine && s.subscribed" class="_acrylicBadge">{{ i18n.ts._agents.subscribedFromPlazaBadge }}</span>
											<span v-if="s.isMine && s.reviewStatus === 'pending'" class="_acrylicBadge">{{ i18n.ts._agents.pendingReviewBadge }}</span>
											<span v-else-if="s.isMine && s.reviewStatus === 'rejected' && !s.isPublished" class="_acrylicBadge">{{ i18n.ts._agents.rejectedReviewBadge }}</span>
											<span v-else-if="s.isMine && s.isPublished" class="_acrylicBadge">{{ i18n.ts._agents.publishedBadge }}</span>
											<span v-else-if="s.isMine" class="_acrylicBadge">{{ i18n.ts._agents.draftBadge }}</span>
										</div>
									</div>
									<MkButton
										rounded
										:primary="styleCardSelectionId !== s.id"
										:disabled="savingSettings || moderationLocksSessionWrites || styleCardSelectionId === s.id"
										@click="chooseStyle(s.id)"
									>
										{{ styleCardSelectionId === s.id ? i18n.ts.enabled : i18n.ts._agents.sessionPickButton }}
									</MkButton>
								</div>
								<p v-if="s.summary" :class="$style.selectCardDesc">{{ s.summary }}</p>
								<p v-else-if="s.bodyPreview" :class="$style.selectCardDesc">{{ s.bodyPreview }}</p>
								<div :class="$style.stylePlazaRow">
									<span :class="$style.stylePlazaLabel"><i class="ti ti-star"/> {{ i18n.ts._agents.plazaMetricRating }}</span>
									<template v-if="s.rating.count === 0">
										<span :class="$style.stylePlazaMuted">{{ i18n.ts._agents.plazaRatingNone }}</span>
									</template>
									<template v-else>
										<span :class="$style.stylePlazaStars" aria-hidden="true">{{ styleUsableStarVisual(s.rating.average) }}</span>
										<span>{{ styleUsableAverageText(s.rating.average) }} · {{ s.rating.count }} {{ i18n.ts._agents.plazaRatingCountSuffix }}</span>
									</template>
									<span :class="$style.stylePlazaSep">·</span>
									<span :class="$style.stylePlazaLabel"><i class="ti ti-messages"/> {{ i18n.ts._agents.plazaMetricConversations }}</span>
									<span>{{ s.conversationCount }}</span>
									<span :class="$style.stylePlazaSep">·</span>
									<span :class="$style.stylePlazaLabel"><i class="ti ti-robot"/> {{ i18n.ts._agents.plazaMetricAiReplies }}</span>
									<span>{{ s.aiReplyCount }}</span>
								</div>
								<div :class="$style.selectCardMeta">
									<span :class="$style.metaLabel"><i class="ti ti-user-heart"></i> {{ i18n.ts._agents.cardCreator }}</span>
									<div :class="$style.metaAuthor">
										<MkAvatar :user="s.user" class="_noSelect" link preview/>
										<MkUserName :user="s.user" :nowrap="false"/>
									</div>
								</div>
								<div :class="$style.selectCardTimes">
									<span :class="$style.timeChip">
										<i class="ti ti-calendar-plus"></i>
										{{ i18n.ts._agents.cardCreated }}
										<MkTime :time="s.createdAt" mode="relative"/>
									</span>
									<span :class="$style.timeChip">
										<i class="ti ti-history"></i>
										{{ i18n.ts._agents.cardUpdated }}
										<MkTime :time="s.updatedAt" mode="relative"/>
									</span>
								</div>
							</div>
						</div>
					</div>
				</div>
			</template>
		</div>
	</div>

	<div v-else-if="tab === 'model'" class="_spacer" style="--MI_SPACER-w: 700px;">
		<div v-if="loading" class="_gaps">
			<MkLoading/>
		</div>
		<div v-else class="_gaps">
			<MkInfo v-if="session == null">{{ i18n.ts.somethingHappened }}</MkInfo>
			<template v-else>
				<MkInfo v-if="moderationLocksSessionWrites" warn>{{ moderationBlockUserMessage }}</MkInfo>
				<div v-if="agentModels.length > 0" class="_gaps_s">
					<div :class="$style.settingTitleRow">
						<span :class="$style.settingLabel">{{ i18n.ts._agents.sessionModel }}</span>
						<span :class="$style.settingValue">{{ selectedModelMeta?.name ?? '-' }}</span>
					</div>
					<div :class="$style.selectCardList">
						<div
							v-for="m in agentModels"
							:key="m.id"
							v-panel
							:class="[$style.selectCard, modelCardSelectionId === m.id ? $style.selectCardActive : '']"
						>
							<div :class="$style.selectCardMain">
								<div :class="$style.selectCardHead">
									<div :class="$style.selectCardTitleWrap">
										<div :class="$style.selectCardTitle">{{ m.name }}</div>
									</div>
									<MkButton
										rounded
										:primary="modelCardSelectionId !== m.id"
										:disabled="savingSettings || moderationLocksSessionWrites || modelCardSelectionId === m.id"
										@click="chooseModel(m.id)"
									>
										{{ modelCardSelectionId === m.id ? i18n.ts.enabled : i18n.ts._agents.sessionPickButton }}
									</MkButton>
								</div>
								<p v-if="m.description" :class="$style.selectCardDesc">{{ m.description }}</p>
								<div :class="$style.modelSpecGrid">
									<div :class="$style.modelSpecItem">
										<span :class="$style.modelSpecLabel">{{ i18n.ts._agents.maxContextTokens }}</span>
										<span :class="$style.modelSpecValue">{{ formatTokenCount(m.maxContextTokens) }}</span>
									</div>
									<div :class="$style.modelSpecItem">
										<span :class="$style.modelSpecLabel">{{ i18n.ts._agents.maxOutputTokens }}</span>
										<span :class="$style.modelSpecValue">{{ formatTokenCount(m.maxOutputTokensPerCall) }}</span>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
				<MkInfo v-else warn>{{ i18n.ts._agents.sessionModelNoModels }}</MkInfo>
			</template>
		</div>
	</div>

	<template #footer>
		<div v-if="tab === 'chat' && !loading && session" :class="$style.footer">
			<MkInfo v-if="moderationLocksSessionWrites" warn :class="$style.composeStyleHint">{{ moderationBlockUserMessage }}</MkInfo>
			<MkInfo v-else-if="chatComposeBlockedNeedStyle" :class="$style.composeStyleHint">{{ i18n.ts._agents.chatComposeNeedStyleHint }}</MkInfo>
			<div v-if="memoryAddHintVisible" :class="$style.memAddHint" role="status">
				<i class="ti ti-loader-2" :class="$style.memAddHintIcon"></i>
				<span>{{ i18n.ts._agents.longTermMemoryAddScheduledHint }}</span>
			</div>
			<XForm ref="formRef" :class="$style.form" :disabled="chatComposeDisabled" :sending="sending" @submit="onFormSubmit"/>
		</div>
	</template>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';
import { getScrollContainer } from '@@/js/scroll.js';
import MkLoading from '@/components/global/MkLoading.vue';
import MkAvatar from '@/components/global/MkAvatar.vue';
import MkUserName from '@/components/global/MkUserName.vue';
import MkTime from '@/components/global/MkTime.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkInput from '@/components/MkInput.vue';
import MkButton from '@/components/MkButton.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import FormSplit from '@/components/form/split.vue';
import { formatDateTimeString } from '@/utility/format-time-string.js';
import { misskeyApi, formatApiError } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import * as os from '@/os.js';
import type { PageHeaderItem } from '@/types/page-header.js';
import { fetchInstance, instance } from '@/instance.js';
import { makeDateSeparatedTimelineComputedRef, type DateSeparetedTimelineItem } from '@/utility/timeline-date-separate.js';
import { useMutationObserver } from '@/composables/use-mutation-observer.js';
import { prefer } from '@/preferences.js';
import XAgentMessage from './agent-session.message.vue';
import XForm from './agent-session.form.vue';
import XAgentSearch from './agent-session.search.vue';
import type { AgentsStylesListUsableResponse } from 'misskey-js/entities.js';

const props = defineProps<{
	sessionId: string;
	messageId?: string;
}>();
const sessionId = props.sessionId;

const PAGE_LIMIT = 30;

type AgentMsg = { id: string; role: string; content: string; createdAt: string };

const messages = ref<AgentMsg[]>([]);
const loading = ref(true);
const chatInitializing = ref(false);
const sending = ref(false);
const canFetchMore = ref(false);
const canFetchNewer = ref(false);
const moreFetching = ref(false);
const fetchingNewer = ref(false);
const highlightedMessageId = ref<string | null>(null);
let highlightTimeoutId: number | null = null;
const session = ref<{
	name: string;
	sessionKind: 'draft_test' | 'community';
	dialogueStyleId: string | null;
	agentModelId: string | null;
	characterId: string;
	agentLongMemoryEnabled?: boolean;
	agentLongMemoryTopK?: number;
	agentLongMemoryMinScore?: number | null;
	agentLongMemoryInjectMaxChars?: number;
	agentLongMemoryAddMaxRounds?: number | null;
	agentLongMemoryAddEveryNRounds?: number | null;
	agentReplyPending?: boolean;
	sessionModerationBanned?: boolean;
	characterModerationBanned?: boolean;
} | null>(null);

const character = ref<{ name: string; avatarFileId: string | null } | null>(null);
const assistantAvatarUrl = ref<string | null>(null);

const timelineEl = useTemplateRef('timelineEl');
const formRef = useTemplateRef<InstanceType<typeof XForm>>('formRef');
const timeline = makeDateSeparatedTimelineComputedRef(messages);

const timelineForChat = computed((): AgentChatTimelineItem[] => {
	const base = timeline.value;
	const boundary = contextWindowBoundaryId.value;
	if (!contextWindowTruncated.value || boundary == null || boundary === '') {
		return base;
	}
	const rev = [...base].reverse();
	const out: AgentChatTimelineItem[] = [];
	for (const it of rev) {
		if (it.type === 'item' && it.data.id === boundary) {
			out.push({ id: `ctx-win-${boundary}`, type: 'contextWindow' });
		}
		out.push(it);
	}
	return out.reverse();
});

async function refreshContextWindow() {
	if (!session.value) return;
	if (!session.value.dialogueStyleId) {
		contextWindowTruncated.value = false;
		contextWindowBoundaryId.value = null;
		return;
	}
	try {
		const res = await misskeyApi('agents/sessions/context-window', { sessionId });
		contextWindowTruncated.value = res.truncated;
		contextWindowBoundaryId.value = res.oldestIncludedMessageId;
	} catch {
		contextWindowTruncated.value = false;
		contextWindowBoundaryId.value = null;
	}
}

const SCROLL_HEAD_THRESHOLD = 200;

useMutationObserver(timelineEl, {
	subtree: true,
	childList: true,
	attributes: false,
}, () => {
	if (canFetchNewer.value) return;
	const el = timelineEl.value;
	if (el == null) return;
	const scrollContainer = getScrollContainer(el);
	if (scrollContainer == null) return;
	if (-scrollContainer.scrollTop < SCROLL_HEAD_THRESHOLD) {
		scrollContainer.scrollTo({
			top: 0,
			behavior: 'instant',
		});
	}
});

const savingSettings = ref(false);
const usableStyles = ref<AgentsStylesListUsableResponse>([]);

function styleUsableStarVisual(avg: number | null | undefined): string {
	if (avg == null || !Number.isFinite(avg)) return '—';
	const full = Math.max(0, Math.min(5, Math.round(avg)));
	return '★'.repeat(full) + '☆'.repeat(5 - full);
}
function styleUsableAverageText(avg: number | null | undefined): string {
	if (avg == null || !Number.isFinite(avg)) return '—';
	return avg.toFixed(2);
}
const selectedModelId = ref('');
const selectedStyleId = ref('');
const tab = ref('chat');
const settingsHydrating = ref(false);
const memSaving = ref(false);
const memLongMemoryEnabled = ref(true);
const memTopK = ref('8');
const memMinScore = ref('');
const memInject = ref('4000');
const memAddMaxRounds = ref('');
const memAddEveryN = ref('');

const addMemRoundsCaption = computed(() => {
	const raw = instance.agentMem0AddMemoryMaxRounds;
	const n = typeof raw === 'number' && Number.isFinite(raw) ? Math.max(1, Math.min(24, Math.trunc(raw))) : 3;
	return i18n.tsx._agents.sessionMemoryAddMaxRoundsCaption({ n });
});

const addMemEveryNCaption = computed(() => {
	const raw = instance.agentMem0AddMemoryEveryNRounds;
	const n = typeof raw === 'number' && Number.isFinite(raw) ? Math.max(1, Math.min(48, Math.trunc(raw))) : 1;
	return i18n.tsx._agents.sessionMemoryAddEveryNRoundsCaption({ n });
});

const MEMORY_PAGE_SIZE = 20;
const memoryNodes = ref<{ memoryNodeId: string; content: string; createdAt: number | null; updatedAt: number | null }[]>([]);
const memoryListLoading = ref(false);
const memoryMutating = ref(false);
const memoryPage = ref(1);
const memoryTotal = ref(0);
const newMemoryText = ref('');
const editingMemoryId = ref<string | null>(null);
const editingMemoryText = ref('');

const showLongMemoryTab = computed(() => Boolean((instance as Record<string, unknown>).agentLongMemoryConfigured));

const moderationLocksSessionWrites = computed(() => {
	const s = session.value;
	if (s == null) return false;
	return s.characterModerationBanned === true || s.sessionModerationBanned === true;
});

/** 展示文案：角色封禁优先于会话封禁 */
const moderationBlockKind = computed((): 'character' | 'session' | null => {
	const s = session.value;
	if (s == null) return null;
	if (s.characterModerationBanned === true) return 'character';
	if (s.sessionModerationBanned === true) return 'session';
	return null;
});

const moderationBlockUserMessage = computed((): string => {
	if (moderationBlockKind.value === 'character') return i18n.ts._agents.chatModerationBlockedCharacter;
	if (moderationBlockKind.value === 'session') return i18n.ts._agents.chatModerationBlockedSession;
	return '';
});

const chatComposeDisabled = computed(() => {
	if (loading.value || chatInitializing.value || session.value == null) return true;
	if (moderationLocksSessionWrites.value) return true;
	return session.value.dialogueStyleId == null || session.value.dialogueStyleId === '';
});

/** 仅因未选对话风格而禁用输入时，在输入区上方展示说明（与加载中区分）。 */
const chatComposeBlockedNeedStyle = computed(() => {
	if (session.value == null || loading.value || chatInitializing.value) return false;
	return session.value.dialogueStyleId == null || session.value.dialogueStyleId === '';
});

const memoryAddHintVisible = ref(false);
let memoryAddHintTimer: number | null = null;

const contextWindowTruncated = ref(false);
const contextWindowBoundaryId = ref<string | null>(null);
const highlightedContextDivider = ref(false);
let contextDividerHighlightTimer: number | null = null;

type AgentChatTimelineItem =
	| DateSeparetedTimelineItem<AgentMsg>
	| { id: string; type: 'contextWindow' };

let replyPollTimer: number | null = null;

function stopReplyPendingPoll() {
	if (replyPollTimer != null) {
		window.clearInterval(replyPollTimer);
		replyPollTimer = null;
	}
}

async function pollSessionReplyState() {
	try {
		const row = await misskeyApi('agents/sessions/show', { sessionId });
		if (session.value != null) {
			Object.assign(session.value, row);
		} else {
			session.value = row;
		}
	} catch {
		// ignore
	}
}

function startReplyPendingPoll() {
	stopReplyPendingPoll();
	const tick = async () => {
		await pollSessionReplyState();
		if (!session.value?.agentReplyPending) {
			stopReplyPendingPoll();
			sending.value = false;
			try {
				await loadInitialTimeline();
				await scrollToLatest();
				await refreshContextWindow();
			} catch {
				// ignore
			}
		}
	};
	void tick();
	replyPollTimer = window.setInterval(() => void tick(), 2500);
}

function isAgentReplyPendingError(e: unknown): boolean {
	return e != null && typeof e === 'object' && (e as { code?: string }).code === 'AGENT_REPLY_PENDING';
}

const memoryTotalPages = computed(() => Math.max(1, Math.ceil(memoryTotal.value / MEMORY_PAGE_SIZE)));

const agentModels = computed(() => {
	const raw = (instance as Record<string, unknown>).agentModels;
	if (!raw || !Array.isArray(raw)) return [] as {
		id: string;
		name: string;
		description: string | null;
		maxContextTokens: number;
		maxOutputTokensPerCall: number;
	}[];
	return raw as {
		id: string;
		name: string;
		description: string | null;
		maxContextTokens: number;
		maxOutputTokensPerCall: number;
	}[];
});

/** Matches server MetaLite: site default id, or first configured model. */
const resolvedInstanceDefaultModelId = computed(() => {
	const models = agentModels.value;
	if (models.length === 0) return '';
	const raw = (instance as Record<string, unknown>).agentDefaultModelId;
	if (typeof raw === 'string' && raw.trim() !== '') {
		const id = raw.trim();
		if (models.some(m => m.id === id)) return id;
	}
	return models[0]!.id;
});

function displayModelIdForSession(agentModelId: string | null | undefined): string {
	const fallback = resolvedInstanceDefaultModelId.value;
	if (agentModelId && agentModels.value.some(m => m.id === agentModelId)) {
		return agentModelId;
	}
	return fallback;
}

/** 卡片高亮与「启用」按钮仅针对列表内存在的 id（与会话解析后的模型一致）。 */
const modelCardSelectionId = computed(() => {
	const id = selectedModelId.value;
	if (!id || !agentModels.value.some(m => m.id === id)) {
		return '';
	}
	return id;
});

/** 仅在可用列表内高亮，避免会话引用已不可用预设时误显示「启用」。 */
const styleCardSelectionId = computed(() => {
	const id = selectedStyleId.value;
	if (!id || !usableStyles.value.some(s => s.id === id)) {
		return '';
	}
	return id;
});

const selectedStyleMeta = computed(() => usableStyles.value.find(s => s.id === selectedStyleId.value) ?? null);
const selectedModelMeta = computed(() => agentModels.value.find(m => m.id === selectedModelId.value) ?? null);

function formatTokenCount(value: unknown): string {
	const n = typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(n)) {
		return '—';
	}
	return `${Math.max(0, Math.trunc(n)).toLocaleString()} tokens`;
}

const headerTabs = computed(() => {
	const tabs = [
		{
			key: 'chat',
			title: i18n.ts._chat.messages,
			icon: 'ti ti-messages',
		},
		{
			key: 'search',
			title: i18n.ts.search,
			icon: 'ti ti-search',
		},
	];
	if (showLongMemoryTab.value) {
		tabs.push({
			key: 'memory',
			title: i18n.ts._agents.sessionMemoryTab,
			icon: 'ti ti-brain',
		});
	}
	tabs.push({
		key: 'model',
		title: i18n.ts._agents.sessionModelTab,
		icon: 'ti ti-cpu',
	});
	tabs.push({
		key: 'style',
		title: i18n.ts._agents.sessionDialogueStyle,
		icon: 'ti ti-message-cog',
	});
	return tabs;
});

const headerActions = computed<PageHeaderItem[]>(() => [
	{
		icon: 'ti ti-pencil',
		text: i18n.ts._agents.renameSession,
		handler: () => { void renameSession(); },
	},
]);

definePage(computed(() => ({
	title: session.value?.name ?? i18n.ts._agents.sessionChat,
	icon: 'ti ti-message',
	subtitle: session.value
		? (session.value.sessionKind === 'draft_test' ? i18n.ts._agents.sessionKindDraft : i18n.ts._agents.sessionKindCommunity)
		: undefined,
	hideMobileFooter: tab.value === 'chat' || tab.value === 'search',
})));

watch(tab, (v) => {
	if (v === 'chat') {
		void nextTick(() => {
			formRef.value?.focus();
			if (session.value != null && messages.value.length > 0) {
				void refreshContextWindow();
			}
		});
	} else if (v === 'memory' && session.value != null) {
		void refreshContextWindow();
		void loadMemoryNodes();
	}
});

watch(showLongMemoryTab, (v) => {
	if (!v && tab.value === 'memory') {
		tab.value = 'chat';
	}
});

/** Instance meta（含 agentModels）晚于会话加载时，或本地 id 已不在列表中时，与会话解析结果对齐。 */
watch(
	[agentModels, () => session.value?.agentModelId],
	() => {
		if (!session.value || settingsHydrating.value || savingSettings.value) return;
		const resolved = displayModelIdForSession(session.value.agentModelId);
		if (resolved === '') return;
		if (selectedModelId.value === '' || !agentModels.value.some(m => m.id === selectedModelId.value)) {
			selectedModelId.value = resolved;
		}
	},
);

async function renameSession() {
	if (!session.value) return;
	const { canceled, result } = await os.inputText({
		title: i18n.ts._agents.renameSession,
		default: session.value.name,
		minLength: 1,
		maxLength: 256,
	});
	if (canceled || result == null) return;
	const name = result.trim();
	if (!name) return;
	try {
		await misskeyApi('agents/sessions/update', { sessionId, name });
		await loadSession();
	} catch (e) {
		os.alert({ type: 'error', text: formatApiError(e) });
	}
}

async function scrollToLatest() {
	await nextTick();
	const el = timelineEl.value;
	if (el == null) return;
	const scrollContainer = getScrollContainer(el);
	scrollContainer?.scrollTo({ top: 0, behavior: 'instant' });
}

async function loadSession() {
	settingsHydrating.value = true;
	try {
		session.value = await misskeyApi('agents/sessions/show', { sessionId });
		if (session.value) {
			selectedModelId.value = displayModelIdForSession(session.value.agentModelId);
			selectedStyleId.value = session.value.dialogueStyleId ?? '';
			memLongMemoryEnabled.value = session.value.agentLongMemoryEnabled ?? true;
			memTopK.value = String(session.value.agentLongMemoryTopK ?? 8);
			memMinScore.value = session.value.agentLongMemoryMinScore == null ? '' : String(session.value.agentLongMemoryMinScore);
			memInject.value = String(session.value.agentLongMemoryInjectMaxChars ?? 4000);
			memAddMaxRounds.value = session.value.agentLongMemoryAddMaxRounds == null ? '' : String(session.value.agentLongMemoryAddMaxRounds);
			memAddEveryN.value = session.value.agentLongMemoryAddEveryNRounds == null ? '' : String(session.value.agentLongMemoryAddEveryNRounds);
			await loadCharacter(session.value.characterId);
		}
	} catch {
		session.value = null;
		character.value = null;
		assistantAvatarUrl.value = null;
		contextWindowTruncated.value = false;
		contextWindowBoundaryId.value = null;
	} finally {
		await nextTick();
		settingsHydrating.value = false;
	}
	if (tab.value === 'chat' && session.value != null && messages.value.length > 0) {
		void refreshContextWindow();
	}
}

async function loadCharacter(characterId: string) {
	try {
		const c = await misskeyApi('agents/characters/show', { characterId });
		character.value = { name: c.name, avatarFileId: c.avatarFileId };
		if (c.avatarFileId) {
			const f = await misskeyApi('drive/files/show', { fileId: c.avatarFileId });
			assistantAvatarUrl.value = f.thumbnailUrl ?? f.url ?? null;
		} else {
			assistantAvatarUrl.value = null;
		}
	} catch {
		character.value = null;
		assistantAvatarUrl.value = null;
	}
}

async function loadUsableStyles() {
	try {
		usableStyles.value = await misskeyApi('agents/styles/list-usable', {});
	} catch {
		usableStyles.value = [];
	}
}

function onModelSelect() {
	if (settingsHydrating.value || !session.value || savingSettings.value || moderationLocksSessionWrites.value) return;
	void applyModel();
}

function onStyleSelect() {
	if (settingsHydrating.value || !session.value || savingSettings.value || moderationLocksSessionWrites.value) return;
	void applyStyle();
}

function chooseStyle(styleId: string) {
	selectedStyleId.value = styleId;
	void onStyleSelect();
}

function chooseModel(modelId: string) {
	selectedModelId.value = modelId;
	void onModelSelect();
}

async function applyModel() {
	if (!session.value || savingSettings.value || moderationLocksSessionWrites.value) return;
	savingSettings.value = true;
	try {
		const defId = resolvedInstanceDefaultModelId.value;
		const picked = selectedModelId.value;
		const agentModelId = picked === '' || picked === defId ? null : picked;
		await misskeyApi('agents/sessions/update', { sessionId, agentModelId });
		await loadSession();
	} catch (e) {
		os.alert({ type: 'error', text: formatApiError(e) });
		await loadSession();
	} finally {
		savingSettings.value = false;
	}
}

async function applyStyle() {
	if (!session.value || savingSettings.value || moderationLocksSessionWrites.value) return;
	const sid = selectedStyleId.value.trim();
	if (!sid) return;
	savingSettings.value = true;
	try {
		await misskeyApi('agents/sessions/update', { sessionId, dialogueStyleId: sid });
		await loadSession();
	} catch (e) {
		os.alert({ type: 'error', text: formatApiError(e) });
		await loadSession();
	} finally {
		savingSettings.value = false;
	}
}

async function loadInitialTimeline() {
	const list = await misskeyApi('agents/messages/timeline', {
		sessionId,
		limit: PAGE_LIMIT,
	});
	messages.value = list;
	canFetchMore.value = list.length === PAGE_LIMIT;
	canFetchNewer.value = false;
	await scrollToLatest();
	await refreshContextWindow();
}

async function loadContextAround(targetId: string, limit = PAGE_LIMIT) {
	chatInitializing.value = true;
	messages.value = [];
	canFetchMore.value = false;
	canFetchNewer.value = false;
	try {
		const target = await misskeyApi('agents/messages/show', {
			sessionId,
			messageId: targetId,
		}) as AgentMsg;
		const [older, newer] = await Promise.all([
			misskeyApi('agents/messages/timeline', { sessionId, limit, untilId: targetId }),
			misskeyApi('agents/messages/timeline', { sessionId, limit, sinceId: targetId }),
		]) as [AgentMsg[], AgentMsg[]];
		const newerDesc = [...newer].reverse();
		messages.value = [...newerDesc, target, ...older];
		canFetchMore.value = older.length === limit;
		canFetchNewer.value = newer.length === limit;
	} catch (e) {
		os.alert({ type: 'error', text: formatApiError(e) });
		await loadInitialTimeline();
	} finally {
		chatInitializing.value = false;
	}
	await refreshContextWindow();
}

async function fetchOlderMessages() {
	if (moreFetching.value || messages.value.length === 0) return;
	moreFetching.value = true;
	try {
		const tailId = messages.value[messages.value.length - 1]!.id;
		const list = await misskeyApi('agents/messages/timeline', {
			sessionId,
			limit: PAGE_LIMIT,
			untilId: tailId,
		}) as AgentMsg[];
		messages.value.push(...list);
		canFetchMore.value = list.length === PAGE_LIMIT;
	} catch (e) {
		os.alert({ type: 'error', text: formatApiError(e) });
	} finally {
		moreFetching.value = false;
	}
	await refreshContextWindow();
}

async function fetchNewerMessages() {
	if (fetchingNewer.value || messages.value.length === 0) return;
	fetchingNewer.value = true;
	try {
		const headId = messages.value[0]!.id;
		const list = await misskeyApi('agents/messages/timeline', {
			sessionId,
			limit: PAGE_LIMIT,
			sinceId: headId,
		}) as AgentMsg[];
		if (list.length > 0) {
			const reversed = [...list].reverse();
			messages.value.unshift(...reversed);
		}
		canFetchNewer.value = list.length === PAGE_LIMIT;
	} catch (e) {
		os.alert({ type: 'error', text: formatApiError(e) });
	} finally {
		fetchingNewer.value = false;
	}
	await refreshContextWindow();
}

function onAgentMessageDeleted(messageId: string) {
	const idx = messages.value.findIndex(m => m.id === messageId);
	if (idx !== -1) messages.value.splice(idx, 1);
	if (highlightedMessageId.value === messageId) highlightedMessageId.value = null;
	void refreshContextWindow();
}

async function scrollToMessage(targetMessageId: string) {
	if (highlightTimeoutId != null) {
		window.clearTimeout(highlightTimeoutId);
		highlightTimeoutId = null;
	}
	highlightedMessageId.value = null;

	const performScrollAndHighlight = (targetEl: HTMLElement) => {
		targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
		highlightTimeoutId = window.setTimeout(() => {
			highlightedMessageId.value = targetMessageId;
			highlightTimeoutId = window.setTimeout(() => {
				highlightedMessageId.value = null;
				highlightTimeoutId = null;
			}, 1000);
		}, 500);
	};

	const queryTargetEl = (): HTMLElement | null => {
		const sel = `[data-message-id="${CSS.escape(targetMessageId)}"]`;
		const root = timelineEl.value;
		if (root) {
			const inTimeline = root.querySelector(sel) as HTMLElement | null;
			if (inTimeline) return inTimeline;
		}
		return window.document.querySelector(sel) as HTMLElement | null;
	};

	const tryScrollToTarget = async (maxRetries: number, intervalMs: number): Promise<boolean> => {
		for (let i = 0; i < maxRetries; i++) {
			const el = queryTargetEl();
			if (el) {
				performScrollAndHighlight(el);
				return true;
			}
			if (i < maxRetries - 1) {
				await new Promise(r => window.setTimeout(r, intervalMs));
			}
		}
		return false;
	};

	if (await tryScrollToTarget(4, 100)) return;

	if (messages.value.some(m => m.id === targetMessageId)) {
		await nextTick();
		await nextTick();
		if (await tryScrollToTarget(12, 80)) return;
	}

	await loadContextAround(targetMessageId);
	await nextTick();
	await nextTick();
	await new Promise(r => window.setTimeout(r, 300));
	if (await tryScrollToTarget(20, 100)) return;
	await new Promise(r => window.setTimeout(r, 200));
	await tryScrollToTarget(15, 100);
}

async function handleScrollToMessageFromSearch(messageId: string) {
	tab.value = 'chat';
	await nextTick();
	await nextTick();
	await new Promise(r => window.setTimeout(r, 50));
	await scrollToMessage(messageId);
}

function clearContextDividerHighlight() {
	if (contextDividerHighlightTimer != null) {
		window.clearTimeout(contextDividerHighlightTimer);
		contextDividerHighlightTimer = null;
	}
	highlightedContextDivider.value = false;
}

/** 记忆页等：切换到对话并滚动到「上下文边界」分割线（与搜索定位消息类似）。 */
async function scrollToContextWindowDivider() {
	const boundary = contextWindowBoundaryId.value;
	if (!contextWindowTruncated.value || boundary == null || boundary === '') return;

	clearContextDividerHighlight();

	const queryDividerEl = (): HTMLElement | null => {
		const root = timelineEl.value;
		if (root == null) return null;
		return root.querySelector(`[data-agent-context-window-divider="${CSS.escape(boundary)}"]`) as HTMLElement | null;
	};

	const performScroll = (targetEl: HTMLElement) => {
		targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
		clearContextDividerHighlight();
		contextDividerHighlightTimer = window.setTimeout(() => {
			highlightedContextDivider.value = true;
			contextDividerHighlightTimer = window.setTimeout(() => {
				highlightedContextDivider.value = false;
				contextDividerHighlightTimer = null;
			}, 1200);
		}, 500);
	};

	const tryScrollOnce = (): boolean => {
		const el = queryDividerEl();
		if (el) {
			performScroll(el);
			return true;
		}
		return false;
	};

	tab.value = 'chat';
	await nextTick();
	await nextTick();
	await new Promise(r => window.setTimeout(r, 50));

	if (tryScrollOnce()) return;

	if (messages.value.some(m => m.id === boundary)) {
		await nextTick();
		await nextTick();
		await new Promise(r => window.setTimeout(r, 100));
		if (tryScrollOnce()) return;
	}

	await loadContextAround(boundary);
	await refreshContextWindow();
	await nextTick();
	await nextTick();
	await new Promise(r => window.setTimeout(r, 300));
	if (tryScrollOnce()) return;
	await new Promise(r => window.setTimeout(r, 200));
	if (tryScrollOnce()) return;

	os.alert({ type: 'error', text: i18n.ts._agents.sessionMemoryLocateContextDividerFailed });
}

onMounted(async () => {
	try {
		await fetchInstance(true);
		await loadUsableStyles();
		await loadSession();
		if (props.messageId) {
			await loadContextAround(props.messageId);
			await nextTick();
			await new Promise(r => window.setTimeout(r, 300));
			await scrollToMessage(props.messageId);
		} else {
			await loadInitialTimeline();
		}
	} catch (e) {
		os.alert({ type: 'error', text: formatApiError(e) });
	} finally {
		loading.value = false;
	}
	if (session.value?.agentReplyPending) {
		sending.value = true;
		startReplyPendingPoll();
	}
	await nextTick();
	formRef.value?.focus();
});

onBeforeUnmount(() => {
	stopReplyPendingPoll();
	clearContextDividerHighlight();
	if (memoryAddHintTimer != null) {
		window.clearTimeout(memoryAddHintTimer);
		memoryAddHintTimer = null;
	}
});

function formatMemTs(sec: number) {
	return formatDateTimeString(new Date(sec * 1000), 'yyyy-MM-dd HH:mm');
}

async function loadMemoryNodes() {
	if (!session.value) return;
	memoryListLoading.value = true;
	try {
		const res = await misskeyApi('agents/memory/list', {
			sessionId,
			pageNum: memoryPage.value,
			pageSize: MEMORY_PAGE_SIZE,
		}) as {
			memoryNodes: { memoryNodeId: string; content: string; createdAt: number | null; updatedAt: number | null }[];
			total: number;
		};
		memoryNodes.value = res.memoryNodes;
		memoryTotal.value = res.total;
		editingMemoryId.value = null;
	} catch (e) {
		memoryNodes.value = [];
		memoryTotal.value = 0;
		os.alert({ type: 'error', text: formatApiError(e) });
	} finally {
		memoryListLoading.value = false;
	}
}

function memoryPrevPage() {
	if (memoryPage.value <= 1) return;
	memoryPage.value -= 1;
	void loadMemoryNodes();
}

function memoryNextPage() {
	if (memoryPage.value >= memoryTotalPages.value) return;
	memoryPage.value += 1;
	void loadMemoryNodes();
}

function startEditMemory(node: { memoryNodeId: string; content: string }) {
	editingMemoryId.value = node.memoryNodeId;
	editingMemoryText.value = node.content;
}

function cancelEditMemory() {
	editingMemoryId.value = null;
	editingMemoryText.value = '';
}

async function submitNewMemory() {
	if (!session.value || memoryMutating.value || moderationLocksSessionWrites.value) return;
	const content = newMemoryText.value.trim();
	if (!content) return;
	memoryMutating.value = true;
	try {
		await misskeyApi('agents/memory/add', { sessionId, content });
		newMemoryText.value = '';
		os.toast(i18n.ts._agents.sessionMemoryAdded);
		memoryPage.value = 1;
		await loadMemoryNodes();
	} catch (e) {
		os.alert({ type: 'error', text: formatApiError(e) });
	} finally {
		memoryMutating.value = false;
	}
}

async function submitEditMemory(memoryNodeId: string) {
	if (!session.value || memoryMutating.value || moderationLocksSessionWrites.value) return;
	const content = editingMemoryText.value.trim();
	if (!content) return;
	memoryMutating.value = true;
	try {
		await misskeyApi('agents/memory/update', { sessionId, memoryNodeId, content });
		cancelEditMemory();
		os.toast(i18n.ts._agents.sessionMemoryUpdated);
		await loadMemoryNodes();
	} catch (e) {
		os.alert({ type: 'error', text: formatApiError(e) });
	} finally {
		memoryMutating.value = false;
	}
}

async function confirmDeleteMemory(memoryNodeId: string) {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.ts._agents.sessionMemoryDeleteConfirm,
	});
	if (canceled) return;
	if (!session.value || memoryMutating.value || moderationLocksSessionWrites.value) return;
	memoryMutating.value = true;
	try {
		await misskeyApi('agents/memory/delete', { sessionId, memoryNodeId });
		os.toast(i18n.ts._agents.sessionMemoryDeleted);
		cancelEditMemory();
		await loadMemoryNodes();
	} catch (e) {
		os.alert({ type: 'error', text: formatApiError(e) });
	} finally {
		memoryMutating.value = false;
	}
}

async function saveMemorySessionSettings() {
	if (!session.value || memSaving.value || moderationLocksSessionWrites.value) return;
	const topK = Math.trunc(Number(memTopK.value));
	const inj = Math.trunc(Number(memInject.value));
	if (!Number.isFinite(topK) || topK < 1 || topK > 100) {
		os.alert({ type: 'error', text: i18n.ts._agents.sessionMemoryTopKInvalid });
		return;
	}
	if (!Number.isFinite(inj) || inj < 200 || inj > 50000) {
		os.alert({ type: 'error', text: i18n.ts._agents.sessionMemoryInjectInvalid });
		return;
	}
	const addRTrim = memAddMaxRounds.value.trim();
	let agentLongMemoryAddMaxRounds: number | null;
	if (addRTrim === '') {
		agentLongMemoryAddMaxRounds = null;
	} else {
		const ar = Math.trunc(Number(addRTrim));
		if (!Number.isFinite(ar) || ar < 1 || ar > 24) {
			os.alert({ type: 'error', text: i18n.ts._agents.sessionMemoryAddMaxRoundsInvalid });
			return;
		}
		agentLongMemoryAddMaxRounds = ar;
	}
	const addEveryTrim = memAddEveryN.value.trim();
	let agentLongMemoryAddEveryNRounds: number | null;
	if (addEveryTrim === '') {
		agentLongMemoryAddEveryNRounds = null;
	} else {
		const ev = Math.trunc(Number(addEveryTrim));
		if (!Number.isFinite(ev) || ev < 1 || ev > 48) {
			os.alert({ type: 'error', text: i18n.ts._agents.sessionMemoryAddEveryNRoundsInvalid });
			return;
		}
		agentLongMemoryAddEveryNRounds = ev;
	}
	let agentLongMemoryMinScore: number | null = null;
	const ms = memMinScore.value.trim();
	if (ms !== '') {
		const n = Number(ms);
		if (!Number.isFinite(n) || n < 0 || n > 1) {
			os.alert({ type: 'error', text: i18n.ts._agents.sessionMemoryMinScoreInvalid });
			return;
		}
		agentLongMemoryMinScore = n;
	}
	memSaving.value = true;
	try {
		await misskeyApi('agents/sessions/update', {
			sessionId,
			agentLongMemoryEnabled: memLongMemoryEnabled.value,
			agentLongMemoryTopK: topK,
			agentLongMemoryMinScore,
			agentLongMemoryInjectMaxChars: inj,
			agentLongMemoryAddMaxRounds,
			agentLongMemoryAddEveryNRounds,
		});
		await loadSession();
		os.toast(i18n.ts._agents.sessionMemorySaved);
	} catch (e) {
		os.alert({ type: 'error', text: formatApiError(e) });
		await loadSession();
	} finally {
		memSaving.value = false;
	}
}

const OPTIMISTIC_MESSAGE_ID_PREFIX = 'agent-opt:';

/** 与 agents/messages/send 中 assertAgentSessionTurnOrderAllowsUserSend 一致 */
function agentSendTurnOrderBlockReason(msgs: AgentMsg[]): 'invalidTurns' | 'awaitAssistant' | null {
	const seq = msgs
		.filter(m => m.role === 'user' || m.role === 'assistant')
		.sort((a, b) => {
			const ta = new Date(a.createdAt).getTime();
			const tb = new Date(b.createdAt).getTime();
			if (ta !== tb) return ta - tb;
			return a.id.localeCompare(b.id);
		});
	for (let i = 1; i < seq.length; i++) {
		if (seq[i]!.role === seq[i - 1]!.role) return 'invalidTurns';
	}
	if (seq.length > 0 && seq[seq.length - 1]!.role === 'user') return 'awaitAssistant';
	return null;
}

/** 与后端 send 中 safeAgentMemEveryNRounds 一致，用于在缺少 API 字段时推断是否应显示写入提示 */
function safeMemEveryNForHint(sessionVal: number | null | undefined, metaVal: unknown): number {
	const raw = sessionVal ?? (typeof metaVal === 'number' && Number.isFinite(metaVal) ? metaVal : null) ?? 1;
	const t = Math.trunc(Number(raw));
	if (!Number.isFinite(t)) return 1;
	return Math.max(1, Math.min(48, t));
}

function showMemoryAddScheduledHintNow(res: { longTermMemoryAddScheduled?: boolean }, assistantCount: number) {
	if (res.longTermMemoryAddScheduled === true) return true;
	if (res.longTermMemoryAddScheduled === false) return false;
	if (!showLongMemoryTab.value || session.value == null || session.value.agentLongMemoryEnabled === false) return false;
	const everyN = safeMemEveryNForHint(
		session.value.agentLongMemoryAddEveryNRounds ?? null,
		instance.agentMem0AddMemoryEveryNRounds,
	);
	return assistantCount > 0 && assistantCount % everyN === 0;
}

async function onFormSubmit(text: string) {
	if (sending.value) return;
	const trimmed = text.trim();
	if (!trimmed) return;
	if (!session.value?.dialogueStyleId) {
		os.alert({ type: 'info', text: i18n.ts._agents.needDialogueStyleBeforeSend });
		tab.value = 'style';
		return;
	}

	const turnBlock = agentSendTurnOrderBlockReason(messages.value);
	if (turnBlock === 'invalidTurns') {
		os.alert({ type: 'error', text: i18n.ts._agents.invalidTurnOrderCannotSend });
		return;
	}
	if (turnBlock === 'awaitAssistant') {
		os.alert({ type: 'error', text: i18n.ts._agents.awaitAssistantReplyCannotSend });
		return;
	}

	sending.value = true;
	let leaveSendingSpinner = false;
	const optimisticId = OPTIMISTIC_MESSAGE_ID_PREFIX + crypto.randomUUID();
	const userCreatedAt = new Date().toISOString();
	messages.value.unshift({
		id: optimisticId,
		role: 'user',
		content: trimmed,
		createdAt: userCreatedAt,
	});

	try {
		const res = await misskeyApi('agents/messages/send', { sessionId, text: trimmed }) as {
			userMessageId: string;
			assistantMessageId: string;
			assistantText: string;
			longTermMemorySearchUnavailable?: boolean;
			longTermMemoryAddScheduled?: boolean;
		};
		if (res.longTermMemorySearchUnavailable) {
			os.toast(i18n.ts._agents.longTermMemorySearchUnavailable);
		}
		const assistantCreatedAt = new Date().toISOString();
		const withoutOpt = messages.value.filter(m => m.id !== optimisticId);
		const userMsg: AgentMsg = {
			id: res.userMessageId,
			role: 'user',
			content: trimmed,
			createdAt: userCreatedAt,
		};
		const asstMsg: AgentMsg = {
			id: res.assistantMessageId,
			role: 'assistant',
			content: res.assistantText,
			createdAt: assistantCreatedAt,
		};
		messages.value = [asstMsg, userMsg, ...withoutOpt];
		const assistantCount = messages.value.filter(m => m.role === 'assistant').length;
		if (showMemoryAddScheduledHintNow(res, assistantCount)) {
			if (memoryAddHintTimer != null) {
				window.clearTimeout(memoryAddHintTimer);
				memoryAddHintTimer = null;
			}
			memoryAddHintVisible.value = true;
			memoryAddHintTimer = window.setTimeout(() => {
				memoryAddHintVisible.value = false;
				memoryAddHintTimer = null;
			}, 4500);
		}
		await scrollToLatest();
		await loadSession();
	} catch (e) {
		messages.value = messages.value.filter(m => m.id !== optimisticId);
		try {
			await loadInitialTimeline();
		} catch {
			// ignore secondary failure
		}
		if (isAgentReplyPendingError(e)) {
			os.toast(i18n.ts._agents.replyStillGenerating);
			leaveSendingSpinner = true;
			startReplyPendingPoll();
		} else {
			formRef.value?.restoreDraft(trimmed);
			if (e != null && typeof e === 'object' && (e as { code?: string }).code === 'AGENT_DIALOGUE_STYLE_REQUIRED') {
				os.alert({ type: 'info', text: i18n.ts._agents.needDialogueStyleBeforeSend });
				tab.value = 'style';
			} else if (e != null && typeof e === 'object' && (e as { code?: string }).code === 'AGENT_THREAD_INVALID_TURNS') {
				os.alert({ type: 'error', text: i18n.ts._agents.invalidTurnOrderCannotSend });
			} else if (e != null && typeof e === 'object' && (e as { code?: string }).code === 'AGENT_AWAIT_ASSISTANT_REPLY') {
				os.alert({ type: 'error', text: i18n.ts._agents.awaitAssistantReplyCannotSend });
			} else {
				os.alert({ type: 'error', text: formatApiError(e) });
			}
		}
	} finally {
		if (!leaveSendingSpinner) {
			sending.value = false;
		}
	}
}
</script>

<style lang="scss" module>
.transition_x_move,
.transition_x_enterActive,
.transition_x_leaveActive {
	transition: opacity 0.2s cubic-bezier(0,.5,.5,1), transform 0.2s cubic-bezier(0,.5,.5,1) !important;
}
.transition_x_enterFrom,
.transition_x_leaveTo {
	opacity: 0;
	transform: translateY(80px);
}
.transition_x_leaveActive {
	position: absolute;
}

.footer {
	width: 100%;
	padding-top: 8px;
	display: flex;
	flex-direction: column;
	align-items: stretch;
	gap: 0.5em;
}

.composeStyleHint {
	margin: 0 auto;
	width: 100%;
	max-width: 700px;
	font-size: 0.9em;
}

.form {
	margin: 0 auto;
	width: 100%;
	max-width: 700px;
	box-sizing: border-box;
	min-width: 0;
}

.more {
	margin: 0 auto;
}

.contextWindowDivider {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 0.65em;
	width: 100%;
	max-width: 700px;
	margin: 0.35em auto;
	padding: 0 0.25em;
	box-sizing: border-box;
}

.contextWindowLine {
	flex: 1;
	height: 0;
	border-top: 1px dashed var(--MI_THEME-divider);
	opacity: 0.85;
	min-width: 1em;
}

.contextWindowLabel {
	flex-shrink: 0;
	font-size: 0.78em;
	font-weight: 600;
	letter-spacing: 0.02em;
	color: var(--MI_THEME-fgTransparentWeak);
	white-space: nowrap;
}

.contextWindowDividerHighlight {
	animation: agentContextDividerHighlight 1.2s ease-in-out 1;
}

@keyframes agentContextDividerHighlight {
	0%, 100% {
		filter: none;
	}
	40%, 60% {
		filter: drop-shadow(0 0 6px color-mix(in srgb, var(--MI_THEME-accent) 55%, transparent));
	}
}

.memContextDividerRow {
	display: flex;
	justify-content: flex-start;
}

.dateDivider {
	display: flex;
	font-size: 85%;
	align-items: center;
	justify-content: center;
	gap: 0.5em;
	opacity: 0.75;
	border: solid 0.5px var(--MI_THEME-divider);
	border-radius: 999px;
	width: fit-content;
	padding: 0.5em 1em;
	margin: 0 auto;
}

.settingLabel {
	display: block;
	font-size: 0.88em;
	opacity: 0.85;
}

.settingTitleRow {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.75em;
}

.settingValue {
	font-size: 0.9em;
	font-weight: 700;
	color: var(--MI_THEME-accent);
}

.selectCardList {
	display: grid;
	gap: 0.75em;
}

.selectCard {
	border: solid 1px var(--MI_THEME-divider);
	border-radius: var(--MI-radius);
	background: var(--MI_THEME-panel);
	transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.selectCardActive {
	border-color: color-mix(in srgb, var(--MI_THEME-accent) 60%, var(--MI_THEME-divider));
	box-shadow: 0 0 0 1px color-mix(in srgb, var(--MI_THEME-accent) 28%, transparent);
}

.selectCardMain {
	padding: 0.9em 1em;
	display: flex;
	flex-direction: column;
	gap: 0.65em;
}

.selectCardHead {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 0.75em;
}

.selectCardTitleWrap {
	min-width: 0;
}

.selectCardTitle {
	font-size: 1em;
	font-weight: 700;
	line-height: 1.3;
	word-break: break-word;
}

.selectCardSub {
	display: flex;
	flex-wrap: wrap;
	gap: 0.35em;
	margin-top: 0.35em;
}

.selectCardDesc {
	margin: 0;
	opacity: 0.86;
	line-height: 1.5;
	white-space: pre-wrap;
	word-break: break-word;
}

.stylePlazaRow {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: 0.35em 0.5em;
	font-size: 0.86em;
	margin-top: 0.35em;
	line-height: 1.45;
}

.stylePlazaLabel {
	font-weight: 700;
	opacity: 0.72;
	display: inline-flex;
	align-items: center;
	gap: 0.25em;
}

.stylePlazaStars {
	color: var(--MI_THEME-warn);
	letter-spacing: 0.03em;
	font-weight: 700;
}

.stylePlazaMuted {
	opacity: 0.58;
	font-weight: 600;
}

.stylePlazaSep {
	opacity: 0.45;
	user-select: none;
}

.selectCardMeta {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.55em 0.8em;
}

.metaLabel {
	opacity: 0.8;
	font-size: 0.85em;
}

.metaAuthor {
	display: inline-flex;
	align-items: center;
	gap: 0.45em;
}

.selectCardTimes {
	display: flex;
	flex-wrap: wrap;
	gap: 0.45em;
}

.timeChip {
	display: inline-flex;
	align-items: center;
	gap: 0.35em;
	font-size: 0.82em;
	opacity: 0.8;
	padding: 0.28em 0.6em;
	border-radius: 999px;
	background: var(--MI_THEME-bg);
	border: solid 1px var(--MI_THEME-divider);
}

.modelSpecGrid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
	gap: 0.6em;
}

.modelSpecItem {
	display: flex;
	flex-direction: column;
	gap: 0.18em;
	padding: 0.55em 0.7em;
	border-radius: calc(var(--MI-radius) * 0.7);
	background: var(--MI_THEME-bg);
	border: solid 1px var(--MI_THEME-divider);
}

.modelSpecLabel {
	font-size: 0.78em;
	opacity: 0.72;
}

.modelSpecValue {
	font-size: 0.95em;
	font-weight: 700;
}

.sessionMemoryHint {
	white-space: pre-line;
	line-height: 1.55;
}

.memDivider {
	margin: 1.25em 0;
	border: none;
	border-top: solid 1px var(--MI_THEME-divider);
}

.memNodesHeader {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.75em;
}

.memNodesActions {
	display: flex;
	gap: 0.35em;
	flex-shrink: 0;
}

.memCard {
	padding: 0.85em 1em;
	border-radius: var(--MI-radius);
	border: solid 1px var(--MI_THEME-divider);
	background: var(--MI_THEME-panel);
}

.memMeta {
	font-size: 0.8em;
	opacity: 0.7;
	margin-bottom: 0.35em;
}

.memContent {
	white-space: pre-wrap;
	word-break: break-word;
	font-size: 0.95em;
	line-height: 1.45;
}

.memCardActions {
	display: flex;
	flex-wrap: wrap;
	gap: 0.5em;
	justify-content: flex-end;
	margin-top: 0.65em;
}

.memPager {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 0.75em;
	margin-top: 0.5em;
	font-size: 0.9em;
}

.memAddHint {
	display: flex;
	align-items: center;
	gap: 0.5em;
	padding: 0.55em 0.85em;
	font-size: 0.88em;
	border-radius: var(--MI-radius);
	border: solid 1px var(--MI_THEME-divider);
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
	margin: 0 auto;
	width: 100%;
	max-width: 700px;
	box-sizing: border-box;
}

.memAddHintIcon {
	flex-shrink: 0;
	animation: memAddHintSpin 0.85s linear infinite;
}

@keyframes memAddHintSpin {
	to {
		transform: rotate(360deg);
	}
}
</style>
