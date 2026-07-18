<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader showBack narrowMergedRow :actions="headerActions">
	<div class="_spacer" style="--MI_SPACER-w: 1100px;">
		<MkLoading v-if="loading"/>
		<template v-else>
			<div v-if="reviewRejected" :class="$style.reviewRejectBox">
				<div :class="$style.reviewRejectTitle"><i class="ti ti-alert-triangle"></i> 未通过审核</div>
				<div v-if="reviewRejectReason" :class="$style.reviewRejectMeta">原因：{{ rejectReasonLabel(reviewRejectReason) }}</div>
				<p v-if="reviewRejectMessage">{{ reviewRejectMessage }}</p>
				<p v-else>管理员没有填写具体说明，请修改后重新提交审核。</p>
			</div>

			<!-- Mobile: horizontal tab bar -->
			<div :class="$style.mobileTabBar">
				<button
					v-for="tab in navTabs"
					:key="tab.key"
					type="button"
					:class="[$style.mobileTabItem, activeTab === tab.key && $style.mobileTabActive]"
					@click="activeTab = tab.key"
				>
					<i :class="tab.icon"></i>
					<span>{{ tab.label }}</span>
				</button>
			</div>

			<div :class="$style.layout">
				<!-- Sidebar -->
				<aside :class="$style.sidebar">
					<div :class="$style.sidebarAvatar">
						<img v-if="avatarUrl" :class="$style.sidebarAvatarImg" :src="avatarUrl" alt="">
						<div v-else :class="$style.sidebarAvatarPlaceholder"><i class="ti ti-user"></i></div>
						<div :class="$style.sidebarName">{{ form.state.name.trim() || i18n.ts._agents.editCharacter }}</div>
					</div>

					<nav :class="$style.sidebarNav">
						<button
							v-for="tab in navTabs"
							:key="tab.key"
							type="button"
							:class="[$style.sidebarNavItem, activeTab === tab.key && $style.sidebarNavActive]"
							@click="activeTab = tab.key"
						>
							<i :class="tab.icon"></i>
							<span>{{ tab.label }}</span>
						</button>
					</nav>

					<div :class="$style.sidebarFooter">
						<button type="button" :class="$style.sidebarDanger" @click="remove">
							<i class="ti ti-trash"></i> {{ i18n.ts._agents.deleteCharacter }}
						</button>
					</div>
				</aside>

				<!-- Content -->
				<main :class="$style.content">
					<!-- Tab: Basic -->
					<div v-if="activeTab === 'basic'" class="_gaps">
						<div :class="$style.sectionTitle"><i class="ti ti-id"></i> {{ i18n.ts._agents.editCharacterBasic }}</div>
						<div :class="$style.avatarRow">
							<img v-if="avatarUrl" :class="$style.avatarImg" :src="avatarUrl" alt="">
							<div v-else :class="$style.avatarPlaceholder"><i class="ti ti-user"></i></div>
							<div class="_gaps_s">
								<MkButton rounded @click="pickAvatar"><i class="ti ti-photo"></i> {{ i18n.ts._agents.avatarPick }}</MkButton>
								<MkButton v-if="form.state.avatarFileId" rounded @click="clearAvatar">{{ i18n.ts._agents.avatarClear }}</MkButton>
							</div>
						</div>
						<div :class="$style.referenceImageRow">
							<div :class="$style.referenceImagePreviews">
								<div v-for="preview in referenceImagePreviews" :key="preview.id" :class="$style.referenceImagePreview">
									<img v-if="preview.url" :src="preview.url" alt="">
									<div v-else :class="$style.referenceImagePreviewFallback"><i class="ti ti-photo"></i></div>
									<button class="_button" :class="$style.referenceImageRemove" :title="i18n.ts.delete" @click="removeReferenceImage(preview.id)"><i class="ti ti-x"></i></button>
								</div>
								<div v-if="referenceImagePreviews.length === 0" :class="$style.referenceImageEmpty"><i class="ti ti-photo"></i></div>
							</div>
							<div class="_gaps_s">
								<div :class="$style.referenceImageTitle">{{ i18n.ts._agents.characterReferenceImage }}</div>
								<div :class="$style.referenceImageCaption">{{ i18n.ts._agents.characterReferenceImageCaption }}</div>
								<div :class="$style.referenceImageActions">
									<MkButton rounded :disabled="form.state.referenceImageFileIds.length >= 4" @click="pickReferenceImages"><i class="ti ti-upload"></i> {{ i18n.ts._agents.characterReferenceImagePick }}</MkButton>
									<MkButton v-if="form.state.referenceImageFileIds.length > 0" rounded @click="clearReferenceImages">{{ i18n.ts._agents.characterReferenceImageClear }}</MkButton>
								</div>
							</div>
						</div>
						<MkInput v-model="form.state.name">
							<template #label>{{ i18n.ts._agents.fieldName }}</template>
						</MkInput>
						<MkTextarea v-model="form.state.summary">
							<template #label>{{ i18n.ts._agents.fieldSummary }}</template>
							<template #caption>{{ i18n.ts._agents.fieldSummaryCaption }}</template>
						</MkTextarea>
						<MkSwitch v-model="form.state.promptOpenSourced">
							<template #label>允许公开角色提示词</template>
							<template #caption>{{ i18n.ts._agents.openSourcePromptCharacterCaption }}</template>
						</MkSwitch>
					</div>

					<!-- Tab: Persona -->
					<div v-if="activeTab === 'persona'" class="_gaps">
						<div :class="$style.sectionTitle"><i class="ti ti-brain"></i> {{ i18n.ts._agents.editCharacterPersona }}</div>
						<MkTextarea v-model="form.state.personality" tall>
							<template #label>{{ i18n.ts._agents.fieldPersonality }}</template>
						</MkTextarea>
						<MkTextarea v-model="form.state.background" tall>
							<template #label>{{ i18n.ts._agents.fieldBackground }}</template>
						</MkTextarea>
						<MkTextarea v-model="form.state.speakingStyle" tall>
							<template #label>{{ i18n.ts._agents.fieldSpeakingStyle }}</template>
						</MkTextarea>
						<div :class="$style.sectionDivider"></div>
						<div :class="$style.sectionSubtitle"><i class="ti ti-shield"></i> {{ i18n.ts._agents.editCharacterSafety }}</div>
						<MkTextarea v-model="form.state.forbiddenBehavior" tall>
							<template #label>{{ i18n.ts._agents.fieldForbidden }}</template>
						</MkTextarea>
					</div>

					<!-- Tab: Dialogue -->
					<div v-if="activeTab === 'dialogue'" class="_gaps">
						<div :class="$style.sectionTitle"><i class="ti ti-message"></i> {{ i18n.ts._agents.editCharacterDialogue }}</div>
						<MkTextarea v-model="form.state.greeting" tall>
							<template #label>{{ i18n.ts._agents.fieldGreeting }}</template>
							<template #caption>{{ i18n.ts._agents.fieldGreetingCaption }}</template>
						</MkTextarea>
						<div :class="$style.sectionDivider"></div>
						<div :class="$style.sectionSubtitle">{{ i18n.ts._agents.fieldExampleDialogue }}</div>
						<p :class="$style.captionText">{{ i18n.ts._agents.fieldExampleDialogueCaption }}</p>
						<div
							v-for="(turn, i) in form.state.exampleTurns"
							:key="i"
							:class="$style.card"
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

					<!-- Tab: Worldbook -->
					<div v-if="activeTab === 'worldbook'" class="_gaps">
						<div :class="$style.sectionTitle"><i class="ti ti-book"></i> 世界书</div>
						<div v-for="(entry, i) in form.state.worldbook" :key="entry.id" :class="$style.card" class="_gaps_s">
							<div :class="$style.cardHeader">
								<MkInput v-model="entry.title" :class="$style.cardHeaderInput">
									<template #label>标题</template>
								</MkInput>
								<div :class="$style.cardActions">
									<MkButton inline rounded @click="duplicateWorldbook(i)"><i class="ti ti-copy"></i></MkButton>
									<MkButton danger inline rounded @click="removeWorldbook(i)"><i class="ti ti-trash"></i></MkButton>
								</div>
							</div>
							<MkTextarea v-model="entry.content" tall>
								<template #label>内容</template>
							</MkTextarea>
							<MkTextarea v-model="entry.keywordsText" :rows="keywordTextareaRows(entry.keywordsText)">
								<template #label>关键词（英文逗号、中文逗号或换行分隔）</template>
								<template #caption>每行一个关键词，或用英文逗号 , / 中文逗号 ， 分隔。</template>
							</MkTextarea>
							<div :class="$style.wbMetaRow">
								<div :class="$style.wbTrigger">
									<div :class="$style.wbTriggerLabel">触发方式</div>
									<MkTab v-model="entry.triggerMode" :tabs="triggerModeTabs"/>
									<div :class="$style.wbTriggerCaption">{{ triggerModeDescription(entry.triggerMode) }}</div>
								</div>
								<MkInput :modelValue="String(entry.priority)" :class="$style.wbPriority" @update:modelValue="v => { entry.priority = Number(v) || 0; }">
									<template #label>优先级</template>
									<template #caption>数值越大越优先。</template>
								</MkInput>
								<MkSwitch v-model="entry.enabled" :class="$style.wbEnabled">
									<template #label>启用</template>
								</MkSwitch>
							</div>
						</div>
						<div>
							<MkButton rounded inline @click="addWorldbook"><i class="ti ti-plus"></i> 新增世界书条目</MkButton>
						</div>

						<div :class="$style.sectionDivider"></div>

						<div :class="$style.card" class="_gaps_s">
							<div :class="$style.sectionSubtitle"><i class="ti ti-sparkles"></i> 命中预览</div>
							<p :class="$style.captionText">默认每轮最多注入 12 条：常驻最多 4 条、手动最多 4 条、关键词最多 8 条；仍有空位时，会按优先级从所有命中条目中补齐。手动条目需要在用户消息里写 <code>[[wb:标题或ID]]</code> 才会命中。</p>
							<MkTextarea v-model="worldbookPreviewText" tall>
								<template #label>测试输入</template>
								<template #caption>输入一段用户消息，点击下方按钮预览本轮将注入的世界书条目。</template>
							</MkTextarea>
							<div v-if="manualWorldbookEntries.length > 0" :class="$style.manualChips">
								<span :class="$style.manualChipsLabel">手动触发：</span>
								<button
									v-for="me in manualWorldbookEntries"
									:key="me.id"
									type="button"
									:class="$style.manualChip"
									:title="'插入 [[wb:' + me.title + ']]'"
									@click="insertManualHint(me.title)"
								>
									<i class="ti ti-plus"></i> {{ me.title }}
								</button>
							</div>
							<div>
								<MkButton rounded :disabled="worldbookPreviewLoading || worldbookPreviewText.trim().length === 0" @click="runWorldbookPreview">
									<i class="ti ti-sparkles"></i> 预览命中
								</MkButton>
							</div>
							<MkLoading v-if="worldbookPreviewLoading"/>
							<div v-else-if="worldbookPreviewMatches.length === 0" :class="$style.captionText">暂无命中结果。</div>
							<div v-else class="_gaps_s">
								<div v-for="item in worldbookPreviewMatches" :key="item.id" :class="$style.matchCard">
									<div :class="$style.matchHeader">
										<span :class="$style.matchTitle">{{ item.title }}</span>
										<span :class="$style.matchMeta">{{ item.matchedBy }} · p{{ item.priority }}</span>
									</div>
									<div :class="$style.matchInfo">
										trigger={{ item.triggerMode }} · revision={{ item.revision }}
										<template v-if="item.matchedKeywords.length > 0"> · keywords={{ item.matchedKeywords.join(', ') }}</template>
									</div>
								</div>
							</div>
						</div>
						<div :class="$style.hintCard">
							<i class="ti ti-info-circle"></i>
							<div>
								<div>手动触发表示：支持 <code>[[wb:条目标题]]</code> 或 <code>[[wb:条目ID]]</code> 点名命中，不会自动匹配关键词。</div>
								<div>关键词用换行、英文逗号或中文逗号分隔；中文关键词按包含关系匹配，英文关键词按单词边界匹配。</div>
							</div>
						</div>
					</div>

					<!-- Tab: Regex -->
					<div v-if="activeTab === 'regex'" class="_gaps">
						<div :class="$style.sectionTitle"><i class="ti ti-filter"></i> {{ agentText('editCharacterRegex', '正则') }}</div>
						<p :class="$style.captionText">{{ agentText('editCharacterRegexCaption', '对匹配到的用户消息或 AI 输出应用过滤。原始消息仍会保留，编辑消息时显示完整内容。') }}</p>
						<div :class="$style.card" class="_gaps_s">
							<div :class="$style.sectionSubtitle"><i class="ti ti-flask"></i> {{ agentText('regexTestPreview', '测试预览') }}</div>
							<p :class="$style.captionText">{{ agentText('regexTestCaption', '按当前未保存的规则预览用户端显示内容和发送给 AI 的内容。') }}</p>
							<MkRadios v-model="regexPreviewRole" :options="regexPreviewRoleOptions">
								<template #label>{{ agentText('regexTestSource', '测试消息类型') }}</template>
							</MkRadios>
							<MkTextarea v-model="regexPreviewText" tall>
								<template #label>{{ agentText('regexTestInput', '测试文本') }}</template>
							</MkTextarea>
							<div v-if="regexPreview.invalidRuleCount > 0" :class="$style.regexPreviewWarning">
								<i class="ti ti-alert-triangle"></i> {{ agentText('regexTestInvalidRules', '存在无效正则，预览已忽略这些规则。') }}
							</div>
							<div :class="$style.regexPreviewGrid">
								<div :class="$style.regexPreviewResult">
									<div :class="$style.regexPreviewTitle"><i class="ti ti-user"></i> {{ agentText('regexTestUserView', '用户端显示') }}</div>
									<pre v-if="regexPreview.userVisible !== ''" :class="$style.regexPreviewText">{{ regexPreview.userVisible }}</pre>
									<div v-else :class="$style.regexPreviewEmpty">{{ agentText('regexTestEmpty', '无内容') }}</div>
								</div>
								<div :class="$style.regexPreviewResult">
									<div :class="$style.regexPreviewTitle"><i class="ti ti-brain"></i> {{ agentText('regexTestAiView', '发送给 AI') }}</div>
									<pre v-if="regexPreview.aiVisible !== ''" :class="$style.regexPreviewText">{{ regexPreview.aiVisible }}</pre>
									<div v-else :class="$style.regexPreviewEmpty">{{ agentText('regexTestEmpty', '无内容') }}</div>
								</div>
							</div>
						</div>
						<div v-for="(rule, i) in form.state.regexRules" :key="rule.id" :class="$style.card" class="_gaps_s">
							<div :class="$style.cardHeader">
								<div :class="$style.sectionSubtitle">{{ agentText('regexRule', '正则规则') }} {{ i + 1 }}</div>
								<MkButton danger inline rounded @click="removeRegexRule(i)"><i class="ti ti-trash"></i></MkButton>
							</div>
							<MkTextarea v-model="rule.pattern" tall>
								<template #label>{{ agentText('regexPattern', '正则表达式') }}</template>
								<template #caption>{{ agentText('regexPatternCaption', '使用 JavaScript 正则语法；匹配内容会被删除。') }}</template>
							</MkTextarea>
							<div :class="$style.regexOptions">
								<div>
									<div :class="$style.sectionSubtitle">{{ agentText('regexTargets', '作用对象（可多选）') }}</div>
									<MkSwitch v-model="rule.targets.user"><template #label>{{ agentText('regexTargetUser', '用户消息') }}</template></MkSwitch>
									<MkSwitch v-model="rule.targets.assistant"><template #label>{{ agentText('regexTargetAssistant', 'AI 输出') }}</template></MkSwitch>
								</div>
								<div>
									<div :class="$style.sectionSubtitle">{{ agentText('regexEffects', '作用效果（可多选）') }}</div>
									<MkSwitch v-model="rule.effects.hide"><template #label>{{ agentText('regexEffectHide', '不显示') }}</template></MkSwitch>
									<MkSwitch v-model="rule.effects.aiInvisible"><template #label>{{ agentText('regexEffectAiInvisible', 'AI 看不见') }}</template></MkSwitch>
								</div>
							</div>
						</div>
						<div><MkButton rounded inline :disabled="form.state.regexRules.length >= 64" @click="addRegexRule"><i class="ti ti-plus"></i> {{ agentText('addRegexRule', '添加正则') }}</MkButton></div>
					</div>

					<!-- Tab: Versions -->
					<div v-if="activeTab === 'versions'" class="_gaps">
						<div :class="$style.sectionTitle"><i class="ti ti-history"></i> 版本管理</div>

						<!-- Diff -->
						<div :class="$style.card" class="_gaps_s">
							<div :class="$style.sectionSubtitle">草稿与发布版差异</div>
							<MkLoading v-if="diffLoading"/>
							<div v-else-if="versionDiffFields.length === 0" :class="$style.captionText">当前草稿与发布版没有差异，或尚未发布过版本。</div>
							<div v-else class="_gaps_s">
								<div v-for="item in versionDiffFields" :key="item.key" :class="$style.diffCard">
									<button type="button" :class="$style.diffFieldHeader" @click="toggleDiffField(item.key)">
										<i class="ti" :class="expandedDiffKeys.includes(item.key) ? 'ti-chevron-down' : 'ti-chevron-right'"></i>
										<span :class="$style.diffFieldName">{{ diffFieldLabel(item.key) }}</span>
									</button>
									<div v-if="expandedDiffKeys.includes(item.key)" :class="$style.diffLines">
										<div
											v-for="(line, idx) in computeDiffLines(item.key, item.publishedPreview, item.draftPreview)"
											:key="idx"
											:class="[$style.diffLine, line.type === 'add' ? $style.diffAdd : line.type === 'del' ? $style.diffDel : $style.diffSame]"
										>
											<span :class="$style.diffSign">{{ line.type === 'add' ? '+' : line.type === 'del' ? '-' : '' }}</span>
											<span :class="$style.diffText">{{ line.text || ' ' }}</span>
										</div>
									</div>
									<template v-else>
										<div :class="$style.diffPreview">草稿：{{ summarizeDiffText(item.draftPreview) }}</div>
										<div :class="$style.diffPreview">发布：{{ summarizeDiffText(item.publishedPreview) }}</div>
									</template>
								</div>
							</div>
						</div>

						<!-- Version list -->
						<MkLoading v-if="versionsLoading"/>
						<div v-else-if="versionItems.length" class="_gaps_s">
							<div v-for="(item, idx) in versionItems" :key="item.version + '-' + idx" :class="$style.card">
								<div :class="$style.versionRow">
									<div>
										<div :class="$style.versionLabel">
											{{ item.isCurrentDraft ? '草稿版本' : item.isHistorical ? '历史版本' : '发布快照' }} v{{ item.version }}
										</div>
										<div :class="$style.versionMeta">
											{{ item.reviewStatus }} · {{ formatIsoTime(item.updatedAt) }}
										</div>
									</div>
									<div>
										<MkButton v-if="item.isHistorical" rounded inline :disabled="rollbackPending" @click="rollbackToVersion(item.version, item.isCurrentPublished)">
											<i class="ti ti-rotate-2"></i> {{ item.isCurrentPublished ? '回滚到此发布版' : '回滚到此历史版' }}
										</MkButton>
										<MkButton v-else-if="item.isPublished && !item.isCurrentDraft" rounded inline :disabled="rollbackPending" @click="rollbackToPublished">
											<i class="ti ti-rotate-2"></i> 回滚到发布版
										</MkButton>
									</div>
								</div>
								<div :class="$style.versionDetail">
									草稿版本号：{{ item.draftRevision }}
									<template v-if="item.isPublished"> · 已发布版本号：{{ item.version }}</template>
									<template v-if="item.isCurrentDraft"> · 当前草稿</template>
									<template v-if="item.isCurrentPublished"> · 当前发布</template>
								</div>
							</div>
						</div>
						<div v-else :class="$style.captionText">当前还没有可显示的版本数据。</div>
					</div>

					<!-- Save bar -->
					<div v-if="form.modified.value" :class="$style.saveBar">
						<MkFormFooter :form="form"/>
					</div>
				</main>
			</div>
		</template>
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
import MkTab from '@/components/MkTab.vue';
import MkFormFooter from '@/components/MkFormFooter.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { agentI18nText } from '@/utility/agent-i18n.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { useForm } from '@/composables/use-form.js';
import * as os from '@/os.js';
import { useRouter } from '@/router.js';
import type { PageHeaderItem } from '@/types/page-header.js';

