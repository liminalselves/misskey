<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader>
	<div class="_spacer" style="--MI_SPACER-w: 1200px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<div class="_gaps_m">
			<MkInfo>{{ i18n.ts._agents.adminAgentReviewDescription }}</MkInfo>

			<div :class="$style.summaryGrid">
				<div v-panel :class="$style.summaryCard">
					<span :class="$style.summaryLabel">待审角色</span>
					<b :class="$style.summaryValue">{{ pendingCharacters.length }}</b>
				</div>
				<div v-panel :class="$style.summaryCard">
					<span :class="$style.summaryLabel">待审风格</span>
					<b :class="$style.summaryValue">{{ pendingStyles.length }}</b>
				</div>
				<div v-panel :class="$style.summaryCard">
					<span :class="$style.summaryLabel">已载入内容</span>
					<b :class="$style.summaryValue">{{ resources.length }}</b>
				</div>
				<div v-panel :class="$style.summaryCard">
					<span :class="$style.summaryLabel">审查日志</span>
					<b :class="$style.summaryValue">{{ logs.length }}</b>
				</div>
				<div v-panel :class="$style.summaryCard">
					<span :class="$style.summaryLabel">AI 生图</span>
					<b :class="$style.summaryValue">{{ imageReviewRows.length || '—' }}</b>
				</div>
			</div>

			<div :class="$style.tabBar" role="tablist">
				<button v-for="tab in tabs" :key="tab.key" type="button" class="_button" :class="[$style.tab, activeTab === tab.key ? $style.tabActive : null]" @click="activeTab = tab.key">
					<i :class="tab.icon"></i>
					<span>{{ tab.label }}</span>
				</button>
			</div>

			<template v-if="activeTab === 'queue'">
				<section :class="$style.toolbar">
					<div :class="$style.toolbarTitle">
						<h2>待审队列</h2>
						<p>按提交时间排序，优先处理等待最久的角色和风格提示词。</p>
					</div>
					<div class="_buttons">
						<MkButton rounded :disabled="reviewLoading" @click="loadPending"><i class="ti ti-refresh"></i> 刷新</MkButton>
					</div>
				</section>
				<MkLoading v-if="reviewLoading"/>
				<MkInfo v-else-if="pendingCharacters.length === 0 && pendingStyles.length === 0">{{ i18n.ts._agents.noPendingAgentReviews }}</MkInfo>
				<div v-else class="_gaps">
					<ReviewCard v-for="item in pendingResources" :key="item.kind + item.id" :item="item" :pending="true" @approve="approveResource" @reject="rejectResource" @ban="banResource" @diff="showDiff"/>
				</div>
			</template>

			<template v-else-if="activeTab === 'resources'">
				<section :class="$style.filterPanel" class="_gaps_s">
					<FormSplit :minWidth="220">
						<MkSelect v-model="resourceFilters.kind" :items="kindItems">
							<template #label>类型</template>
						</MkSelect>
						<MkSelect v-model="resourceFilters.status" :items="statusItems">
							<template #label>状态</template>
						</MkSelect>
					</FormSplit>
					<FormSplit :minWidth="260">
						<MkInput v-model="resourceFilters.query" type="text">
							<template #label>关键词</template>
						</MkInput>
						<MkInput v-model="resourceFilters.userId" type="text">
							<template #label>作者 ID</template>
						</MkInput>
					</FormSplit>
					<div class="_buttons">
						<MkButton primary rounded :disabled="resourceLoading" @click="loadResources"><i class="ti ti-search"></i> 检索</MkButton>
						<MkButton rounded :disabled="resourceLoading" @click="resetResourceFilters"><i class="ti ti-filter-off"></i> 重置</MkButton>
					</div>
				</section>
				<MkLoading v-if="resourceLoading"/>
				<MkInfo v-else-if="resources.length === 0">没有匹配的角色或风格提示词。</MkInfo>
				<div v-else class="_gaps">
					<ReviewCard v-for="item in resources" :key="item.kind + item.id" :item="item" :pending="item.reviewStatus === 'pending'" @approve="approveResource" @reject="rejectResource" @ban="banResource" @diff="showDiff"/>
				</div>
			</template>

			<template v-else-if="activeTab === 'sessions'">
				<section :class="$style.filterPanel" class="_gaps_s">
					<FormSplit :minWidth="260">
						<MkInput v-model="sessionFilterUserId" type="text">
							<template #label>{{ i18n.ts._agents.adminChatManageFilterUser }}</template>
						</MkInput>
						<MkInput v-model="sessionFilterId" type="text">
							<template #label>会话 ID</template>
						</MkInput>
					</FormSplit>
					<div class="_buttons">
						<MkButton primary rounded :disabled="sessionsLoading" @click="loadSessions(true)"><i class="ti ti-search"></i> 检索会话</MkButton>
						<MkButton rounded @click="openLegacyChatAudit"><i class="ti ti-external-link"></i> 高级审计</MkButton>
					</div>
				</section>
				<MkLoading v-if="sessionsLoading"/>
				<MkInfo v-else-if="sessions.length === 0">{{ i18n.ts._agents.adminChatManageSessionListEmpty }}</MkInfo>
				<div v-else :class="$style.sessionGrid">
					<article v-for="s in sessions" :key="s.id" v-panel :class="$style.sessionCard">
						<div :class="$style.cardHead">
							<div>
								<h3>{{ s.name }}</h3>
								<p><MkUserName v-if="s.user" :user="s.user"/> <code v-else>{{ s.userId }}</code></p>
							</div>
							<span v-if="s.moderationBanned" :class="$style.dangerBadge">已封禁</span>
						</div>
						<div :class="$style.metaGrid">
							<span>角色：{{ s.characterName || '—' }}</span>
							<span>类型：{{ sessionKindLabel(s.sessionKind) }}</span>
							<span>最后消息：{{ formatTime(s.lastMessageAt || s.updatedAt) }}</span>
							<code>{{ s.id }}</code>
						</div>
						<div class="_buttons">
							<MkButton small rounded @click="loadTimeline(s)"><i class="ti ti-messages"></i> 查看对话</MkButton>
							<MkButton small rounded :danger="!s.moderationBanned" @click="toggleSessionBan(s)"><i class="ti ti-ban"></i> {{ s.moderationBanned ? '解封会话' : '封禁会话' }}</MkButton>
						</div>
					</article>
				</div>
				<MkFolder v-if="selectedSession" :defaultOpen="true">
					<template #icon><i class="ti ti-messages"></i></template>
					<template #label>{{ selectedSession.name }}</template>
					<div class="_gaps_s">
						<MkLoading v-if="timelineLoading"/>
						<MkInfo v-else-if="timeline.length === 0">{{ i18n.ts._agents.adminChatManageTimelineEmpty }}</MkInfo>
						<div v-else :class="$style.timeline">
							<div v-for="msg in timelineReversed" :key="msg.id" :class="$style.message">
								<div :class="$style.msgHead">
									<b>{{ roleLabel(msg.role) }}</b>
									<time>{{ formatTime(msg.createdAt) }}</time>
								</div>
								<pre :class="$style.pre">{{ msg.content }}</pre>
							</div>
						</div>
					</div>
				</MkFolder>
			</template>

			<template v-else-if="activeTab === 'messages'">
				<section :class="$style.filterPanel" class="_gaps_s">
					<FormSplit :minWidth="240">
						<MkInput v-model="messageFilters.userId" type="text"><template #label>用户 ID</template></MkInput>
						<MkInput v-model="messageFilters.sessionId" type="text"><template #label>会话 ID</template></MkInput>
					</FormSplit>
					<FormSplit :minWidth="240">
						<MkInput v-model="messageFilters.characterId" type="text"><template #label>角色 ID</template></MkInput>
						<MkSelect v-model="messageFilters.role" :items="roleItems"><template #label>消息角色</template></MkSelect>
					</FormSplit>
					<MkInput v-model="messageFilters.query" type="text"><template #label>关键词</template></MkInput>
					<div class="_buttons">
						<MkButton primary rounded :disabled="messagesLoading" @click="searchMessages"><i class="ti ti-search"></i> 检索消息</MkButton>
					</div>
				</section>
				<MkLoading v-if="messagesLoading"/>
				<MkInfo v-else-if="messages.length === 0">暂无消息结果。</MkInfo>
				<div v-else class="_gaps">
					<article v-for="m in messages" :key="m.id" v-panel :class="$style.messageCard">
						<div :class="$style.cardHead">
							<div>
								<span :class="$style.kindBadge">{{ roleLabel(m.role) }}</span>
								<span :class="$style.kindBadge">{{ sessionKindLabel(m.sessionKind) }}</span>
							</div>
							<time>{{ formatTime(m.createdAt) }}</time>
						</div>
						<div :class="$style.metaGrid">
							<span>用户：<MkUserName v-if="m.user" :user="m.user"/><code v-else>{{ m.userId }}</code></span>
							<span>会话：{{ m.sessionName }}</span>
							<span>角色：{{ m.characterName || '—' }}</span>
							<code>{{ m.sessionId }}</code>
						</div>
						<pre :class="$style.pre">{{ m.content }}</pre>
						<div class="_buttons">
							<MkButton small rounded @click="copyText(m.id)"><i class="ti ti-copy"></i> 复制消息 ID</MkButton>
							<MkButton small rounded @click="jumpSession(m.sessionId)"><i class="ti ti-arrow-right"></i> 查看会话</MkButton>
						</div>
					</article>
				</div>
			</template>

			<template v-else-if="activeTab === 'externalAudit'">
				<section :class="$style.filterPanel" class="_gaps_s">
					<FormSplit :minWidth="220">
						<MkSelect v-model="externalAuditFilters.status" :items="externalAuditStatusItems"><template #label>状态</template></MkSelect>
						<MkInput v-model="externalAuditFilters.blockCode" type="text"><template #label>拦截编码</template></MkInput>
					</FormSplit>
					<FormSplit :minWidth="240">
						<MkInput v-model="externalAuditFilters.userId" type="text"><template #label>用户 ID</template></MkInput>
						<MkInput v-model="externalAuditFilters.sessionId" type="text"><template #label>会话 ID</template></MkInput>
					</FormSplit>
					<FormSplit :minWidth="240">
						<MkInput v-model="externalAuditFilters.modelId" type="text"><template #label>外审模型 ID</template></MkInput>
						<MkInput v-model="externalAuditFilters.query" type="text"><template #label>关键词</template></MkInput>
					</FormSplit>
					<div class="_buttons">
						<MkButton primary rounded :disabled="externalAuditLoading" @click="loadExternalAuditLogs"><i class="ti ti-search"></i> 检索外审记录</MkButton>
						<MkButton rounded :disabled="externalAuditLoading" @click="resetExternalAuditFilters"><i class="ti ti-filter-off"></i> 重置</MkButton>
					</div>
				</section>
				<MkLoading v-if="externalAuditLoading"/>
				<MkInfo v-else-if="externalAuditLogs.length === 0">暂无外审拦截记录。</MkInfo>
				<div v-else class="_gaps">
					<article v-for="row in externalAuditLogs" :key="row.id" v-panel :class="$style.externalAuditCard">
						<div :class="$style.externalAuditHead">
							<div :class="$style.externalAuditBadges">
								<span :class="[$style.kindBadge, row.status === 'block' ? $style.dangerBadge : null]">{{ externalAuditStatusLabel(row.status) }}</span>
								<code v-if="row.blockCode" :class="$style.auditCode">{{ row.blockCode }}</code>
							</div>
							<time>{{ formatTime(row.createdAt) }}</time>
						</div>
						<div :class="$style.externalAuditMeta">
							<span><b>用户</b><MkUserName v-if="row.user" :user="row.user"/><code v-else>{{ row.userId || '—' }}</code></span>
							<span><b>会话</b>{{ row.sessionName || row.sessionId || '—' }}</span>
							<span><b>角色</b>{{ row.characterName || '—' }}</span>
							<span><b>模型</b>{{ row.modelName || row.modelId || '—' }}</span>
						</div>
						<div :class="$style.auditDecision">
							<span>判断</span>
							<p>{{ row.category || '未分类' }}：{{ row.reason || row.errorMessage || '—' }}</p>
						</div>
						<div v-if="row.userText || row.assistantText" :class="$style.auditPayloadGrid">
							<section v-if="row.userText" :class="$style.auditPayload">
								<h4>外审输入：用户侧内容</h4>
								<pre :class="$style.auditPayloadText">{{ row.userText }}</pre>
							</section>
							<section v-if="row.assistantText" :class="$style.auditPayload">
								<h4>外审输入：待展示/执行内容</h4>
								<pre :class="$style.auditPayloadText">{{ row.assistantText }}</pre>
							</section>
						</div>
						<div class="_buttons">
							<MkButton small rounded @click="copyText(row.blockCode || row.id)"><i class="ti ti-copy"></i> 复制编码</MkButton>
							<MkButton v-if="row.sessionId" small rounded @click="jumpSession(row.sessionId)"><i class="ti ti-arrow-right"></i> 查看会话</MkButton>
						</div>
					</article>
				</div>
			</template>

			<template v-else-if="activeTab === 'images'">
				<section :class="$style.filterPanel" class="_gaps_s">
					<FormSplit :minWidth="220">
						<MkInput v-model="imageFilters.userId"><template #label>用户 ID</template></MkInput>
						<MkInput v-model="imageFilters.sessionId"><template #label>会话 ID</template></MkInput>
						<MkInput v-model="imageFilters.messageId"><template #label>消息 ID</template></MkInput>
					</FormSplit>
					<FormSplit :minWidth="220">
						<MkSelect v-model="imageFilters.status" :items="imageStatusItems"><template #label>状态</template></MkSelect>
						<MkSelect v-model="imageFilters.blocked" :items="imageBlockedItems"><template #label>封禁状态</template></MkSelect>
						<MkInput v-model="imageFilters.query"><template #label>Prompt 关键词</template></MkInput>
					</FormSplit>
					<div class="_buttons">
						<MkButton primary rounded :disabled="imageReviewLoading" @click="loadImageReviews"><i class="ti ti-search"></i> 查询图片</MkButton>
						<MkButton rounded :disabled="imageReviewLoading" @click="resetImageFilters"><i class="ti ti-filter-off"></i> 重置</MkButton>
					</div>
				</section>
				<MkLoading v-if="imageReviewLoading"/>
				<MkInfo v-else-if="imageReviewRows.length === 0">没有匹配的 AI 生图记录。</MkInfo>
				<div v-else :class="$style.imageReviewGrid">
					<article v-for="row in imageReviewRows" :key="row.id" v-panel :class="$style.imageReviewCard">
						<div :class="$style.imageReviewBox">
							<img v-if="row.url && !row.isBlocked && row.status !== 'auto_cleaned'" :src="row.url" alt="AI生成图片"/>
							<div v-else :class="$style.imageReviewEmpty">
								<i :class="row.status === 'auto_cleaned' ? 'ti ti-trash' : row.isBlocked ? 'ti ti-ban' : 'ti ti-photo-off'"></i>
								<span>{{ row.status === 'auto_cleaned' ? '图片已被清理' : row.isBlocked ? '已封禁' : row.status }}</span>
							</div>
						</div>
						<div :class="$style.imageReviewBody" class="_gaps_s">
							<div :class="$style.cardHead">
								<b>{{ row.provider }} / {{ row.imageModelId }}</b>
								<span :class="[$style.kindBadge, row.isBlocked ? $style.dangerBadge : null]">{{ row.status === 'auto_cleaned' ? '图片已被清理' : row.isBlocked ? '已封禁' : row.status }}</span>
							</div>
							<p :class="$style.imagePrompt">{{ row.tag }}</p>
							<div :class="$style.metaGrid">
								<span>尺寸：{{ row.size }}</span>
								<span>费用：{{ row.cost }}</span>
								<span>{{ row.messageId ? `占位：#${row.placeholderIndex + 1}` : '来源：测试生图' }}</span>
								<span>用户：<MkUserName v-if="row.user" :user="row.user"/><code v-else>{{ row.userId }}</code></span>
								<code>session {{ row.sessionId }}</code>
								<code v-if="row.messageId">message {{ row.messageId }}</code>
								<code v-if="row.fileId">file {{ row.fileId }}</code>
								<span v-if="row.errorCode">错误：{{ row.errorCode }}</span>
								<span v-if="row.blockedReason">原因：{{ row.blockedReason }}</span>
								<span v-if="row.autoCleanedAt">清理时间：{{ row.autoCleanedAt }}</span>
								<span v-if="row.autoCleanedReason">清理原因：{{ row.autoCleanedReason }}</span>
							</div>
							<div class="_buttons">
								<MkButton v-if="row.url && !row.isBlocked && row.status !== 'auto_cleaned'" small rounded @click="openImageReviewUrl(row.url)"><i class="ti ti-external-link"></i> 打开图片</MkButton>
								<MkButton v-if="row.status !== 'auto_cleaned'" small rounded :danger="!row.isBlocked" @click="toggleImageBlocked(row)">
									<i class="ti ti-ban"></i> {{ row.isBlocked ? '解封图片' : '封禁图片' }}
								</MkButton>
								<MkButton small rounded @click="jumpSession(row.sessionId)"><i class="ti ti-arrow-right"></i> 查看会话</MkButton>
							</div>
						</div>
					</article>
				</div>
			</template>

			<template v-else-if="activeTab === 'logs'">
				<section :class="$style.toolbar">
					<div :class="$style.toolbarTitle">
						<h2>审查记录</h2>
						<p>仅展示智能体审核、角色封禁、会话封禁相关记录。</p>
					</div>
					<MkButton rounded :disabled="logsLoading" @click="loadLogs"><i class="ti ti-refresh"></i> 刷新</MkButton>
				</section>
				<MkLoading v-if="logsLoading"/>
				<MkInfo v-else-if="logs.length === 0">暂无审查记录。</MkInfo>
				<div v-else class="_gaps_s">
					<article v-for="log in logs" :key="log.id" v-panel :class="$style.logRow">
						<div :class="$style.cardHead">
							<div :class="$style.logTitle">
								<b>{{ logTitle(log) }}</b>
								<span :class="[$style.logDecision, logDecisionClass(log)]">{{ logDecisionLabel(log) }}</span>
							</div>
							<time>{{ formatTime(log.createdAt) }}</time>
						</div>
						<div :class="$style.logActor">
							<span>操作人</span>
							<MkUserName :user="log.user"/>
							<MkAcct :user="log.user"/>
							<code>{{ log.userId }}</code>
						</div>
						<div :class="$style.logMetaGrid">
							<div v-for="row in logRows(log)" :key="row.label" :class="$style.logMetaItem">
								<span>{{ row.label }}</span>
								<code v-if="row.code">{{ row.value }}</code>
								<b v-else>{{ row.value }}</b>
							</div>
						</div>
						<div v-if="logReason(log) || logMessage(log) || logInternalNote(log)" :class="$style.logNotes">
							<div v-if="logReason(log)" :class="$style.logNote">
								<span>原因</span>
								<p>{{ logReason(log) }}</p>
							</div>
							<div v-if="logMessage(log)" :class="$style.logNote">
								<span>给作者的说明</span>
								<p>{{ logMessage(log) }}</p>
							</div>
							<div v-if="logInternalNote(log)" :class="$style.logNote">
								<span>内部备注</span>
								<p>{{ logInternalNote(log) }}</p>
							</div>
						</div>
					</article>
				</div>
			</template>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, defineComponent, h, onMounted, reactive, ref, useCssModule, watch } from 'vue';