const props = defineProps<{
	characterId: string;
}>();

const router = useRouter();
const loading = ref(true);
const avatarUrl = ref<string | null>(null);
const referenceImagePreviews = ref<Array<{ id: string; url: string | null }>>([]);

function agentText(key: keyof typeof i18n.ts._agents, fallback: string): string {
	return agentI18nText(`_agents.${key}`, fallback);
}

const headerActions = computed<PageHeaderItem[]>(() => [{
	icon: 'ti ti-help-circle',
	text: '角色设计帮助',
	handler: () => {
		router.push('/agents/character-guide' as const);
	},
}]);

type TabKey = 'basic' | 'persona' | 'dialogue' | 'worldbook' | 'regex' | 'versions';
const activeTab = ref<TabKey>('basic');

const navTabs: Array<{ key: TabKey; icon: string; label: string }> = [
		{ key: 'basic', icon: 'ti ti-id', label: '基本信息' },
		{ key: 'persona', icon: 'ti ti-brain', label: '人设' },
		{ key: 'dialogue', icon: 'ti ti-message', label: '对话与示例' },
	{ key: 'worldbook', icon: 'ti ti-book', label: '世界书' },
	{ key: 'regex', icon: 'ti ti-filter', label: agentText('editCharacterRegex', '正则') },
		{ key: 'versions', icon: 'ti ti-history', label: '版本管理' },
];

const triggerModeTabs = [
		{ key: 'keyword' as const, label: '关键词' },
		{ key: 'manual' as const, label: '手动' },
		{ key: 'always' as const, label: '常驻' },
];

function triggerModeDescription(mode: 'keyword' | 'manual' | 'always'): string {
	if (mode === 'manual') return '手动触发：只有用户消息里出现 [[wb:标题或ID]] 时才命中，不会自动匹配关键词。';
	if (mode === 'always') return '常驻：每轮都会参与注入候选，受常驻最多 4 条和总数 12 条限制。';
	return '关键词：用户消息命中关键词时注入，中文按包含关系匹配，英文按单词边界匹配。';
}

type CharacterVersionItem = {
	version: number;
	draftRevision: number;
	reviewStatus: string;
	isPublished: boolean;
	createdAt: string;
	updatedAt: string;
	isCurrentDraft: boolean;
	isCurrentPublished: boolean;
	isHistorical: boolean;
};

const versionsLoading = ref(false);
const rollbackPending = ref(false);
const versionItems = ref<CharacterVersionItem[]>([]);
const diffLoading = ref(false);
const versionDiffFields = ref<Array<{ key: string; draftPreview: string; publishedPreview: string }>>([]);
const reviewStatus = ref<string>('draft');
const reviewRejectReason = ref<string | null>(null);
const reviewRejectMessage = ref<string | null>(null);
const worldbookPreviewLoading = ref(false);
const worldbookPreviewText = ref('');
const worldbookPreviewMatches = ref<Array<{
	id: string;
	title: string;
	triggerMode: string;
	priority: number;
	revision: number;
	matchedBy: string;
	matchedKeywords: string[];
}>>([]);