import MkButton from '@/components/MkButton.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkInput from '@/components/MkInput.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkUserName from '@/components/global/MkUserName.vue';
import MkAcct from '@/components/global/MkAcct.vue';
import MkDriveFileThumbnail from '@/components/MkDriveFileThumbnail.vue';
import FormSplit from '@/components/form/split.vue';
import { misskeyApi, formatApiError } from '@/utility/misskey-api.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { useRouter } from '@/router.js';
import { formatDateTimeString } from '@/utility/format-time-string.js';
import * as os from '@/os.js';

type Kind = 'character' | 'style';
type WorldbookReviewEntry = {
	id: string;
	title: string;
	content: string;
	keywords: string[];
	triggerMode: 'keyword' | 'manual' | 'always';
	priority: number;
	enabled: boolean;
	revision: number;
};
type ReviewResource = {
	kind: Kind;
	id: string;
	userId: string;
	name: string;
	summary: string | null;
	personality?: string;
	background?: string;
	speakingStyle?: string;
	greeting?: string;
	exampleTurns?: { role: 'user' | 'assistant'; content: string }[];
	forbiddenBehavior?: string;
	worldbook?: WorldbookReviewEntry[];
	body?: string;
	avatar?: any | null;
	publishedVersion: number | null;
	reviewStatus: string;
	isPublished: boolean;
	moderationBanned?: boolean;
	promptOpenSourced: boolean;
	reviewRejectReason: string | null;
	reviewRejectMessage: string | null;
	reviewInternalNote: string | null;
	createdAt: string;
	updatedAt: string;
	user: any;
};
type ReviewListResponse = { characters: Omit<ReviewResource, 'kind'>[]; styles: Omit<ReviewResource, 'kind'>[] };
type SessionRow = {
	id: string; createdAt: string; updatedAt: string; userId: string; name: string; characterId: string;
	dialogueStyleId: string | null; sessionKind: 'draft_test' | 'community'; lastMessageAt: string | null;
	agentReplyPending: boolean; moderationBanned: boolean; characterName: string; user: any;
};
type TimelineMsg = { id: string; role: 'user' | 'assistant' | 'system'; content: string; createdAt: string };
type MessageRow = TimelineMsg & {
	sessionId: string; sessionName: string; sessionKind: 'draft_test' | 'community'; userId: string; user: any | null;
	characterId: string; characterName: string; dialogueStyleId: string | null; sessionModerationBanned: boolean; characterModerationBanned: boolean;
};
type AgentLog = { id: string; createdAt: string; type: string; info: Record<string, unknown>; userId: string; user: any };
type ExternalAuditStatus = 'allow' | 'block' | 'failed' | 'all_failed';
type ExternalAuditLogRow = {
	id: string;
	createdAt: string;
	completedAt: string | null;
	durationMs: number | null;
	userId: string | null;
	user: any | null;
	sessionId: string | null;
	sessionName: string | null;
	characterId: string | null;
	characterName: string;
	dialogueStyleId: string | null;
	modelId: string | null;
	modelName: string | null;
	apiModelName: string | null;
	baseUrl: string | null;
	priority: number;
	attemptIndex: number;
	status: ExternalAuditStatus;
	blockCode: string | null;
	category: string | null;
	reason: string | null;
	confidence: number | null;
	userText: string | null;
	assistantText: string | null;
	responseText: string | null;
	errorCode: string | null;
	errorMessage: string | null;
};
type ImageReviewRow = {
	id: string;
	createdAt: string;
	updatedAt: string;
	userId: string;
	user: any | null;
	sessionId: string;
	messageId: string | null;
	placeholderIndex: number;
	tag: string;
	size: string;
	provider: string;
	imageModelId: string;
	status: string;
	fileId: string | null;
	url: string | null;
	errorCode: string | null;
	cost: number;
	isBlocked: boolean;
	blockedReason: string | null;
	autoCleanedAt: string | null;
	autoCleanedReason: string | null;
};