type ExampleTurnForm = { role: 'user' | 'assistant'; content: string };

const exampleRoleOptions = computed(() => [
	{ value: 'user' as const, label: i18n.ts._agents.exampleTurnRoleUser },
	{ value: 'assistant' as const, label: i18n.ts._agents.exampleTurnRoleAssistant },
]);
const reviewRejected = computed(() => reviewStatus.value === 'rejected' && form.state.publishedVersion == null);

type WorldbookForm = {
	id: string;
	title: string;
	content: string;
	keywordsText: string;
	triggerMode: 'keyword' | 'manual' | 'always';
	priority: number;
	enabled: boolean;
	revision: number;
};

type WorldbookPayload = {
	id: string;
	title: string;
	content: string;
	keywords: string[];
	triggerMode: 'keyword' | 'manual' | 'always';
	priority: number;
	enabled: boolean;
	revision: number;
};

type RegexForm = { id: string; pattern: string; targets: { user: boolean; assistant: boolean }; effects: { hide: boolean; aiInvisible: boolean } };

const regexPreviewText = ref('');
const regexPreviewRole = ref<'user' | 'assistant'>('user');
const regexPreviewRoleOptions = computed(() => [
	{ value: 'user' as const, label: agentText('regexTargetUser', '用户消息') },
	{ value: 'assistant' as const, label: agentText('regexTargetAssistant', 'AI 输出') },
]);
const regexPreview = computed(() => {
	let userVisible = regexPreviewText.value;
	let aiVisible = regexPreviewText.value;
	let invalidRuleCount = 0;
	for (const rule of form.state.regexRules) {
		if (rule.pattern.trim() === '' || !rule.targets[regexPreviewRole.value]) continue;
		try {
			if (rule.effects.hide) userVisible = userVisible.replace(new RegExp(rule.pattern, 'gu'), '');
			if (rule.effects.aiInvisible) aiVisible = aiVisible.replace(new RegExp(rule.pattern, 'gu'), '');
		} catch {
			invalidRuleCount++;
		}
	}
	return { userVisible, aiVisible, invalidRuleCount };
});

function buildRegexPayload(entries: RegexForm[]) {
	return entries.map(rule => ({
		id: rule.id,
		pattern: rule.pattern,
		targets: [rule.targets.user ? 'user' : null, rule.targets.assistant ? 'assistant' : null].filter((v): v is 'user' | 'assistant' => v != null),
		effects: [rule.effects.hide ? 'hide' : null, rule.effects.aiInvisible ? 'aiInvisible' : null].filter((v): v is 'hide' | 'aiInvisible' => v != null),
	})).filter(rule => rule.pattern.trim().length > 0 && rule.targets.length > 0 && rule.effects.length > 0);
}