const router = useRouter();
const style = useCssModule();
type ReviewTab = 'queue' | 'resources' | 'sessions' | 'messages' | 'externalAudit' | 'images' | 'logs';
const initialTab = new URLSearchParams(window.location.search).get('tab');
const activeTab = ref<ReviewTab>(['queue', 'resources', 'sessions', 'messages', 'externalAudit', 'images', 'logs'].includes(String(initialTab)) ? initialTab as ReviewTab : 'queue');
const tabs = [
	{ key: 'queue', label: '待审队列', icon: 'ti ti-inbox' },
	{ key: 'resources', label: '全部内容', icon: 'ti ti-cards' },
	{ key: 'sessions', label: '会话审计', icon: 'ti ti-messages' },
	{ key: 'messages', label: '消息检索', icon: 'ti ti-search' },
	{ key: 'externalAudit', label: '外审拦截', icon: 'ti ti-shield-check' },
	{ key: 'images', label: 'AI 生图审核', icon: 'ti ti-photo-shield' },
	{ key: 'logs', label: '审查记录', icon: 'ti ti-history' },
] as const;

const reviewLoading = ref(false);
const pendingCharacters = ref<ReviewResource[]>([]);
const pendingStyles = ref<ReviewResource[]>([]);
const pendingResources = computed(() => [...pendingCharacters.value, ...pendingStyles.value].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)));

const resourceLoading = ref(false);
const resources = ref<ReviewResource[]>([]);
const resourceFilters = reactive({ kind: 'all', status: 'all', query: '', userId: '' });

const sessionsLoading = ref(false);
const sessions = ref<SessionRow[]>([]);
const sessionFilterUserId = ref('');
const sessionFilterId = ref('');
const selectedSession = ref<SessionRow | null>(null);
const timelineLoading = ref(false);
const timeline = ref<TimelineMsg[]>([]);
const timelineReversed = computed(() => [...timeline.value].reverse());

const messagesLoading = ref(false);
const messages = ref<MessageRow[]>([]);
const messageFilters = reactive({ userId: '', sessionId: '', characterId: '', role: 'all', query: '' });

const logsLoading = ref(false);
const logs = ref<AgentLog[]>([]);
const externalAuditLoading = ref(false);
const externalAuditLogs = ref<ExternalAuditLogRow[]>([]);
const externalAuditFilters = reactive({ status: 'block' as ExternalAuditStatus | 'all', blockCode: '', userId: '', sessionId: '', modelId: '', query: '' });
const imageReviewLoading = ref(false);
const imageReviewRows = ref<ImageReviewRow[]>([]);
const imageFilters = reactive({ userId: '', sessionId: '', messageId: '', status: '', blocked: '', query: '' });

const kindItems = [
	{ value: 'all', label: '全部' },
	{ value: 'character', label: '角色' },
	{ value: 'style', label: '风格提示词' },
];
const statusItems = [
	{ value: 'all', label: '全部' },
	{ value: 'pending', label: '待审' },
	{ value: 'published', label: '已发布' },
	{ value: 'rejected', label: '已拒绝' },
	{ value: 'draft', label: '草稿' },
];
const roleItems = [
	{ value: 'all', label: '全部' },
	{ value: 'user', label: '用户' },
	{ value: 'assistant', label: '智能体' },
	{ value: 'system', label: '系统' },
];
const externalAuditStatusItems = [
	{ value: 'block', label: '已拦截' },
	{ value: 'allow', label: '已放行' },
	{ value: 'failed', label: '模型失败' },
	{ value: 'all_failed', label: '全部失败放行' },
	{ value: 'all', label: '全部' },
];
const imageStatusItems = [
	{ value: '', label: '全部' },
	{ value: 'generating', label: '生成中' },
	{ value: 'succeeded', label: '成功' },
	{ value: 'failed', label: '失败' },
	{ value: 'auto_cleaned', label: '图片已被清理' },
];
const imageBlockedItems = [
	{ value: '', label: '全部' },
	{ value: 'true', label: '已封禁' },
	{ value: 'false', label: '未封禁' },
];

definePage({
	title: i18n.ts._agents.adminAgentReview,
	icon: 'ti ti-checkbox',
});

function mapResponse(res: ReviewListResponse): ReviewResource[] {
	return [
		...res.characters.map(c => ({ ...c, kind: 'character' as const })),
		...res.styles.map(s => ({ ...s, kind: 'style' as const })),
	];
}

async function loadPending() {
	reviewLoading.value = true;
	try {
		const res = await misskeyApi('admin/agents/review/list-pending' as any, { status: 'pending', kind: 'all', limit: 200 }) as ReviewListResponse;
		pendingCharacters.value = res.characters.map(c => ({ ...c, kind: 'character' as const }));
		pendingStyles.value = res.styles.map(s => ({ ...s, kind: 'style' as const }));
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	} finally {
		reviewLoading.value = false;
	}
}

async function loadResources() {
	resourceLoading.value = true;
	try {
		const res = await misskeyApi('admin/agents/review/list-pending' as any, {
			kind: resourceFilters.kind,
			status: resourceFilters.status,
			query: resourceFilters.query.trim() || null,
			userId: resourceFilters.userId.trim() || null,
			limit: 200,
		}) as ReviewListResponse;
		resources.value = mapResponse(res);
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	} finally {
		resourceLoading.value = false;
	}
}

function resetResourceFilters() {
	resourceFilters.kind = 'all';
	resourceFilters.status = 'all';
	resourceFilters.query = '';
	resourceFilters.userId = '';
	void loadResources();
}

async function approveResource(item: ReviewResource) {
	const { canceled } = await os.confirm({ type: 'info', text: `通过「${item.name}」？` });
	if (canceled) return;
	await resolveResource(item, 'approve', {});
}

async function rejectResource(item: ReviewResource) {
	const { canceled, result } = await os.form('拒绝审核', {
		rejectReason: {
			type: 'enum',
			label: '标准原因',
			required: true,
			default: 'policy',
			enum: [
				{ label: '违反社区规范', value: 'policy' },
				{ label: '色情或露骨内容', value: 'sexual' },
				{ label: '暴力或危险内容', value: 'violence' },
				{ label: '仇恨或骚扰', value: 'hate' },
				{ label: '违法或侵权', value: 'illegal' },
				{ label: '提示词注入/越权', value: 'prompt_injection' },
				{ label: '广告或低质内容', value: 'spam' },
				{ label: '其他', value: 'other' },
			],
		},
		rejectMessage: { type: 'string', label: '给作者的说明', required: true, multiline: true },
		internalNote: { type: 'string', label: '内部备注', required: false, multiline: true },
	});
	if (canceled) return;
	await resolveResource(item, 'reject', result);
}

async function resolveResource(item: ReviewResource, decision: 'approve' | 'reject', extra: Record<string, unknown>) {
	try {
		await misskeyApi('admin/agents/review/resolve', {
			kind: item.kind,
			id: item.id,
			decision,
			...extra,
		} as any);
		os.toast(i18n.ts.done);
		await Promise.all([loadPending(), loadResources()]);
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	}
}

async function banResource(item: ReviewResource) {
	if (item.kind !== 'character') return;
	const next = !item.moderationBanned;
	const { canceled, result } = await os.form(next ? '封禁角色' : '解封角色', {
		reason: { type: 'string', label: '处理原因', required: next, multiline: true },
	});
	if (canceled) return;
	try {
		await misskeyApi('admin/agents/characters/set-moderation-banned', {
			characterId: item.id,
			banned: next,
			reason: result.reason || null,
		} as any);
		os.toast(i18n.ts.done);
		await Promise.all([loadPending(), loadResources(), loadLogs()]);
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	}
}