function buildWorldbookPayload(entries: WorldbookForm[]): WorldbookPayload[] {
	return entries
		.map(entry => ({
			id: entry.id,
			title: entry.title.trim(),
			content: entry.content,
			keywords: entry.keywordsText.split(/[\n,，]/).map(s => s.trim()).filter(Boolean),
			triggerMode: entry.triggerMode,
			priority: Number.isFinite(entry.priority) ? entry.priority : 0,
			enabled: entry.enabled,
			revision: entry.revision,
		}))
		.filter(entry => entry.title.length > 0);
}

function keywordTextareaRows(text: string): number {
	return Math.max(1, text.split('\n').length);
}

function rejectReasonLabel(reason: string) {
	const labels: Record<string, string> = {
		policy: '违反社区规范',
		sexual: '色情或露骨内容',
		violence: '暴力或危险内容',
		hate: '仇恨或骚扰',
		illegal: '违法或侵权',
		prompt_injection: '提示词注入/越权',
		spam: '广告或低质内容',
		other: '其他',
	};
	return labels[reason] ?? reason;
}

const empty = () => ({
	name: '',
	summary: '',
	personality: '',
	background: '',
	speakingStyle: '',
	greeting: '',
	exampleTurns: [] as ExampleTurnForm[],
	worldbook: [] as WorldbookForm[],
	regexRules: [] as RegexForm[],
	forbiddenBehavior: '',
	avatarFileId: null as string | null,
	referenceImageFileIds: [] as string[],
	promptOpenSourced: false,
	publishedVersion: null as number | null,
	draftRevision: 1,
});

const form = useForm(empty(), async (state) => {
	const exampleTurns = state.exampleTurns
		.map(t => ({ role: t.role, content: t.content.trim() }))
		.filter(t => t.content.length > 0);
	const invalidWorldbook = state.worldbook.find(entry => entry.title.trim().length === 0 && entry.content.trim().length > 0);
	if (invalidWorldbook) {
		await os.alert({ type: 'error', text: '世界书条目标题不能为空。请补充标题或删除该条目。' });
		return;
	}
	const worldbook = buildWorldbookPayload(state.worldbook);
	for (const rule of state.regexRules) {
		if (rule.pattern.trim() === '' || (!rule.targets.user && !rule.targets.assistant) || (!rule.effects.hide && !rule.effects.aiInvisible)) {
			await os.alert({ type: 'error', text: agentText('regexRuleIncomplete', '请填写正则表达式，并至少选择一个作用对象和一个作用效果。') });
			return;
		}
		try { new RegExp(rule.pattern, 'gu'); } catch {
			await os.alert({ type: 'error', text: agentText('regexPatternInvalid', '正则表达式无效，请检查语法。') });
			return;
		}
	}
	const regexRules = buildRegexPayload(state.regexRules);
	await misskeyApi('agents/characters/update', {
		characterId: props.characterId,
		name: state.name,
		summary: state.summary.trim() === '' ? null : state.summary,
		personality: state.personality,
		background: state.background,
		speakingStyle: state.speakingStyle,
		greeting: state.greeting,
		exampleTurns,
		worldbook,
		regexRules,
		forbiddenBehavior: state.forbiddenBehavior,
		avatarFileId: state.avatarFileId,
		referenceImageFileIds: state.referenceImageFileIds,
		promptOpenSourced: state.promptOpenSourced,
	});
	await Promise.all([loadVersions(), loadCharacterDiff()]);
});

function addExampleTurn() {
	if (form.state.exampleTurns.length >= 24) return;
	form.state.exampleTurns.push({ role: 'user', content: '' });
}

function removeExampleTurn(index: number) {
	form.state.exampleTurns.splice(index, 1);
}

function addWorldbook() {
	form.state.worldbook.push({
		id: crypto.randomUUID(),
		title: '',
		content: '',
		keywordsText: '',
		triggerMode: 'keyword',
		priority: 0,
		enabled: true,
		revision: 1,
	});
}

function duplicateWorldbook(index: number) {
	const src = form.state.worldbook[index];
	if (!src) return;
	form.state.worldbook.splice(index + 1, 0, {
		...structuredClone(src),
		id: crypto.randomUUID(),
		title: `${src.title} (复制)`,
		revision: src.revision + 1,
	});
}

function removeWorldbook(index: number) {
	form.state.worldbook.splice(index, 1);
}

function addRegexRule() {
	if (form.state.regexRules.length >= 64) return;
	form.state.regexRules.push({ id: crypto.randomUUID(), pattern: '', targets: { user: true, assistant: true }, effects: { hide: true, aiInvisible: false } });
}