async function showDiff(item: ReviewResource) {
	try {
		const res = await misskeyApi('admin/agents/review/diff' as any, {
			kind: item.kind,
			id: item.id,
		}) as { hasChanges: boolean; fields: { key: string; draftPreview: string; publishedPreview: string }[] };
		if (!res.hasChanges) {
			await os.alert({ type: 'info', text: '当前草稿与已发布版本没有差异。' });
			return;
		}
		await os.alert({
			type: 'info',
			title: `版本差异：${item.name}`,
			text: res.fields.map(f => `【${reviewFieldLabel(f.key)}】\n当前：${formatReviewFieldPreview(f.key, f.draftPreview)}\n已发布：${formatReviewFieldPreview(f.key, f.publishedPreview)}`).join('\n\n'),
		});
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	}
}

async function loadSessions(reset = false) {
	sessionsLoading.value = true;
	if (reset) selectedSession.value = null;
	try {
		sessions.value = await misskeyApi('admin/agents/sessions/list', {
			userId: sessionFilterUserId.value.trim() || null,
			sessionId: sessionFilterId.value.trim() || null,
			limit: 50,
		}) as SessionRow[];
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	} finally {
		sessionsLoading.value = false;
	}
}

async function loadTimeline(session: SessionRow) {
	selectedSession.value = session;
	timelineLoading.value = true;
	try {
		timeline.value = await misskeyApi('admin/agents/messages/timeline', { sessionId: session.id, limit: 100 }) as TimelineMsg[];
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	} finally {
		timelineLoading.value = false;
	}
}

async function toggleSessionBan(session: SessionRow) {
	const next = !session.moderationBanned;
	const { canceled, result } = await os.form(next ? '封禁会话' : '解封会话', {
		reason: { type: 'string', label: '处理原因', required: next, multiline: true },
	});
	if (canceled) return;
	try {
		await misskeyApi('admin/agents/sessions/set-moderation-banned', {
			sessionId: session.id,
			banned: next,
			reason: result.reason || null,
		} as any);
		os.toast(i18n.ts.done);
		await Promise.all([loadSessions(), loadLogs()]);
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	}
}

async function searchMessages() {
	messagesLoading.value = true;
	try {
		const params: Record<string, unknown> = { limit: 80 };
		const userId = messageFilters.userId.trim();
		const sessionId = messageFilters.sessionId.trim();
		const characterId = messageFilters.characterId.trim();
		const query = messageFilters.query.trim();
		if (userId) params.userId = userId;
		if (sessionId) params.sessionId = sessionId;
		if (characterId) params.characterId = characterId;
		if (messageFilters.role !== 'all') params.role = messageFilters.role;
		if (query) params.query = query;
		messages.value = await misskeyApi('admin/agents/messages/list', params as any) as MessageRow[];
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	} finally {
		messagesLoading.value = false;
	}
}

async function loadExternalAuditLogs() {
	externalAuditLoading.value = true;
	try {
		const params: Record<string, unknown> = { limit: 80 };
		const userId = externalAuditFilters.userId.trim();
		const sessionId = externalAuditFilters.sessionId.trim();
		const modelId = externalAuditFilters.modelId.trim();
		const blockCode = externalAuditFilters.blockCode.trim();
		const query = externalAuditFilters.query.trim();
		if (externalAuditFilters.status !== 'all') params.status = externalAuditFilters.status;
		if (userId) params.userId = userId;
		if (sessionId) params.sessionId = sessionId;
		if (modelId) params.modelId = modelId;
		if (blockCode) params.blockCode = blockCode;
		if (query) params.query = query;
		externalAuditLogs.value = await misskeyApi('admin/agents/external-audit/logs/list' as any, params) as ExternalAuditLogRow[];
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	} finally {
		externalAuditLoading.value = false;
	}
}

function resetExternalAuditFilters() {
	externalAuditFilters.status = 'block';
	externalAuditFilters.blockCode = '';
	externalAuditFilters.userId = '';
	externalAuditFilters.sessionId = '';
	externalAuditFilters.modelId = '';
	externalAuditFilters.query = '';
	void loadExternalAuditLogs();
}

async function loadImageReviews() {
	imageReviewLoading.value = true;
	try {
		imageReviewRows.value = await misskeyApi(
			'admin/agents/images/list' as Parameters<typeof misskeyApi>[0],
			{
				userId: imageFilters.userId.trim() || null,
				sessionId: imageFilters.sessionId.trim() || null,
				messageId: imageFilters.messageId.trim() || null,
				status: imageFilters.status || null,
				blocked: imageFilters.blocked === '' ? null : imageFilters.blocked === 'true',
				query: imageFilters.query.trim() || null,
				limit: 60,
			} as any,
		) as ImageReviewRow[];
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	} finally {
		imageReviewLoading.value = false;
	}
}

function resetImageFilters() {
	imageFilters.userId = '';
	imageFilters.sessionId = '';
	imageFilters.messageId = '';
	imageFilters.status = '';
	imageFilters.blocked = '';
	imageFilters.query = '';
	void loadImageReviews();
}

function openImageReviewUrl(url: string | null) {
	if (!url) return;
	window.open(url, '_blank', 'noopener');
}

async function toggleImageBlocked(row: ImageReviewRow) {
	let reason: string | null = null;
	if (!row.isBlocked) {
		const result = await os.inputText({
			title: '封禁原因',
			text: '可留空。',
		});
		if (result.canceled) return;
		reason = result.result || null;
	}
	try {
		await misskeyApi(
			'admin/agents/images/set-blocked' as Parameters<typeof misskeyApi>[0],
			{ id: row.id, blocked: !row.isBlocked, reason } as any,
		);
		await loadImageReviews();
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	}
}

async function loadLogs() {
	logsLoading.value = true;
	try {
		logs.value = await misskeyApi('admin/agents/review/logs' as any, { type: 'all', limit: 50 }) as AgentLog[];
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	} finally {
		logsLoading.value = false;
	}
}

function jumpSession(sessionId: string) {
	activeTab.value = 'sessions';
	sessionFilterId.value = sessionId;
	void loadSessions(true);
}

function openLegacyChatAudit() {
	router.push('/admin/agents-chat-audit' as any);
}

function copyText(text: string) {
	copyToClipboard(text);
}

function sessionKindLabel(kind: string) {
	return kind === 'draft_test' ? i18n.ts._agents.sessionKindDraft : i18n.ts._agents.sessionKindCommunity;
}

function roleLabel(role: string) {
	if (role === 'user') return '用户';
	if (role === 'assistant') return '智能体';
	return '系统';
}

function externalAuditStatusLabel(status: ExternalAuditStatus) {
	if (status === 'block') return '已拦截';
	if (status === 'allow') return '已放行';
	if (status === 'failed') return '模型失败';
	return '全部失败放行';
}

function formatTime(v: string | null | undefined) {
	return v ? formatDateTimeString(new Date(v), 'yyyy-MM-dd HH:mm') : '—';
}

function logTitle(log: AgentLog) {
	if (log.type === 'resolveAgentReview') return '审核处理';
	if (log.type === 'setAgentSessionModerationBan') return '会话封禁处理';
	if (log.type === 'setAgentCharacterModerationBan') return '角色封禁处理';
	return log.type;
}

function logInfoString(log: AgentLog, key: string) {
	const value = log.info[key];
	return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function logInfoBoolean(log: AgentLog, key: string) {
	const value = log.info[key];
	return typeof value === 'boolean' ? value : null;
}

function logInfoNumber(log: AgentLog, key: string) {
	const value = log.info[key];
	return typeof value === 'number' ? value : null;
}

function reviewKindLabel(kind: string | null) {
	if (kind === 'character') return '角色';
	if (kind === 'style') return '风格提示词';
	return kind ?? '—';
}

function reviewDecisionLabel(decision: string | null) {
	if (decision === 'approve') return '通过';
	if (decision === 'reject') return '拒绝';
	return decision ?? '处理';
}

function banStateLabel(value: boolean | null) {
	if (value == null) return '—';
	return value ? '已封禁' : '未封禁';
}

function logDecisionLabel(log: AgentLog) {
	if (log.type === 'resolveAgentReview') return reviewDecisionLabel(logInfoString(log, 'decision'));
	if (log.type === 'setAgentSessionModerationBan' || log.type === 'setAgentCharacterModerationBan') {
		return logInfoBoolean(log, 'banned') ? '封禁' : '解封';
	}
	return '记录';
}

function logDecisionClass(log: AgentLog) {
	const decision = logInfoString(log, 'decision');
	const banned = logInfoBoolean(log, 'banned');
	if (decision === 'approve' || banned === false) return style.logDecisionOk;
	if (decision === 'reject' || banned === true) return style.logDecisionWarn;
	return null;
}

function logRows(log: AgentLog): { label: string; value: string; code?: boolean }[] {
	if (log.type === 'resolveAgentReview') {
		const version = logInfoNumber(log, 'publishedVersion');
		return [
			{ label: '对象', value: logInfoString(log, 'name') ?? '—' },
			{ label: '类型', value: reviewKindLabel(logInfoString(log, 'kind')) },
			{ label: '对象 ID', value: logInfoString(log, 'id') ?? '—', code: true },
			{ label: '作者 ID', value: logInfoString(log, 'ownerUserId') ?? '—', code: true },
			{ label: '审核结果', value: reviewDecisionLabel(logInfoString(log, 'decision')) },
			{ label: '当前状态', value: logInfoString(log, 'reviewStatus') ?? '—' },
			{ label: '发布版本', value: version == null ? '—' : `V${version}` },
			{ label: '公开', value: logInfoBoolean(log, 'isPublished') ? '是' : '否' },
		];
	}
	if (log.type === 'setAgentSessionModerationBan') {
		return [
			{ label: '会话', value: logInfoString(log, 'sessionName') ?? '—' },
			{ label: '会话 ID', value: logInfoString(log, 'sessionId') ?? '—', code: true },
			{ label: '用户 ID', value: logInfoString(log, 'userId') ?? '—', code: true },
			{ label: '角色 ID', value: logInfoString(log, 'characterId') ?? '—', code: true },
			{ label: '变更前', value: banStateLabel(logInfoBoolean(log, 'before')) },
			{ label: '变更后', value: banStateLabel(logInfoBoolean(log, 'banned')) },
		];
	}
	if (log.type === 'setAgentCharacterModerationBan') {
		return [
			{ label: '角色', value: logInfoString(log, 'characterName') ?? '—' },
			{ label: '角色 ID', value: logInfoString(log, 'characterId') ?? '—', code: true },
			{ label: '作者 ID', value: logInfoString(log, 'ownerUserId') ?? '—', code: true },
			{ label: '变更前', value: banStateLabel(logInfoBoolean(log, 'before')) },
			{ label: '变更后', value: banStateLabel(logInfoBoolean(log, 'banned')) },
		];
	}
	return Object.entries(log.info).map(([label, value]) => ({
		label,
		value: typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : JSON.stringify(value),
	}));
}

function logReason(log: AgentLog) {
	return logInfoString(log, 'rejectReason') ?? logInfoString(log, 'reason');
}

function logMessage(log: AgentLog) {
	return logInfoString(log, 'rejectMessage');
}

function logInternalNote(log: AgentLog) {
	return logInfoString(log, 'internalNote');
}

function reviewFieldLabel(key: string) {
	const labels: Record<string, string> = {
		name: '名称',
		summary: '简介',
		personality: '人设',
		background: '背景',
		speakingStyle: '说话风格',
		greeting: '开场白',
		exampleDialogue: '示例对话',
		forbiddenBehavior: '禁止行为',
		worldbook: '世界书',
		body: '风格提示词正文',
	};
	return labels[key] ?? key;
}

function formatReviewFieldPreview(key: string, value: string | null | undefined) {
	if (key === 'worldbook') return formatWorldbookDiffText(value);
	return value?.trim() || '—';
}

function normalizeWorldbookForReview(raw: unknown): WorldbookReviewEntry[] {
	if (!Array.isArray(raw)) return [];
	return raw.flatMap((item): WorldbookReviewEntry[] => {
		if (!item || typeof item !== 'object') return [];
		const entry = item as Record<string, unknown>;
		if (typeof entry.id !== 'string') return [];
		return [{
			id: entry.id,
			title: typeof entry.title === 'string' ? entry.title : '',
			content: typeof entry.content === 'string' ? entry.content : '',
			keywords: Array.isArray(entry.keywords) ? entry.keywords.filter((keyword): keyword is string => typeof keyword === 'string') : [],
			triggerMode: entry.triggerMode === 'always' || entry.triggerMode === 'manual' ? entry.triggerMode : 'keyword',
			priority: typeof entry.priority === 'number' ? entry.priority : 0,
			enabled: entry.enabled !== false,
			revision: typeof entry.revision === 'number' ? entry.revision : 1,
		}];
	});
}

function worldbookStats(entries: WorldbookReviewEntry[] | null | undefined) {
	const rows = entries ?? [];
	const enabled = rows.filter(entry => entry.enabled).length;
	const contentLength = rows.reduce((sum, entry) => sum + entry.content.trim().length, 0);
	const modeCounts = rows.reduce<Record<WorldbookReviewEntry['triggerMode'], number>>((acc, entry) => {
		acc[entry.triggerMode]++;
		return acc;
	}, { keyword: 0, manual: 0, always: 0 });
	return { total: rows.length, enabled, contentLength, modeCounts };
}

function triggerModeLabel(mode: WorldbookReviewEntry['triggerMode']) {
	if (mode === 'always') return '常驻';
	if (mode === 'manual') return '手动';
	return '关键词';
}

function formatWorldbookEntryForReview(entry: WorldbookReviewEntry, index: number) {
	const keywords = entry.keywords.map(keyword => keyword.trim()).filter(Boolean).join('、') || '—';
	return [
		`${index + 1}. ${entry.title || '未命名条目'}（${entry.enabled ? '启用' : '停用'} · ${triggerModeLabel(entry.triggerMode)} · 优先级 ${entry.priority} · 修订 ${entry.revision}）`,
		`关键词：${keywords}`,
		`正文：${entry.content.trim() || '—'}`,
	].join('\n');
}

function formatWorldbookReviewText(entries: WorldbookReviewEntry[] | null | undefined) {
	const rows = entries ?? [];
	if (rows.length === 0) return '—';
	return rows
		.slice()
		.sort((a, b) => {
			if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
			return b.priority - a.priority || b.revision - a.revision || a.title.localeCompare(b.title);
		})
		.map(formatWorldbookEntryForReview)
		.join('\n\n');
}

function formatWorldbookDiffText(value: string | null | undefined) {
	if (!value?.trim()) return '—';
	try {
		const entries = normalizeWorldbookForReview(JSON.parse(value));
		if (entries.length === 0) return '无世界书';
		const stats = worldbookStats(entries);
		return [
			`启用 ${stats.enabled}/${stats.total} 条 · 正文 ${stats.contentLength} 字符 · 关键词 ${stats.modeCounts.keyword} / 手动 ${stats.modeCounts.manual} / 常驻 ${stats.modeCounts.always}`,
			'优先级数值越大越优先。',
			formatWorldbookReviewText(entries),
		].join('\n\n');
	} catch {
		return value.trim();
	}
}

const ReviewCard = defineComponent({
	props: {
		item: { type: Object as () => ReviewResource, required: true },
		pending: { type: Boolean, default: false },
	},
	emits: ['approve', 'reject', 'ban', 'diff'],
	setup(props, { emit }) {
		const riskTags = computed(() => {
			const worldbookText = props.item.worldbook?.flatMap(entry => [
				entry.title,
				entry.content,
				...entry.keywords,
			]).join('\n');
			const text = [
				props.item.name, props.item.summary, props.item.personality, props.item.background,
				props.item.speakingStyle, props.item.greeting, props.item.forbiddenBehavior, props.item.body,
				worldbookText,
			].filter(Boolean).join('\n');
			const tags: string[] = [];
			if (text.length > 6000) tags.push('长提示词');
			const worldbookCount = props.item.worldbook?.length ?? 0;
			if (worldbookCount > 0) tags.push(`世界书 ${worldbookCount}`);
			if (/越狱|jailbreak|忽略.*规则|ignore.*instruction/i.test(text)) tags.push('提示词注入');
			if (/色情|暴力|仇恨|违法|侵权|自杀|武器/.test(text)) tags.push('敏感词');
			if (props.item.publishedVersion != null) tags.push('更新再审');
			if (props.item.promptOpenSourced) tags.push('开源提示词');
			if (props.item.reviewStatus === 'rejected') tags.push('曾被拒绝');
			return tags;
		});

		return () => h('article', { class: '_panel ' + style.resourceCard }, [
			h('div', { class: style.cardHead }, [
				h('div', [
					h('div', { class: style.titleLine }, [
						h('i', { class: props.item.kind === 'character' ? 'ti ti-user' : 'ti ti-message-cog' }),
						h('h3', props.item.name),
					]),
					h('p', { class: style.muted }, [
						props.item.kind === 'character' ? '角色' : '风格提示词',
						` · ${props.item.reviewStatus}`,
						` · ID ${props.item.id}`,
					]),
				]),
				h('div', { class: style.badgeRow }, riskTags.value.map(t => h('span', { class: style.kindBadge }, t))),
			]),
			h('div', { class: style.ownerRow }, [
				props.item.avatar ? h(MkDriveFileThumbnail, { file: props.item.avatar, fit: 'cover', class: style.avatar }) : null,
				h('div', [
					h(MkUserName, { user: props.item.user }),
					' · ',
					h(MkAcct, { user: props.item.user }),
					h('div', { class: style.muted }, `创建 ${formatTime(props.item.createdAt)} · 更新 ${formatTime(props.item.updatedAt)}`),
				]),
			]),
			h('div', { class: style.metaGrid }, [
				h('span', `版本：${props.item.publishedVersion == null ? '首次提交' : `V${props.item.publishedVersion} 更新`}`),
				h('span', `公开：${props.item.isPublished ? '是' : '否'}`),
				props.item.kind === 'character' ? h('span', `封禁：${props.item.moderationBanned ? '是' : '否'}`) : h('span', '封禁：不适用'),
				h('span', `提示词：${props.item.promptOpenSourced ? '作者公开' : '仅审查可见'}`),
			]),
			h('div', { class: style.contentGrid }, props.item.kind === 'character' ? [
				block('简介', props.item.summary),
				block('人设', props.item.personality),
				block('背景', props.item.background),
				block('说话风格', props.item.speakingStyle),
				block('开场白', props.item.greeting),
				block('示例对话', props.item.exampleTurns?.map(t => `${t.role}: ${t.content}`).join('\n\n') || null),
				block('禁止行为', props.item.forbiddenBehavior),
				worldbookBlock(props.item.worldbook),
			] : [
				block('简介', props.item.summary),
				block('风格提示词正文', props.item.body),
			]),
			props.item.reviewRejectReason || props.item.reviewRejectMessage || props.item.reviewInternalNote ? h('div', { class: style.rejectBox }, [
				h('b', '最近拒绝/备注'),
				h('p', `原因：${props.item.reviewRejectReason ?? '—'}`),
				h('pre', props.item.reviewRejectMessage ?? '—'),
				props.item.reviewInternalNote ? h('pre', props.item.reviewInternalNote) : null,
			]) : null,
			h('div', { class: '_buttons' }, [
				props.pending ? h(MkButton, { primary: true, rounded: true, onClick: () => emit('approve', props.item) }, () => [h('i', { class: 'ti ti-check' }), ' 通过']) : null,
				props.pending ? h(MkButton, { danger: true, rounded: true, onClick: () => emit('reject', props.item) }, () => [h('i', { class: 'ti ti-x' }), ' 拒绝']) : null,
				props.item.kind === 'character' ? h(MkButton, { rounded: true, danger: !props.item.moderationBanned, onClick: () => emit('ban', props.item) }, () => [h('i', { class: 'ti ti-ban' }), props.item.moderationBanned ? ' 解封角色' : ' 封禁角色']) : null,
				props.item.publishedVersion != null ? h(MkButton, { rounded: true, onClick: () => emit('diff', props.item) }, () => [h('i', { class: 'ti ti-diff' }), ' 查看差异']) : null,
				h(MkButton, { rounded: true, onClick: () => copyText(props.item.id) }, () => [h('i', { class: 'ti ti-copy' }), ' 复制 ID']),
			]),
		]);
	},
});

function block(title: string, value: string | null | undefined) {
	return h('section', { class: style.block }, [
		h('h4', title),
		h('pre', { class: style.pre }, value?.trim() || '—'),
	]);
}

function worldbookBlock(entries: WorldbookReviewEntry[] | null | undefined) {
	const stats = worldbookStats(entries);
	return h('section', { class: [style.block, style.worldbookBlock] }, [
		h('div', { class: style.worldbookHead }, [
			h('h4', '世界书'),
			h('span', { class: style.worldbookNote }, '优先级数值越大越优先'),
		]),
		h('div', { class: style.worldbookSummary }, [
			h('span', `条目：${stats.enabled}/${stats.total} 启用`),
			h('span', `正文：${stats.contentLength} 字符`),
			h('span', `触发：关键词 ${stats.modeCounts.keyword} · 手动 ${stats.modeCounts.manual} · 常驻 ${stats.modeCounts.always}`),
		]),
		h('pre', { class: style.pre }, formatWorldbookReviewText(entries)),
	]);
}

watch(activeTab, tab => {
	if (tab === 'resources' && resources.value.length === 0) void loadResources();
	if (tab === 'sessions' && sessions.value.length === 0) void loadSessions();
	if (tab === 'messages' && messages.value.length === 0) void searchMessages();
	if (tab === 'externalAudit' && externalAuditLogs.value.length === 0) void loadExternalAuditLogs();
	if (tab === 'images' && imageReviewRows.value.length === 0) void loadImageReviews();
	if (tab === 'logs' && logs.value.length === 0) void loadLogs();
	const url = new URL(window.location.href);
	if (tab === 'queue') {
		url.searchParams.delete('tab');
	} else {
		url.searchParams.set('tab', tab);
	}
	window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
});

onMounted(() => {
	void Promise.all([loadPending(), loadResources(), loadLogs()]);
	if (activeTab.value === 'images') void loadImageReviews();
	if (activeTab.value === 'externalAudit') void loadExternalAuditLogs();
});
</script>

<style lang="scss" module>
.summaryGrid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
	gap: 12px;
}
.summaryCard {
	padding: 14px 16px;
	border-radius: 8px;
}
.summaryLabel {
	display: block;
	font-size: 0.86em;
	color: var(--MI_THEME-fgTransparentWeak);
}
.summaryValue {
	display: block;
	margin-top: 4px;
	font-size: 1.55em;
}
.tabBar {
	display: flex;
	gap: 8px;
	flex-wrap: wrap;
}
.tab {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 8px 12px;
	border-radius: 8px;
	border: 1px solid var(--MI_THEME-divider);
	background: var(--MI_THEME-panel);
}
.tabActive {
	color: var(--MI_THEME-accent);
	border-color: var(--MI_THEME-accent);
}
.toolbar,
.filterPanel {
	padding: 14px 16px;
	border-radius: 8px;
	background: var(--MI_THEME-panel);
	border: 1px solid var(--MI_THEME-divider);
}
.toolbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
}
.toolbarTitle h2 {
	margin: 0;
	font-size: 1.05em;
}
.toolbarTitle p,
.muted {
	margin: 4px 0 0;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.9em;
}
.resourceCard,
.messageCard,
.sessionCard,
.logRow {
	padding: 14px 16px;
	border-radius: 8px;
}
.externalAuditCard {
	padding: 14px 16px;
	border-radius: 8px;
}
.cardHead {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 12px;
}
.cardHead h3 {
	margin: 0;
	font-size: 1.05em;
}
.titleLine {
	display: flex;
	align-items: center;
	gap: 8px;
}
.badgeRow {
	display: flex;
	gap: 6px;
	flex-wrap: wrap;
	justify-content: flex-end;
}
.kindBadge,
.dangerBadge {
	display: inline-flex;
	align-items: center;
	padding: 2px 8px;
	border-radius: 999px;
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
	font-size: 0.82em;
}
.dangerBadge {
	background: var(--MI_THEME-errorBg);
	color: var(--MI_THEME-error);
}
.auditCode {
	display: inline-flex;
	align-items: center;
	min-height: 24px;
	padding: 2px 9px;
	border-radius: 999px;
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
	font-size: 0.82em;
	font-weight: 700;
}
.externalAuditHead {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	margin-bottom: 10px;
}
.externalAuditBadges {
	display: flex;
	align-items: center;
	gap: 6px;
	flex-wrap: wrap;
	min-width: 0;
}
.externalAuditHead time {
	flex: 0 0 auto;
	color: var(--MI_THEME-fg);
	font-weight: 700;
}
.externalAuditMeta {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 8px;
	margin-bottom: 10px;
}
.externalAuditMeta span {
	min-width: 0;
	padding: 8px 10px;
	border-radius: 8px;
	background: color-mix(in srgb, var(--MI_THEME-bg) 82%, transparent);
	border: 1px solid var(--MI_THEME-divider);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.externalAuditMeta b {
	margin-right: 8px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.82em;
}
.auditDecision {
	display: grid;
	grid-template-columns: auto minmax(0, 1fr);
	gap: 10px;
	align-items: start;
	margin-bottom: 10px;
	padding: 10px 12px;
	border-radius: 8px;
	background: var(--MI_THEME-infoBg);
	border: 1px solid var(--MI_THEME-divider);
}
.auditDecision span {
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.84em;
	font-weight: 700;
}
.auditDecision p {
	margin: 0;
	line-height: 1.45;
	word-break: break-word;
}
.auditPayloadGrid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
	margin-bottom: 12px;
}
.auditPayload {
	min-width: 0;
	border-radius: 8px;
	border: 1px solid var(--MI_THEME-divider);
	background: color-mix(in srgb, var(--MI_THEME-panel) 72%, var(--MI_THEME-bg));
	overflow: hidden;
}
.auditPayload h4 {
	margin: 0;
	padding: 8px 10px;
	border-bottom: 1px solid var(--MI_THEME-divider);
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.84em;
	font-weight: 700;
}
.auditPayloadText {
	margin: 0;
	padding: 10px 12px;
	max-height: 220px;
	overflow: auto;
	background: var(--MI_THEME-bg);
	white-space: pre-wrap;
	word-break: break-word;
	overflow-wrap: anywhere;
	line-height: 1.5;
	font-size: 0.92em;
}
.ownerRow {
	display: flex;
	align-items: center;
	gap: 10px;
	margin: 12px 0;
}
.avatar {
	width: 48px;
	height: 48px;
	border-radius: 8px;
	overflow: hidden;
}
.metaGrid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
	gap: 8px;
	margin: 10px 0;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.9em;
}
.contentGrid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
	gap: 10px;
	margin: 12px 0;
}
.block h4 {
	margin: 0 0 6px;
	font-size: 0.88em;
	color: var(--MI_THEME-fgTransparentWeak);
}
.worldbookBlock {
	grid-column: 1 / -1;
}
.worldbookHead {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	margin: 0 0 6px;
}
.worldbookHead h4 {
	margin: 0;
}
.worldbookNote {
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.82em;
}
.worldbookSummary {
	display: flex;
	gap: 8px;
	flex-wrap: wrap;
	margin: 0 0 8px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.86em;
}
.worldbookSummary span {
	padding: 2px 8px;
	border-radius: 999px;
	background: var(--MI_THEME-bg);
	border: 1px solid var(--MI_THEME-divider);
}
.pre {
	margin: 0;
	padding: 10px 12px;
	border-radius: 8px;
	background: var(--MI_THEME-bg);
	border: 1px solid var(--MI_THEME-divider);
	white-space: pre-wrap;
	word-break: break-word;
	max-height: 320px;
	overflow: auto;
	line-height: 1.45;
}
.rejectBox {
	margin: 12px 0;
	padding: 10px 12px;
	border-radius: 8px;
	border: 1px solid var(--MI_THEME-warn);
	background: var(--MI_THEME-infoWarnBg);
}
.sessionGrid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
	gap: 12px;
}
.timeline {
	display: flex;
	flex-direction: column;
	gap: 10px;
}
.message {
	padding: 10px 12px;
	border-radius: 8px;
	background: var(--MI_THEME-panel);
	border: 1px solid var(--MI_THEME-divider);
}
.msgHead {
	display: flex;
	justify-content: space-between;
	gap: 12px;
	margin-bottom: 6px;
	color: var(--MI_THEME-fgTransparentWeak);
}
.logTitle {
	display: flex;
	align-items: center;
	gap: 8px;
	flex-wrap: wrap;
}
.logDecision {
	display: inline-flex;
	align-items: center;
	padding: 2px 8px;
	border-radius: 999px;
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
	font-size: 0.78em;
	font-weight: 700;
}
.logDecisionOk {
	background: color-mix(in srgb, var(--MI_THEME-success) 16%, transparent);
	color: var(--MI_THEME-success);
}
.logDecisionWarn {
	background: var(--MI_THEME-warnBg);
	color: var(--MI_THEME-warn);
}
.logActor {
	display: flex;
	align-items: center;
	gap: 8px;
	flex-wrap: wrap;
	margin: 10px 0 12px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.9em;
}
.logActor span {
	color: var(--MI_THEME-fgTransparentWeak);
}
.logMetaGrid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
	gap: 8px;
}
.logMetaItem {
	min-width: 0;
	padding: 8px 10px;
	border-radius: 8px;
	background: var(--MI_THEME-bg);
	border: 1px solid var(--MI_THEME-divider);
}
.logMetaItem span {
	display: block;
	margin-bottom: 3px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.82em;
}
.logMetaItem b,
.logMetaItem code {
	display: block;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.logNotes {
	display: grid;
	gap: 8px;
	margin-top: 10px;
}
.logNote {
	padding: 9px 10px;
	border-radius: 8px;
	background: var(--MI_THEME-infoBg);
	border: 1px solid var(--MI_THEME-divider);
}
.logNote span {
	display: block;
	margin-bottom: 4px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.82em;
}
.logNote p {
	margin: 0;
	white-space: pre-wrap;
	word-break: break-word;
	line-height: 1.45;
}
.imageReviewGrid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
	gap: 14px;
}
.imageReviewCard {
	overflow: hidden;
	border-radius: 8px;
}
.imageReviewBox {
	display: grid;
	place-items: center;
	aspect-ratio: 4 / 3;
	background: color-mix(in srgb, var(--MI_THEME-panel) 90%, var(--MI_THEME-bg));
	border-bottom: 1px solid var(--MI_THEME-divider);
}
.imageReviewBox > img {
	width: 100%;
	height: 100%;
	object-fit: contain;
}
.imageReviewEmpty {
	display: flex;
	align-items: center;
	justify-content: center;
	flex-direction: column;
	gap: 8px;
	color: var(--MI_THEME-fgTransparentWeak);
}
.imageReviewEmpty > i {
	font-size: 2em;
}
.imageReviewBody {
	padding: 14px;
}
.imagePrompt {
	margin: 0;
	line-height: 1.45;
	word-break: break-word;
}
@media (max-width: 700px) {
	.toolbar,
	.cardHead {
		flex-direction: column;
	}
	.contentGrid {
		grid-template-columns: 1fr;
	}
	.externalAuditHead {
		align-items: flex-start;
		flex-direction: column;
	}
	.externalAuditMeta,
	.auditPayloadGrid {
		grid-template-columns: 1fr;
	}
	.auditDecision {
		grid-template-columns: 1fr;
	}
}
</style>