function removeRegexRule(index: number) {
	form.state.regexRules.splice(index, 1);
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

watch(() => form.state.referenceImageFileIds.join('\u0000'), () => {
	void refreshReferenceImagePreviews(form.state.referenceImageFileIds);
});

async function load() {
	loading.value = true;
	try {
		const [rawRow] = await Promise.all([
			misskeyApi('agents/characters/show', { characterId: props.characterId }),
			loadVersions(),
			loadCharacterDiff(),
		]);
		const row = rawRow as any;
		reviewStatus.value = row.reviewStatus ?? 'draft';
		reviewRejectReason.value = row.reviewRejectReason ?? null;
		reviewRejectMessage.value = row.reviewRejectMessage ?? null;
		const turns: ExampleTurnForm[] = (row.exampleTurns ?? []).map((t: any) => ({
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
			worldbook: (row.worldbook ?? []).map((entry: any) => ({
				id: entry.id,
				title: entry.title ?? '',
				content: entry.content ?? '',
				keywordsText: Array.isArray(entry.keywords) ? entry.keywords.join(', ') : '',
				triggerMode: entry.triggerMode ?? 'keyword',
				priority: Number(entry.priority ?? 0),
				enabled: entry.enabled !== false,
				revision: Number(entry.revision ?? 1),
			})),
			regexRules: (row.regexRules ?? []).map((rule: any) => ({
				id: rule.id ?? crypto.randomUUID(),
				pattern: rule.pattern ?? '',
				targets: { user: Array.isArray(rule.targets) && rule.targets.includes('user'), assistant: Array.isArray(rule.targets) && rule.targets.includes('assistant') },
				effects: { hide: Array.isArray(rule.effects) && rule.effects.includes('hide'), aiInvisible: Array.isArray(rule.effects) && rule.effects.includes('aiInvisible') },
			})),
			forbiddenBehavior: row.forbiddenBehavior ?? '',
			avatarFileId: row.avatarFileId,
			referenceImageFileIds: Array.isArray(row.referenceImageFileIds)
				? row.referenceImageFileIds.filter((id: unknown): id is string => typeof id === 'string').slice(0, 4)
				: row.referenceImageFileId ? [row.referenceImageFileId] : [],
			promptOpenSourced: row.promptOpenSourced === true,
			publishedVersion: row.publishedVersion ?? null,
			draftRevision: row.draftRevision ?? 1,
		};
		Object.assign(form.state, next);
		Object.assign(form.savedState, JSON.parse(JSON.stringify(next)));
		await refreshAvatarPreview(row.avatarFileId);
		await refreshReferenceImagePreviews(next.referenceImageFileIds);
	} catch {
		os.alert({ type: 'error', text: i18n.ts.somethingHappened });
		router.push('/agents');
	} finally {
		loading.value = false;
	}
}

async function loadVersions() {
	versionsLoading.value = true;
	try {
		const rows = await misskeyApi('agents/characters/versions', { characterId: props.characterId });
		versionItems.value = Array.isArray(rows) ? rows : [];
		return rows;
	} finally {
		versionsLoading.value = false;
	}
}

async function loadCharacterDiff() {
	diffLoading.value = true;
	try {
		const row = await misskeyApi('agents/characters/diff', { characterId: props.characterId });
		versionDiffFields.value = Array.isArray(row?.fields) ? row.fields : [];
	} finally {
		diffLoading.value = false;
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

async function pickReferenceImages() {
	const remaining = 4 - form.state.referenceImageFileIds.length;
	if (remaining <= 0) return;
	const files = await os.chooseFileFromPc({ multiple: true });
	if (files.length === 0) return;
	const selected = files.slice(0, remaining);
	if (selected.some(file => !file.type.startsWith('image/') || file.size > 5 * 1024 * 1024)) {
		os.alert({ type: 'error', text: i18n.ts._agents.characterReferenceImageInvalid });
		return;
	}
	try {
		const uploaded = await os.launchUploader(selected, { multiple: true });
		form.state.referenceImageFileIds = [...new Set([...form.state.referenceImageFileIds, ...uploaded.map(file => file.id)])].slice(0, 4);
	} catch {
		// user cancelled uploader
	}
}

function removeReferenceImage(fileId: string) {
	form.state.referenceImageFileIds = form.state.referenceImageFileIds.filter(id => id !== fileId);
}

function clearReferenceImages() {
	form.state.referenceImageFileIds = [];
}

async function rollbackToPublished() {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: '确定要将当前草稿回滚到已发布版本吗？',
	});
	if (canceled) return;
	rollbackPending.value = true;
	try {
		await misskeyApi('agents/characters/rollback', { characterId: props.characterId });
		os.toast('已回滚到发布版本。');
		await load();
	} finally {
		rollbackPending.value = false;
	}
}

async function rollbackToVersion(version: number, isCurrentPublished: boolean) {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: isCurrentPublished
			? `确定要将当前草稿回滚到发布版 v${version} 吗？`
			: `确定要将当前草稿回滚到历史版本 v${version} 吗？该操作会用历史快照覆盖当前编辑内容。`,
	});
	if (canceled) return;
	rollbackPending.value = true;
	try {
		await misskeyApi('agents/characters/rollback', { characterId: props.characterId, version });
		os.toast(`已回滚到版本 v${version}。`);
		await load();
	} finally {
		rollbackPending.value = false;
	}
}

async function refreshReferenceImagePreviews(fileIds: string[]) {
	referenceImagePreviews.value = await Promise.all(fileIds.slice(0, 4).map(async (fileId) => {
		try {
			const file = await misskeyApi('drive/files/show', { fileId });
			return { id: fileId, url: file.thumbnailUrl ?? file.url };
		} catch {
			return { id: fileId, url: null };
		}
	}));
}

const manualWorldbookEntries = computed(() => form.state.worldbook
	.filter(entry => entry.triggerMode === 'manual' && entry.enabled && entry.title.trim().length > 0)
	.map(entry => ({ id: entry.id, title: entry.title.trim() })));

function insertManualHint(title: string) {
	const hint = `[[wb:${title}]]`;
	const cur = worldbookPreviewText.value;
	worldbookPreviewText.value = cur.trim().length === 0 ? hint : `${cur} ${hint}`;
}

async function runWorldbookPreview() {
	worldbookPreviewLoading.value = true;
	try {
		const worldbook = buildWorldbookPayload(form.state.worldbook);
		const rows = await misskeyApi('agents/characters/worldbook-match-preview', {
			characterId: props.characterId,
			text: worldbookPreviewText.value,
			maxItems: 12,
			worldbook,
		});
		worldbookPreviewMatches.value = Array.isArray(rows) ? rows : [];
	} finally {
		worldbookPreviewLoading.value = false;
	}
}

function formatIsoTime(iso: string) {
	try {
		return new Date(iso).toLocaleString();
	} catch {
		return iso;
	}
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

function summarizeDiffText(s: string): string {
	if (!s) return '(empty)';
	return s.length > 120 ? `${s.slice(0, 120)}...` : s;
}

const expandedDiffKeys = ref<string[]>([]);

function toggleDiffField(key: string) {
	const idx = expandedDiffKeys.value.indexOf(key);
	if (idx >= 0) expandedDiffKeys.value.splice(idx, 1);
	else expandedDiffKeys.value.push(key);
}

const diffFieldLabels: Record<string, string> = {
	name: '',
	summary: '',
	personality: '',
	background: '',
	speakingStyle: '',
	greeting: '',
	exampleDialogue: '示例对话',
	forbiddenBehavior: '',
	avatarFileId: '头像',
	worldbook: '世界书',
	regexRules: '正则',
};

function diffFieldLabel(key: string): string {
	return diffFieldLabels[key] ?? key;
}

function prettyForDiff(key: string, text: string): string {
	if (key !== 'worldbook') return text;
	try {
		return JSON.stringify(JSON.parse(text), null, 2);
	} catch {
		return text;
	}
}

type DiffLine = { type: 'same' | 'add' | 'del'; text: string };

function computeDiffLines(key: string, publishedText: string, draftText: string): DiffLine[] {
	const aLines = prettyForDiff(key, publishedText).split('\n');
	const bLines = prettyForDiff(key, draftText).split('\n');
	const n = aLines.length;
	const m = bLines.length;
	const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
	for (let i = n - 1; i >= 0; i--) {
		for (let j = m - 1; j >= 0; j--) {
			dp[i][j] = aLines[i] === bLines[j]
				? dp[i + 1][j + 1] + 1
				: Math.max(dp[i + 1][j], dp[i][j + 1]);
		}
	}
	const out: DiffLine[] = [];
	let i = 0;
	let j = 0;
	while (i < n && j < m) {
		if (aLines[i] === bLines[j]) {
			out.push({ type: 'same', text: aLines[i] });
			i++; j++;
		} else if (dp[i + 1][j] >= dp[i][j + 1]) {
			out.push({ type: 'del', text: aLines[i] });
			i++;
		} else {
			out.push({ type: 'add', text: bLines[j] });
			j++;
		}
	}
	while (i < n) { out.push({ type: 'del', text: aLines[i] }); i++; }
	while (j < m) { out.push({ type: 'add', text: bLines[j] }); j++; }
	return out;
}
</script>

<style lang="scss" module>
/* ===== Layout ===== */
.layout {
	display: grid;
	grid-template-columns: 200px minmax(0, 1fr);
	gap: 24px;
	align-items: start;
}

/* ===== Mobile Tab Bar (hidden on desktop) ===== */
.mobileTabBar {
	display: none;
	width: 100%;
	max-width: 100%;
	min-width: 0;
	overflow-x: auto;
	overflow-y: hidden;
	gap: 4px;
	padding: 8px 2px 10px;
	margin-bottom: 8px;
	-webkit-overflow-scrolling: touch;
	touch-action: pan-x;
	overscroll-behavior-x: contain;
	scroll-snap-type: x proximity;
	scrollbar-width: none;
	&::-webkit-scrollbar { display: none; }
}
.mobileTabItem {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	padding: 8px 14px;
	border-radius: 999px;
	border: solid 1px var(--MI_THEME-divider);
	background: var(--MI_THEME-panel);
	color: var(--MI_THEME-fg);
	font-size: 0.85rem;
	white-space: nowrap;
	cursor: pointer;
	flex-shrink: 0;
	scroll-snap-align: start;
	transition: background 0.15s, color 0.15s;
}
.mobileTabActive {
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
	border-color: transparent;
	font-weight: 600;
}

/* ===== Sidebar ===== */
.sidebar {
	position: sticky;
	top: 72px;
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 16px 0;
}
.sidebarAvatar {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 8px;
	padding: 12px 8px 16px;
	margin-bottom: 8px;
}
.sidebarAvatarImg {
	width: 56px;
	height: 56px;
	border-radius: 14px;
	object-fit: cover;
	border: solid 1px var(--MI_THEME-divider);
}
.sidebarAvatarPlaceholder {
	width: 56px;
	height: 56px;
	border-radius: 14px;
	display: flex;
	align-items: center;
	justify-content: center;
	background: var(--MI_THEME-panel);
	border: dashed 1px var(--MI_THEME-divider);
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 1.4rem;
}
.sidebarName {
	font-weight: 700;
	font-size: 0.9rem;
	text-align: center;
	word-break: break-word;
	max-width: 100%;
}
.sidebarNav {
	display: flex;
	flex-direction: column;
	gap: 2px;
}
.sidebarNavItem {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 10px 14px;
	border-radius: var(--MI-radius);
	border: none;
	background: none;
	color: var(--MI_THEME-fg);
	font: inherit;
	font-size: 0.9rem;
	cursor: pointer;
	text-align: left;
	transition: background 0.15s, color 0.15s;

	&:hover {
		background: var(--MI_THEME-panelHighlight);
	}
}
.sidebarNavActive {
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
	font-weight: 600;
}
.sidebarFooter {
	margin-top: auto;
	padding-top: 16px;
}
.sidebarDanger {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 8px 14px;
	border-radius: var(--MI-radius);
	border: none;
	background: none;
	color: var(--MI_THEME-error);
	font: inherit;
	font-size: 0.85rem;
	cursor: pointer;
	width: 100%;
	text-align: left;
	opacity: 0.8;
	transition: background 0.15s, opacity 0.15s;

	&:hover {
		background: color-mix(in srgb, var(--MI_THEME-error) 10%, transparent);
		opacity: 1;
	}
}

/* ===== Content Area ===== */
.content {
	min-height: 400px;
}
.sectionTitle {
	font-weight: 800;
	font-size: 1.1rem;
	display: flex;
	align-items: center;
	gap: 8px;
	padding-bottom: 4px;
	border-bottom: solid 2px var(--MI_THEME-divider);
	margin-bottom: 4px;
}
.sectionSubtitle {
	font-weight: 700;
	font-size: 0.95rem;
	display: flex;
	align-items: center;
	gap: 6px;
}
.sectionDivider {
	border-top: solid 1px var(--MI_THEME-divider);
	margin: 8px 0;
}
.captionText {
	margin: 0;
	font-size: 0.88rem;
	line-height: 1.5;
	opacity: 0.72;
}

/* ===== Avatar ===== */
.avatarRow {
	display: flex;
	align-items: center;
	gap: 16px;
	flex-wrap: wrap;
}
.avatarImg {
	width: 80px;
	height: 80px;
	border-radius: 16px;
	object-fit: cover;
	border: solid 1px var(--MI_THEME-divider);
}
.avatarPlaceholder {
	width: 80px;
	height: 80px;
	border-radius: 16px;
	display: flex;
	align-items: center;
	justify-content: center;
	background: var(--MI_THEME-panel);
	border: dashed 1px var(--MI_THEME-divider);
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 1.8rem;
}

/* ===== Cards ===== */
.card {
	padding: 16px;
	border-radius: var(--MI-radius);
	border: solid 1px var(--MI_THEME-divider);
	background: var(--MI_THEME-panel);
}
.cardHeader {
	display: flex;
	gap: 12px;
	align-items: flex-end;
}
.cardHeaderInput {
	flex: 1;
	min-width: 0;
}

.referenceImageTitle {
	font-weight: 600;
}

.referenceImageRow {
	display: flex;
	align-items: center;
	gap: 16px;
}

.referenceImagePreviews {
	display: grid;
	grid-template-columns: repeat(2, 58px);
	grid-template-rows: repeat(2, 58px);
	gap: 6px;
	flex: 0 0 auto;
}

.referenceImagePreview,
.referenceImageEmpty {
	position: relative;
	width: 58px;
	height: 58px;
	overflow: hidden;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 6px;
	background: var(--MI_THEME-panel);
}

.referenceImagePreview > img {
	display: block;
	width: 100%;
	height: 100%;
	object-fit: cover;
}

.referenceImagePreviewFallback,
.referenceImageEmpty {
	display: flex;
	align-items: center;
	justify-content: center;
	color: var(--MI_THEME-fgTransparentWeak);
}

.referenceImageRemove {
	position: absolute;
	top: 2px;
	right: 2px;
	width: 20px;
	height: 20px;
	border-radius: 50%;
	background: color-mix(in srgb, var(--MI_THEME-panel) 80%, transparent);
	color: var(--MI_THEME-fg);
	font-size: 14px;
	line-height: 1;
}

.referenceImageCaption {
	max-width: 32rem;
	font-size: 0.85em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.referenceImageActions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

@container (max-width: 500px) {
	.referenceImageRow {
		align-items: flex-start;
		flex-direction: column;
	}
}
.regexOptions {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 24px;
}
.regexPreviewGrid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 12px;
}
.regexPreviewResult {
	min-width: 0;
	padding: 12px;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 6px;
	background: color-mix(in srgb, var(--MI_THEME-fg) 3%, var(--MI_THEME-panel));
}
.regexPreviewTitle {
	display: flex;
	align-items: center;
	gap: 6px;
	font-size: 0.88rem;
	font-weight: 700;
}
.regexPreviewText {
	margin: 8px 0 0;
	white-space: pre-wrap;
	word-break: break-word;
	font: inherit;
	line-height: 1.5;
}
.regexPreviewEmpty {
	margin-top: 8px;
	font-size: 0.88rem;
	color: var(--MI_THEME-fgTransparentWeak);
}
.regexPreviewWarning {
	display: flex;
	align-items: center;
	gap: 6px;
	font-size: 0.88rem;
	color: var(--MI_THEME-warn);
}
.cardActions {
	display: flex;
	gap: 4px;
	flex-shrink: 0;
}
.hintCard {
	padding: 12px 16px;
	border-radius: var(--MI-radius);
	background: color-mix(in srgb, var(--MI_THEME-accent) 8%, transparent);
	font-size: 0.88rem;
	line-height: 1.5;
	display: flex;
	align-items: flex-start;
	gap: 8px;
	color: var(--MI_THEME-fg);
	opacity: 0.85;

	code {
		background: color-mix(in srgb, var(--MI_THEME-fg) 8%, transparent);
		padding: 1px 5px;
		border-radius: 4px;
		font-size: 0.85em;
	}
}

.reviewRejectBox {
	margin-bottom: 16px;
	padding: 12px 14px;
	border-radius: var(--MI-radius);
	border: solid 1px color-mix(in srgb, var(--MI_THEME-warn) 40%, var(--MI_THEME-divider));
	background: color-mix(in srgb, var(--MI_THEME-warn) 10%, var(--MI_THEME-panel));
}
.reviewRejectTitle {
	display: flex;
	align-items: center;
	gap: 6px;
	font-weight: 700;
	color: var(--MI_THEME-warn);
}
.reviewRejectMeta {
	margin-top: 5px;
	font-size: 0.86rem;
	color: var(--MI_THEME-fgTransparentWeak);
}
.reviewRejectBox p {
	margin: 7px 0 0;
	white-space: pre-wrap;
	word-break: break-word;
	line-height: 1.55;
}

/* ===== Worldbook Meta Row ===== */
.wbMetaRow {
	display: flex;
	gap: 12px;
	align-items: flex-end;
	flex-wrap: wrap;
}
.wbTrigger {
	flex: 1;
	min-width: 180px;
}
.wbTriggerLabel {
	font-size: 0.85rem;
	font-weight: 600;
	margin-bottom: 6px;
	opacity: 0.8;
}
.wbTriggerCaption {
	margin-top: 6px;
	font-size: 0.82rem;
	line-height: 1.45;
	opacity: 0.68;
}
.wbPriority {
	width: 100px;
	flex-shrink: 0;
}
.wbEnabled {
	flex-shrink: 0;
}

/* ===== Match Preview ===== */
.matchCard {
	padding: 10px 12px;
	border-radius: var(--MI-radius-sm);
	border: solid 1px var(--MI_THEME-divider);
	background: color-mix(in srgb, var(--MI_THEME-panel) 92%, transparent);
}
.matchHeader {
	display: flex;
	justify-content: space-between;
	align-items: center;
	gap: 8px;
}
.matchTitle {
	font-weight: 700;
	font-size: 0.92rem;
}
.matchMeta {
	font-size: 0.82rem;
	opacity: 0.65;
}
.matchInfo {
	font-size: 0.82rem;
	opacity: 0.65;
	margin-top: 2px;
}

/* ===== Manual Chips ===== */
.manualChips {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
}
.manualChipsLabel {
	font-size: 0.85rem;
	opacity: 0.72;
}
.manualChip {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	padding: 3px 10px;
	border-radius: 999px;
	border: solid 1px var(--MI_THEME-divider);
	background: color-mix(in srgb, var(--MI_THEME-accent) 12%, transparent);
	color: inherit;
	cursor: pointer;
	font-size: 0.82rem;
	transition: background 0.15s;

	&:hover {
		background: color-mix(in srgb, var(--MI_THEME-accent) 22%, transparent);
	}
}

/* ===== Diff ===== */
.diffCard {
	padding: 10px 12px;
	border-radius: var(--MI-radius-sm);
	border: solid 1px var(--MI_THEME-divider);
}
.diffFieldHeader {
	display: flex;
	align-items: center;
	gap: 6px;
	width: 100%;
	padding: 0;
	border: none;
	background: none;
	color: inherit;
	cursor: pointer;
	text-align: left;
	font: inherit;
}
.diffFieldName {
	font-weight: 700;
	font-size: 0.92rem;
}
.diffPreview {
	font-size: 0.85rem;
	opacity: 0.7;
	margin-top: 4px;
}
.diffLines {
	margin-top: 8px;
	border-radius: var(--MI-radius-sm);
	border: solid 1px var(--MI_THEME-divider);
	overflow: hidden;
	font-family: Consolas, Monaco, 'Courier New', monospace;
	font-size: 0.82rem;
	line-height: 1.5;
}
.diffLine {
	display: flex;
	gap: 6px;
	padding: 0 8px;
	white-space: pre-wrap;
	word-break: break-word;
}
.diffSign {
	flex-shrink: 0;
	width: 0.8em;
	text-align: center;
	opacity: 0.7;
}
.diffText {
	flex: 1;
	min-width: 0;
}
.diffAdd {
	background: color-mix(in srgb, #2ecc71 22%, transparent);
}
.diffDel {
	background: color-mix(in srgb, #e74c3c 22%, transparent);
}
.diffSame {
	opacity: 0.7;
}

/* ===== Version List ===== */
.versionRow {
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
	gap: 12px;
	flex-wrap: wrap;
}
.versionLabel {
	font-weight: 700;
	font-size: 0.92rem;
}
.versionMeta {
	font-size: 0.82rem;
	opacity: 0.65;
	margin-top: 2px;
}
.versionDetail {
	font-size: 0.85rem;
	opacity: 0.7;
	margin-top: 6px;
}

/* ===== Save Bar ===== */
.saveBar {
	position: sticky;
	bottom: 0;
	z-index: 1;
	padding-top: 12px;
	margin-top: 16px;
	background: var(--MI_THEME-bg);
}

/* ===== Responsive ===== */
@media (max-width: 960px) {
	.layout {
		grid-template-columns: minmax(0, 1fr);
	}
	.sidebar {
		display: none;
	}
	.mobileTabBar {
		display: flex;
	}
	.mobileTabBar::after {
		content: '';
		flex: 0 0 12px;
	}
	.regexOptions,
	.regexPreviewGrid {
		grid-template-columns: 1fr;
	}
}
</style>
