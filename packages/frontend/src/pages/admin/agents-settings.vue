<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="activeTab" :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 1000px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<div class="_gaps_m">

			<template v-if="activeTab === 'overview'">
				<div :class="$style.overviewGrid">
					<div v-panel :class="$style.overviewCard">
						<span>功能状态</span>
						<b>{{ form.state.agentFeatureEnabled ? i18n.ts._agents.adminEnabled : i18n.ts._agents.adminDisabled }}</b>
					</div>
					<div v-panel :class="$style.overviewCard">
						<span>可用模型</span>
						<b>{{ listedModelCount }}</b>
					</div>
					<div v-panel :class="$style.overviewCard">
						<span>默认模型</span>
						<b>{{ selectedDefaultModelName }}</b>
					</div>
					<div v-panel :class="$style.overviewCard">
						<span>长期记忆</span>
						<b>{{ form.state.agentMem0Enabled ? i18n.ts._agents.adminEnabled : i18n.ts._agents.adminNotEnabled }}</b>
					</div>
					<div v-panel :class="$style.overviewCard">
						<span>24h 请求</span>
						<b>{{ reportsData?.overall.total ?? '—' }}</b>
					</div>
					<div v-panel :class="$style.overviewCard">
						<span>24h 成功率</span>
						<b>{{ reportSuccessRate }}</b>
					</div>
				</div>

				<!-- 词表缺失告警 -->
				<div v-if="missingTokenizers.length > 0" class="_gaps_s">
					<MkInfo v-for="t in missingTokenizers" :key="t.family" warn>
						<i class="ti ti-alert-triangle"></i>
						<strong>{{ tokenizerFamilyLabel(t.family) }}</strong> {{ i18n.ts._agents.adminTokenizerMissing }}
						<br>
						<small>{{ i18n.ts._agents.adminTokenizerMissingHint }}</small>
					</MkInfo>
				</div>

				<div :class="$style.quickGrid">
					<MkButton rounded @click="activeTab = 'models'"><i class="ti ti-cpu"></i> {{ i18n.ts._agents.adminModelsTab }}</MkButton>
					<MkButton rounded @click="activeTab = 'credits'"><i class="ti ti-ticket"></i> {{ i18n.ts._agents.adminCreditsTab }}</MkButton>
					<MkButton rounded @click="activeTab = 'reports'"><i class="ti ti-report-analytics"></i> {{ i18n.ts._agents.adminReportsTab }}</MkButton>
					<MkButton rounded @click="activeTab = 'externalAudit'"><i class="ti ti-shield-check"></i> {{ i18n.ts._agents.adminExternalAuditTab }}</MkButton>
					<MkButton rounded @click="router.push('/admin/agents-review' as any)"><i class="ti ti-shield-check"></i> {{ i18n.ts._agents.adminAgentReview }}</MkButton>
				</div>
			</template>

			<MkFolder v-if="activeTab === 'basic'" :defaultOpen="true">
				<template #icon><i class="ti ti-toggle-right"></i></template>
				<template #label>{{ i18n.ts._agents.adminSectionFeature }}</template>
				<div class="_gaps">
					<MkSwitch v-model="form.state.agentFeatureEnabled">
						<template #label>{{ i18n.ts._agents.featureEnabled }}</template>
					</MkSwitch>
					<MkTextarea v-model="form.state.agentGlobalSystemPrompt">
						<template #label>{{ i18n.ts._agents.globalPrompt }}</template>
					</MkTextarea>
					<MkFolder>
						<template #icon><i class="ti ti-brand-telegram"></i></template>
						<template #label>{{ i18n.ts._agents.adminAliyaRecommend }}</template>
						<template #caption>{{ i18n.ts._agents.adminAliyaRecommendCaption }}</template>
						<div class="_gaps">
							<MkInput v-model="form.state.agentAliyaCharacterId" type="text">
								<template #label>{{ i18n.ts._agents.adminAliyaCharacterId }}</template>
								<template #caption>{{ i18n.ts._agents.adminAliyaCharacterIdCaption }}</template>
							</MkInput>
							<MkInput v-model="form.state.agentAliyaWebUrl" type="url">
								<template #label>{{ i18n.ts._agents.adminAliyaWebUrl }}</template>
								<template #caption>{{ i18n.ts._agents.adminAliyaWebUrlCaption }}</template>
								<template #prefix><i class="ti ti-link"></i></template>
							</MkInput>
						</div>
					</MkFolder>
				</div>
			</MkFolder>

			<MkFolder v-if="activeTab === 'models'" :defaultOpen="true">
				<template #icon><i class="ti ti-folder"></i></template>
				<template #label>{{ i18n.ts._agents.modelGroups }}</template>
				<div class="_gaps">
					<MkInfo>{{ i18n.ts._agents.modelGroupsHint }}</MkInfo>
					<div v-if="form.state.agentLlmModelGroupRows.length === 0" :class="$style.emptyModels">
						{{ i18n.ts._agents.modelGroupsEmpty }}
					</div>
					<div v-for="(g, gi) in form.state.agentLlmModelGroupRows" :key="g.id" :class="$style.groupRow">
						<MkInput v-model="g.name" small :class="$style.groupNameInput">
							<template #label>{{ i18n.ts._agents.modelGroupName }}</template>
						</MkInput>
						<div :class="$style.groupRowActions">
							<button type="button" class="_button" :class="$style.iconMuted" :disabled="gi === 0" :title="i18n.ts._agents.adminModelMoveUp" @click="moveGroup(gi, -1)"><i class="ti ti-arrow-up"></i></button>
							<button type="button" class="_button" :class="$style.iconMuted" :disabled="gi === form.state.agentLlmModelGroupRows.length - 1" :title="i18n.ts._agents.adminModelMoveDown" @click="moveGroup(gi, 1)"><i class="ti ti-arrow-down"></i></button>
							<button type="button" class="_button" :class="$style.iconDanger" :title="i18n.ts._agents.modelGroupDelete" @click="removeGroup(g.id)"><i class="ti ti-trash"></i></button>
						</div>
					</div>
					<div :class="$style.addGroupRow">
						<MkInput v-model="newGroupName" small :class="$style.groupNameInput" @enter="addGroup">
							<template #label>{{ i18n.ts._agents.modelGroupAdd }}</template>
						</MkInput>
						<MkButton rounded @click="addGroup"><i class="ti ti-plus"></i> {{ i18n.ts._agents.modelGroupAdd }}</MkButton>
					</div>
				</div>
			</MkFolder>

			<MkFolder v-if="activeTab === 'models'" :defaultOpen="true">
				<template #icon><i class="ti ti-list-details"></i></template>
				<template #label>{{ i18n.ts._agents.adminSectionModels }}</template>
				<div class="_gaps">
					<MkInfo>{{ i18n.ts._agents.adminModelListHint }}</MkInfo>

					<template v-for="section in llmModelSections" :key="section.key">
						<div v-if="section.key === 'active' || section.rows.length > 0" :class="[$style.modelSectionHead, section.key === 'unlisted' ? $style.modelSectionHeadMuted : null]">
							<span>{{ section.label }}<span :class="$style.modelSectionCount">{{ section.rows.length }}</span></span>
							<MkButton v-if="section.key === 'active'" small rounded @click="onAddModelMenu"><i class="ti ti-plus"></i> {{ i18n.ts._agents.addAgentModel }}</MkButton>
						</div>
						<div v-if="section.key === 'active' && section.rows.length === 0" :class="$style.emptyModels">
							{{ i18n.ts._agents.adminModelListEmpty }}
						</div>
						<div v-for="row in section.rows" :key="row.id" :data-model-row-id="section.key === 'active' ? row.id : undefined" :class="[$style.modelRow, row.unlisted ? $style.modelRowUnlisted : null, modelRowDrag?.id === row.id ? $style.modelRowDragging : null, modelRowDrag?.id === row.id && modelRowDrag.snapping ? $style.modelRowSnapping : null, modelRowDrag != null && modelRowDrag.id !== row.id ? $style.modelRowShiftable : null, modelRowDrag != null && modelRowDrag.overId === row.id ? (modelRowDrag.overPos === 'before' ? $style.modelRowDropBefore : $style.modelRowDropAfter) : null]" :style="modelRowDragStyle(row.id)">
							<div :class="$style.modelRowHead" @click="toggleLlmModelExpanded(row.id)">
								<i class="ti ti-chevron-right" :class="[$style.modelRowChevron, isLlmModelExpanded(row.id) ? $style.modelRowChevronOpen : null]"></i>
								<span :class="$style.modelRowTitle">{{ row.name.trim() || '未命名模型' }}</span>
								<span v-if="row.unlisted" :class="$style.unlistedBadge">{{ i18n.ts._agents.adminModelUnlistedBadge }}</span>
								<span :class="$style.modelRowMeta">{{ llmModelRowMeta(row) }}</span>
								<div :class="$style.modelCardActions" @click.stop>
									<button type="button" class="_button" :class="$style.iconMuted" :title="i18n.ts._agents.adminModelCopy" @click="copyModelRow(row)">
										<i class="ti ti-copy"></i>
									</button>
									<template v-if="!row.unlisted">
										<button type="button" class="_button" :class="$style.iconWarn" :title="i18n.ts._agents.adminModelUnlist" @click="toggleUnlist(row, true)">
											<i class="ti ti-archive"></i>
										</button>
										<span :class="$style.modelRowGrip" title="长按拖动排序" @pointerdown="onModelRowGripPointerDown($event, 'llm', row)" @contextmenu.prevent>
											<i class="ti ti-grip-vertical"></i>
										</span>
									</template>
									<button v-else type="button" class="_button" :class="$style.iconMuted" :title="i18n.ts._agents.adminModelRelist" @click="toggleUnlist(row, false)">
										<i class="ti ti-eye"></i>
									</button>
								</div>
							</div>
							<div v-if="isLlmModelExpanded(row.id)" :class="$style.modelRowBody" class="_gaps_s">
								<MkInput v-model="row.name" :readonly="row.unlisted">
									<template #label>{{ i18n.ts._agents.modelDisplayName }}</template>
								</MkInput>
								<div v-if="row.id.trim() !== ''" :class="$style.internalIdRow">
									<span :class="$style.internalIdLabel">{{ i18n.ts._agents.fieldModelInternalId }}</span>
									<code :class="$style.internalIdValue">{{ row.id }}</code>
									<p :class="$style.internalIdCaption">{{ i18n.ts._agents.fieldModelInternalIdCaption }}</p>
								</div>
								<MkSelect v-model="row.groupId" :items="modelGroupItems" :readonly="row.unlisted">
									<template #label>{{ i18n.ts._agents.modelGroup }}</template>
								</MkSelect>
								<MkTextarea v-model="row.description" :readonly="row.unlisted">
									<template #label>{{ i18n.ts._agents.modelDescription }}</template>
								</MkTextarea>
								<MkInput v-model="row.baseUrl" type="text" :readonly="row.unlisted">
									<template #label>{{ i18n.ts._agents.modelBaseUrl }}</template>
									<template #caption>{{ i18n.ts._agents.fieldModelBaseUrlCaption }}</template>
									<template #prefix><i class="ti ti-link"></i></template>
								</MkInput>
									<MkSwitch v-model="row.multiKeyEnabled" :disabled="row.unlisted">
										<template #label>{{ i18n.ts._agents.modelMultiKeyEnabled }}</template>
										<template #caption>{{ i18n.ts._agents.modelMultiKeyEnabledCaption }}</template>
									</MkSwitch>
									<MkInput v-if="!row.multiKeyEnabled" v-model="row.apiKeys[0]" type="password" :readonly="row.unlisted">
										<template #label>{{ i18n.ts._agents.modelApiKey }}</template>
										<template #caption>{{ i18n.ts._agents.modelSingleKeyCaption }}</template>
									</MkInput>
									<div v-else :class="$style.multiKeyList">
										<div v-for="(_, keyIndex) in row.apiKeys" :key="keyIndex" :class="$style.multiKeyRow">
											<MkInput v-model="row.apiKeys[keyIndex]" type="password" :readonly="row.unlisted">
												<template #label>{{ i18n.tsx._agents.modelApiKeyNumber({ n: keyIndex + 1 }) }}</template>
											</MkInput>
											<button type="button" class="_button" :class="$style.iconWarn" :disabled="row.unlisted || row.apiKeys.length <= 1" :title="i18n.ts._agents.modelApiKeyRemove" @click="removeLlmApiKey(row, keyIndex)">
												<i class="ti ti-trash"></i>
											</button>
										</div>
										<MkButton small rounded :disabled="row.unlisted" @click="addLlmApiKey(row)"><i class="ti ti-plus"></i> {{ i18n.ts._agents.modelApiKeyAdd }}</MkButton>
									</div>
									<MkInput v-model="row.apiModelName" :readonly="row.unlisted">
									<template #label>{{ i18n.ts._agents.modelApiName }}</template>
									<template #caption>{{ i18n.ts._agents.fieldApiModelNameCaption }}</template>
								</MkInput>
								<FormSplit :minWidth="260">
									<MkInput v-model="row.maxContextTokens" type="text" :readonly="row.unlisted">
										<template #label>{{ i18n.ts._agents.maxContextTokens }}</template>
									</MkInput>
									<MkInput v-model="row.maxOutputTokensPerCall" type="text" :readonly="row.unlisted">
										<template #label>{{ i18n.ts._agents.maxOutputTokens }}</template>
									</MkInput>
								</FormSplit>
								<MkSelect v-model="row.billingMode" :items="billingModeItems" :readonly="row.unlisted">
									<template #label>{{ i18n.ts._agents.billingMode }}</template>
									<template #caption>{{ i18n.ts._agents.billingModeCaption }}</template>
								</MkSelect>
								<template v-if="row.billingMode === 'usage'">
									<FormSplit :minWidth="200">
										<MkInput v-model="row.pricePerMillionInputCacheHitTokens" type="text" :readonly="row.unlisted">
											<template #label>{{ i18n.ts._agents.billingInputCacheHit }}</template>
											<template #caption>{{ i18n.ts._agents.billingPerMillionTokens }}</template>
											<template #prefix><i class="ti ti-coin"></i></template>
										</MkInput>
										<MkInput v-model="row.pricePerMillionInputCacheMissTokens" type="text" :readonly="row.unlisted">
											<template #label>{{ i18n.ts._agents.billingInputCacheMiss }}</template>
											<template #caption>{{ i18n.ts._agents.billingPerMillionTokens }}</template>
											<template #prefix><i class="ti ti-coin"></i></template>
										</MkInput>
										<MkInput v-model="row.pricePerMillionOutputTokens" type="text" :readonly="row.unlisted">
											<template #label>{{ i18n.ts._agents.billingOutput }}</template>
											<template #caption>{{ i18n.ts._agents.billingPerMillionTokens }}</template>
											<template #prefix><i class="ti ti-coin"></i></template>
										</MkInput>
									</FormSplit>
									<MkInput v-model="row.costPerCall" type="text" :readonly="row.unlisted">
										<template #label>{{ i18n.ts._agents.modelCostPerCall }}</template>
										<template #caption>{{ i18n.ts._agents.billingFallbackCostCaption }}</template>
										<template #prefix><i class="ti ti-coin"></i></template>
									</MkInput>
									<MkInput v-model="row.peakPriceMultiplier" type="text" :readonly="row.unlisted">
										<template #label>{{ i18n.ts._agents.billingPeakMultiplier }}</template>
										<template #caption>{{ i18n.ts._agents.billingPeakMultiplierCaption }}</template>
										<template #prefix><i class="ti ti-chart-line"></i></template>
									</MkInput>
								</template>
								<MkInput v-else v-model="row.costPerCall" type="text" :readonly="row.unlisted">
									<template #label>{{ i18n.ts._agents.modelCostPerCall }}</template>
									<template #caption>{{ i18n.ts._agents.modelCostPerCallCaption }}</template>
									<template #prefix><i class="ti ti-coin"></i></template>
								</MkInput>
								<MkInput v-model="row.dailyFreeQuota" type="text" :readonly="row.unlisted">
									<template #label>每日免费次数</template>
									<template #caption>设为 0 则无免费额度；每日 0 点（北京时间）重置</template>
								</MkInput>
								<FormSplit :minWidth="260">
									<MkSelect v-model="row.tokenizerEncoding" :items="tokenizerEncodingItems" :readonly="row.unlisted">
										<template #label>Token 编码器</template>
										<template #caption>tiktoken/Gemini/GLM/DeepSeek 为精确计数（GLM/DeepSeek 需镜像预置词表，缺失时自动降级近似）；Claude 为兼容近似（≈）；不选则字符估算</template>
									</MkSelect>
									<MkSelect v-model="row.charsPerToken" :items="charsPerTokenItems" :readonly="row.unlisted">
										<template #label>{{ i18n.ts._agents.adminCharsPerToken }}</template>
										<template #caption>{{ i18n.ts._agents.adminCharsPerTokenCaption }}</template>
									</MkSelect>
								</FormSplit>
							</div>
						</div>
					</template>

				<MkSelect v-model="form.state.agentDefaultModelId" :items="defaultModelItems">
					<template #label>{{ i18n.ts._agents.agentDefaultModelId }}</template>
				</MkSelect>
			</div>
		</MkFolder>

		<MkFolder v-if="activeTab === 'models'" :defaultOpen="true">
			<template #icon><i class="ti ti-key"></i></template>
			<template #label>BYOK 自定义模型</template>
			<div class="_gaps">
				<MkInfo>启用后用户可自带 API Key 添加自定义模型；自定义模型调用不扣平台信用、不消耗官方免费额度，仅计入用量统计。</MkInfo>
				<MkSwitch v-model="form.state.agentByokEnabled">
					<template #label>启用 BYOK（用户自带 Key）</template>
				</MkSwitch>
				<MkInput v-model="form.state.agentByokMaxUserModels" type="text">
					<template #label>每用户自定义模型数量上限</template>
				</MkInput>

				<MkFolder>
					<template #icon><i class="ti ti-plug"></i></template>
					<template #label>半设置提供商模板</template>
					<template #caption>管理员预置连接信息，用户选择模板后只需填自己的 Key</template>
					<div class="_gaps">
						<MkInfo>例如配置 DeepSeek：Base URL 填 https://api.deepseek.com，模型名填 deepseek-chat 等，用户提交自己的 DeepSeek Key 即可使用。</MkInfo>
						<div v-if="form.state.agentByokProviderRows.length === 0" :class="$style.emptyModels">
							尚未配置提供商模板
						</div>
						<div v-for="(row, i) in form.state.agentByokProviderRows" :key="i" :class="[$style.modelCard, $style.byokProviderCard]" class="_gaps_s">
							<div :class="$style.modelCardHead">
								<span :class="$style.modelCardTitle">提供商 #{{ i + 1 }}</span>
								<div :class="$style.modelCardActions">
									<button type="button" class="_button" :class="$style.iconDanger" :title="'删除'" @click="form.state.agentByokProviderRows.splice(i, 1)">
										<i class="ti ti-trash"></i>
									</button>
								</div>
							</div>
							<MkInput v-model="row.name">
								<template #label>名称（如 DeepSeek）</template>
							</MkInput>
							<MkTextarea v-model="row.description">
								<template #label>说明</template>
							</MkTextarea>
							<MkInput v-model="row.baseUrl">
								<template #label>Base URL</template>
								<template #prefix><i class="ti ti-link"></i></template>
							</MkInput>
							<MkInput v-model="row.apiModelName">
								<template #label>模型名（可留空，由用户填）</template>
							</MkInput>
							<FormSplit :minWidth="260">
								<MkInput v-model="row.maxContextTokens" type="text">
									<template #label>上下文长度（token）</template>
								</MkInput>
								<MkInput v-model="row.maxOutputTokensPerCall" type="text">
									<template #label>输出长度（token）</template>
								</MkInput>
							</FormSplit>
							<FormSplit :minWidth="260">
								<MkSelect v-model="row.tokenizerEncoding" :items="tokenizerEncodingItems">
									<template #label>Token 编码器</template>
								</MkSelect>
								<MkSelect v-model="row.charsPerToken" :items="charsPerTokenItems">
									<template #label>字符/token 估算</template>
								</MkSelect>
							</FormSplit>
						</div>
						<div>
							<MkButton rounded @click="onAddByokProvider"><i class="ti ti-plus"></i> 添加提供商模板</MkButton>
						</div>
					</div>
				</MkFolder>
			</div>
		</MkFolder>

			<MkFolder v-if="activeTab === 'memory'" :defaultOpen="true">
				<template #icon><i class="ti ti-brain"></i></template>
				<template #label>{{ i18n.ts._agents.adminSectionLongMemory }}</template>
				<div class="_gaps">
					<MkInfo>{{ i18n.ts._agents.adminLongMemoryHint }}</MkInfo>
					<MkSwitch v-model="form.state.agentMem0Enabled">
						<template #label>{{ i18n.ts._agents.longMemoryEnabled }}</template>
					</MkSwitch>
					<MkInput v-model="form.state.agentMem0ApiKey" type="password">
						<template #label>{{ i18n.ts._agents.dashscopeApiKey }}</template>
						<template #caption>{{ i18n.ts._agents.dashscopeApiKeyCaption }}</template>
					</MkInput>
					<MkInput v-model="form.state.agentMem0ApiBaseUrl" type="text">
						<template #label>{{ i18n.ts._agents.dashscopeApiBaseUrl }}</template>
						<template #caption>{{ i18n.ts._agents.dashscopeApiBaseUrlCaption }}</template>
					</MkInput>
					<MkInput v-model="form.state.agentMem0OrgId" type="text">
						<template #label>{{ i18n.ts._agents.memoryLibraryId }}</template>
						<template #caption>{{ i18n.ts._agents.memoryLibraryIdCaption }}</template>
					</MkInput>
					<FormSplit :minWidth="260">
						<MkInput v-model="form.state.agentMem0TopK" type="text">
							<template #label>{{ i18n.ts._agents.defaultMemoryTopK }}</template>
						</MkInput>
						<MkInput v-model="form.state.agentMem0InjectMaxChars" type="text">
							<template #label>{{ i18n.ts._agents.defaultMemoryInjectMaxChars }}</template>
						</MkInput>
					</FormSplit>
					<MkInput v-model="form.state.agentMem0AddMemoryMaxRounds" type="text">
						<template #label>{{ i18n.ts._agents.defaultMemoryAddMaxRounds }}</template>
						<template #caption>{{ i18n.ts._agents.defaultMemoryAddMaxRoundsCaption }}</template>
					</MkInput>
					<MkInput v-model="form.state.agentMem0AddMemoryEveryNRounds" type="text">
						<template #label>{{ i18n.ts._agents.defaultMemoryAddEveryNRounds }}</template>
						<template #caption>{{ i18n.ts._agents.defaultMemoryAddEveryNRoundsCaption }}</template>
					</MkInput>
				</div>
			</MkFolder>

			<MkFolder v-if="activeTab === 'compression'" :defaultOpen="true">
				<template #icon><i class="ti ti-file-zip"></i></template>
				<template #label>{{ i18n.ts._agents.adminSectionCompression }}</template>
				<div class="_gaps">
					<MkInfo>{{ i18n.ts._agents.adminCompressionHint }}</MkInfo>
					<MkTextarea v-model="form.state.agentCompressionSystemPrompt" tall>
						<template #label>{{ i18n.ts._agents.agentCompressionSystemPrompt }}</template>
						<template #caption>{{ i18n.ts._agents.agentCompressionSystemPromptCaption }}</template>
					</MkTextarea>
					<FormSplit :minWidth="260">
						<MkInput v-model="form.state.agentCompressionMaxInputChars" type="text">
							<template #label>{{ i18n.ts._agents.agentCompressionMaxInputChars }}</template>
							<template #caption>{{ i18n.ts._agents.agentCompressionMaxInputCharsCaption }}</template>
						</MkInput>
						<MkInput v-model="form.state.agentCompressionMaxOutputTokens" type="text">
							<template #label>{{ i18n.ts._agents.agentCompressionMaxOutputTokens }}</template>
							<template #caption>{{ i18n.ts._agents.agentCompressionMaxOutputTokensCaption }}</template>
						</MkInput>
					</FormSplit>
					<FormSplit :minWidth="200">
						<MkInput v-model="form.state.agentCompressionBandT1Ratio" type="text">
							<template #label>{{ i18n.ts._agents.agentCompressionBandT1Ratio }}</template>
							<template #caption>{{ i18n.ts._agents.agentCompressionBandT1RatioCaption }}</template>
						</MkInput>
						<MkInput v-model="form.state.agentCompressionBandT2Ratio" type="text">
							<template #label>{{ i18n.ts._agents.agentCompressionBandT2Ratio }}</template>
							<template #caption>{{ i18n.ts._agents.agentCompressionBandT2RatioCaption }}</template>
						</MkInput>
					</FormSplit>
					<MkSelect v-model="form.state.agentCompressionDefaultModelId" :items="compressionDefaultModelItems">
						<template #label>{{ i18n.ts._agents.adminCompressionDefaultModel }}</template>
						<template #caption>{{ i18n.ts._agents.adminCompressionDefaultModelCaption }}</template>
					</MkSelect>
					<MkInfo>{{ i18n.ts._agents.agentCompressionBandRatiosEmptyHint }}</MkInfo>
				</div>
			</MkFolder>

			<MkFolder v-if="activeTab === 'externalAudit'" :defaultOpen="true">
				<template #icon><i class="ti ti-shield-check"></i></template>
				<template #label>外部审核</template>
				<div class="_gaps">
					<MkSwitch v-model="form.state.agentExternalAuditEnabled">
						<template #label>启用智能体回复外部审核</template>
						<template #caption>审核发生在 AI 回复生成后、返回前；拦截时用户会看到拦截提示并恢复输入，原对话调用仍正常扣费。</template>
					</MkSwitch>
					<MkInfo warn>外部审核模型只用于安全判断，不展示给用户，也不设置额度。优先级数字越小越优先；模型失败会自动尝试下一个。</MkInfo>

					<div v-if="form.state.agentExternalAuditModelRows.length === 0" :class="$style.emptyModels">当前没有外审模型。启用开关打开后也会按 fail-open 放行。</div>
					<div v-for="(row, i) in form.state.agentExternalAuditModelRows" :key="row.id" :class="$style.modelCard" class="_gaps_s">
						<div :class="$style.modelCardHead">
							<b>{{ row.name.trim() || `外审模型 #${i + 1}` }}</b>
							<div :class="$style.modelCardActions">
								<button v-if="row.autoDisabledAt" type="button" class="_button" :class="$style.iconMuted" title="解除自动禁用状态" @click="clearExternalAuditAutoDisabled(i)">
									<i class="ti ti-refresh"></i>
								</button>
								<button type="button" class="_button" :class="$style.iconWarn" title="删除模型" @click="removeExternalAuditModel(i)">
									<i class="ti ti-trash"></i>
								</button>
							</div>
						</div>
						<FormSplit :minWidth="220">
							<MkInput v-model="row.name"><template #label>模型名</template><template #caption>内部识别用，不展示给用户。</template></MkInput>
							<MkInput v-model="row.priority" type="text"><template #label>优先级</template><template #caption>数字越小越优先。</template></MkInput>
						</FormSplit>
						<MkSelect v-model="row.provider" :items="externalAuditProviderItems" @update:modelValue="onExternalAuditProviderChange(row)">
							<template #label>模型类型</template>
						</MkSelect>
						<MkInput v-model="row.baseUrl" type="text">
							<template #label>请求端点</template>
							<template #caption>{{ row.provider === 'aliyun-decision' ? '填写完整的阿里云决策模型 systemone 端点，包含业务空间 ID 和地域。' : '填写 OpenAI 兼容 Base URL（版本前缀如 /v1、/v4 请写全）；末尾不是 completions 时会自动追加 /chat/completions，已以 completions 结尾则原样使用。' }}</template>
							<template #prefix><i class="ti ti-link"></i></template>
						</MkInput>
						<FormSplit :minWidth="220">
							<MkInput v-model="row.apiModelName"><template #label>上游模型名</template></MkInput>
							<MkInput v-model="row.apiKey" type="password"><template #label>API Key</template></MkInput>
						</FormSplit>
						<MkSwitch v-model="row.enabled"><template #label>启用此模型</template></MkSwitch>
						<MkInfo v-if="row.autoDisabledAt" warn>已自动禁用：{{ row.autoDisabledReason || row.autoDisabledAt }}</MkInfo>
					</div>
					<MkButton rounded @click="addExternalAuditModel"><i class="ti ti-plus"></i> 添加外审模型</MkButton>

					<FormSplit :minWidth="220">
						<MkInput v-model="form.state.agentExternalAuditTimeoutMs" type="text"><template #label>超时时间（毫秒）</template></MkInput>
						<MkInput v-model="form.state.agentExternalAuditFailureThresholdPercent" type="text"><template #label>自动禁用失败率（%）</template></MkInput>
						<MkInput v-model="form.state.agentExternalAuditFailureMinRequests" type="text"><template #label>自动禁用最小样本数</template></MkInput>
					</FormSplit>
					<MkTextarea v-model="form.state.agentExternalAuditNotifyEmails">
						<template #label>通知邮箱</template>
						<template #caption>多个邮箱可用换行、逗号或分号分隔。邮件服务未启用时不会发送。</template>
					</MkTextarea>
						<MkTextarea v-model="form.state.agentExternalAuditSystemPrompt" tall>
							<template #label>总体判断标准</template>
							<template #caption>只描述共性审核边界、放行原则和例外。输出格式与违规条目由系统自动生成。</template>
						</MkTextarea>
						<div class="_buttons">
							<MkButton rounded @click="restoreExternalAuditPrompt"><i class="ti ti-restore"></i> 恢复默认判断标准</MkButton>
							<MkButton rounded :disabled="externalAuditStatsLoading" @click="loadExternalAuditStats"><i class="ti ti-refresh"></i> 刷新健康统计</MkButton>
						</div>

						<MkFolder :defaultOpen="true">
							<template #icon><i class="ti ti-list-check"></i></template>
							<template #label>违规条目</template>
							<div class="_gaps">
								<MkInfo>模型只负责选择条目。命中普通条目后使用这里配置的固定原因；确属高风险但没有对应条目时选择“其他高风险内容”。</MkInfo>
								<div v-for="(rule, i) in form.state.agentExternalAuditRuleRows" :key="rule.id" :class="$style.modelCard" class="_gaps_s">
									<div :class="$style.modelCardHead">
										<b>{{ rule.name.trim() || `违规条目 #${i + 1}` }}</b>
										<div :class="$style.modelCardActions">
											<button type="button" class="_button" :disabled="i === 0" title="上移" @click="moveExternalAuditRule(i, -1)"><i class="ti ti-arrow-up"></i></button>
											<button type="button" class="_button" :disabled="i === form.state.agentExternalAuditRuleRows.length - 1" title="下移" @click="moveExternalAuditRule(i, 1)"><i class="ti ti-arrow-down"></i></button>
											<button type="button" class="_button" :class="$style.iconWarn" title="删除条目" @click="removeExternalAuditRule(i)"><i class="ti ti-trash"></i></button>
										</div>
									</div>
									<FormSplit :minWidth="220">
										<MkInput v-model="rule.name"><template #label>条目名</template></MkInput>
										<MkInput v-model="rule.id"><template #label>条目 ID</template><template #caption>创建后不建议修改；使用小写字母、数字、下划线或连字符。</template></MkInput>
									</FormSplit>
									<MkInput v-model="rule.reason"><template #label>固定拦截原因</template><template #caption>命中此条目时直接展示该原因，不采用模型自由生成的原因。</template></MkInput>
									<MkTextarea v-model="rule.criteria"><template #label>判断标准</template><template #caption>写清适用范围、必要条件和不应误拦截的例外。</template></MkTextarea>
									<MkSwitch v-model="rule.enabled"><template #label>启用此条目</template></MkSwitch>
								</div>
								<MkButton rounded @click="addExternalAuditRule"><i class="ti ti-plus"></i> 添加违规条目</MkButton>

								<div :class="$style.modelCard" class="_gaps_s">
									<div :class="$style.modelCardHead"><b>其他高风险内容</b><span>固定兜底项</span></div>
									<MkInput v-model="form.state.agentExternalAuditOtherRule.reason"><template #label>兜底原因</template><template #caption>决策模型无法生成原因，或 OpenAI 模型未提供有效原因时使用。</template></MkInput>
									<MkTextarea v-model="form.state.agentExternalAuditOtherRule.criteria"><template #label>判断标准</template></MkTextarea>
								</div>
								<MkButton rounded @click="restoreExternalAuditRules"><i class="ti ti-restore"></i> 恢复默认规则集</MkButton>
							</div>
						</MkFolder>

					<MkFolder :defaultOpen="true">
						<template #icon><i class="ti ti-shield-exclamation"></i></template>
						<template #label>人工复审触发条件</template>
						<div class="_gaps">
							<MkInfo>当用户在指定时间窗口内触发外审拦截达到设定次数时，自动将该用户标记为需要人工复审。可配置多条规则。</MkInfo>
							<div v-for="(rule, i) in form.state.agentReviewTriggerRules" :key="rule.id" :class="$style.modelCard" class="_gaps_s">
								<div :class="$style.modelCardHead">
									<b>规则 #{{ i + 1 }}</b>
									<button type="button" class="_button" :class="$style.iconWarn" @click="removeReviewTriggerRule(i)"><i class="ti ti-trash"></i></button>
								</div>
								<FormSplit :minWidth="200">
									<MkInput v-model="rule.timeWindowMinutes" type="text">
										<template #label>时间窗口（分钟）</template>
										<template #caption>如 60 表示 1 小时内</template>
									</MkInput>
									<MkInput v-model="rule.blockThreshold" type="text">
										<template #label>触发次数</template>
										<template #caption>如 5 表示触发 5 次</template>
									</MkInput>
								</FormSplit>
								<MkSwitch v-model="rule.enabled"><template #label>启用此规则</template></MkSwitch>
							</div>
							<MkButton rounded @click="addReviewTriggerRule"><i class="ti ti-plus"></i> 添加复审规则</MkButton>
						</div>
					</MkFolder>

					<MkFolder :defaultOpen="true">
						<template #icon><i class="ti ti-chart-bar"></i></template>
						<template #label>外审运行统计</template>
						<div class="_gaps">
							<MkTabs
								v-model:tab="externalAuditSubTab"
								:tabs="[{
									key: 'stats',
									title: '健康统计',
									icon: 'ti ti-chart-bar',
								}, {
									key: 'failures',
									title: '失败记录',
									icon: 'ti ti-alert-triangle',
								}]"
							/>
							<template v-if="externalAuditSubTab === 'stats'">
								<MkLoading v-if="externalAuditStatsLoading"/>
								<MkInfo v-else-if="externalAuditStats.length === 0">暂无外审模型统计。</MkInfo>
								<template v-else>
									<MkInfo>统计范围为最近 1 小时；API 失败指请求阶段报错（超时/网络/HTTP 错误等），解析失败指模型回复内容缺失或无法解析为审核结论。</MkInfo>
									<div :class="$style.auditStatsTable">
										<div :class="$style.auditStatsHead">
											<span>模型</span><span>状态</span><span>总数</span><span>API 失败</span><span>解析失败</span><span>总失败</span><span>失败率</span>
										</div>
										<div v-for="row in externalAuditStats" :key="row.id" :class="$style.auditStatsRow">
											<span data-label="模型">{{ row.name }}</span>
											<span data-label="状态">{{ externalAuditStatStatus(row) }}</span>
											<span data-label="总数">{{ row.total }}</span>
											<span data-label="API 失败">{{ row.apiFailed }}</span>
											<span data-label="解析失败">{{ row.parseFailed }}</span>
											<span data-label="总失败">{{ row.failed }}</span>
											<span data-label="失败率">{{ (row.failureRate * 100).toFixed(1) }}%</span>
										</div>
									</div>
								</template>
							</template>
							<template v-else>
								<div :class="$style.auditFailuresToolbar">
									<span :class="$style.auditFailuresHint">仅显示最近 50 条失败记录</span>
									<MkButton rounded :disabled="externalAuditFailuresLoading" @click="loadExternalAuditFailures"><i class="ti ti-refresh"></i> 刷新</MkButton>
								</div>
								<MkLoading v-if="externalAuditFailuresLoading"/>
								<MkInfo v-else-if="externalAuditFailures.length === 0">暂无失败记录。</MkInfo>
								<div v-else :class="$style.auditFailureList">
									<div v-for="row in externalAuditFailures" :key="row.id" :class="$style.auditFailureCard">
										<div :class="$style.auditFailureHead">
											<span :class="[$style.auditFailureKind, row.failureKind === 'parse' ? $style.auditFailureKindParse : $style.auditFailureKindApi]">{{ externalAuditFailureKindLabel(row.failureKind) }}</span>
											<b :class="$style.auditFailureModel">{{ row.modelName || row.modelId || '未知模型' }}</b>
											<time :class="$style.auditFailureTime">{{ formatExternalAuditFailureTime(row.createdAt) }}</time>
										</div>
										<template v-if="row.failureKind === 'parse'">
											<div :class="$style.auditFailureReason">AI 回复内容无法解析为结构化审核结论：</div>
											<pre :class="$style.auditFailurePre">{{ row.responseText || '（空回复）' }}</pre>
										</template>
										<template v-else>
											<div :class="$style.auditFailureReason">
												<code v-if="row.errorCode" :class="$style.auditFailureCode">{{ row.errorCode }}</code>
												<span>{{ row.errorMessage || '未知错误' }}</span>
											</div>
											<template v-if="row.responseText">
												<div :class="$style.auditFailureReason">响应体：</div>
												<pre :class="$style.auditFailurePre">{{ row.responseText }}</pre>
											</template>
										</template>
									</div>
								</div>
							</template>
						</div>
					</MkFolder>
				</div>
			</MkFolder>

			<MkFolder v-if="activeTab === 'images'" :defaultOpen="true">
				<template #icon><i class="ti ti-brush"></i></template>
				<template #label>绘图</template>
				<div class="_gaps">
					<MkSwitch v-model="form.state.agentImageGenerationEnabled">
						<template #label>站点绘图总开关</template>
					</MkSwitch>
					<MkInfo>默认不提供任何生图模型。先添加模型，填写显示名称并选择提供商；选择 Aurora 后才会展开 Aurora 专属配置。</MkInfo>
					<MkInfo v-if="form.state.agentImageModelRows.length === 0">当前没有生图模型。用户聊天界面会显示“无”，即关闭生图。</MkInfo>
					<template v-for="section in imageModelSections" :key="section.key">
						<div v-if="section.key === 'active' || section.rows.length > 0" :class="[$style.modelSectionHead, section.key === 'unlisted' ? $style.modelSectionHeadMuted : null]">
							<span>{{ section.label }}<span :class="$style.modelSectionCount">{{ section.rows.length }}</span></span>
							<MkButton v-if="section.key === 'active'" small rounded @click="onAddImageModelMenu"><i class="ti ti-plus"></i> 添加生图模型</MkButton>
						</div>
						<div v-for="row in section.rows" :key="row.id" :data-model-row-id="section.key === 'active' ? row.id : undefined" :class="[$style.modelRow, row.enabled ? null : $style.modelRowUnlisted, modelRowDrag?.id === row.id ? $style.modelRowDragging : null, modelRowDrag?.id === row.id && modelRowDrag.snapping ? $style.modelRowSnapping : null, modelRowDrag != null && modelRowDrag.id !== row.id ? $style.modelRowShiftable : null, modelRowDrag != null && modelRowDrag.overId === row.id ? (modelRowDrag.overPos === 'before' ? $style.modelRowDropBefore : $style.modelRowDropAfter) : null]" :style="modelRowDragStyle(row.id)">
							<div :class="$style.modelRowHead" @click="toggleImageModelExpanded(row.id)">
								<i class="ti ti-chevron-right" :class="[$style.modelRowChevron, isImageModelExpanded(row.id) ? $style.modelRowChevronOpen : null]"></i>
								<span :class="$style.modelRowTitle">{{ row.name.trim() || '未命名生图模型' }}</span>
								<span v-if="!row.enabled" :class="$style.unlistedBadge">{{ i18n.ts._agents.adminModelUnlistedBadge }}</span>
								<span :class="$style.modelRowMeta">{{ imageModelRowMeta(row) }}</span>
								<div :class="$style.modelCardActions" @click.stop>
									<button type="button" class="_button" :class="$style.iconMuted" :title="i18n.ts._agents.adminModelCopy" @click="copyImageModelRow(row)">
										<i class="ti ti-copy"></i>
									</button>
									<template v-if="row.enabled">
										<button type="button" class="_button" :class="$style.iconWarn" :title="i18n.ts._agents.adminModelUnlist" @click="toggleImageModelEnabled(row, false)">
											<i class="ti ti-archive"></i>
										</button>
										<span :class="$style.modelRowGrip" title="长按拖动排序" @pointerdown="onModelRowGripPointerDown($event, 'image', row)" @contextmenu.prevent>
											<i class="ti ti-grip-vertical"></i>
										</span>
									</template>
									<button v-else type="button" class="_button" :class="$style.iconMuted" :title="i18n.ts._agents.adminModelRelist" @click="toggleImageModelEnabled(row, true)">
										<i class="ti ti-eye"></i>
									</button>
								</div>
							</div>
							<div v-if="isImageModelExpanded(row.id)" :class="$style.modelRowBody" class="_gaps_s">
								<div v-if="row.id.trim() !== ''" :class="$style.internalIdRow">
									<span :class="$style.internalIdLabel">{{ i18n.ts._agents.fieldModelInternalId }}</span>
									<code :class="$style.internalIdValue">{{ row.id }}</code>
									<p :class="$style.internalIdCaption">{{ i18n.ts._agents.fieldModelInternalIdCaption }}</p>
								</div>
								<FormSplit :minWidth="220">
									<MkInput v-model="row.name" :readonly="!row.enabled"><template #label>显示名称</template></MkInput>
									<MkSelect v-model="row.provider" :items="agentImageProviderItems" :readonly="!row.enabled"><template #label>模型提供商</template></MkSelect>
								</FormSplit>
								<MkTextarea v-model="row.description" :readonly="!row.enabled">
									<template #label>{{ i18n.ts._agents.adminImageModelDescription }}</template>
									<template #caption>{{ i18n.ts._agents.adminImageModelDescriptionCaption }}</template>
								</MkTextarea>
								<template v-if="row.provider === 'aurora'">
									<FormSplit :minWidth="220">
										<MkInput v-model="row.apiModelName" :readonly="!row.enabled"><template #label>Aurora 上游模型名</template></MkInput>
										<MkInput v-model="row.costPerCall" type="text" :readonly="!row.enabled"><template #label>每张扣费</template></MkInput>
									</FormSplit>
									<MkInput v-model="row.dailyFreeQuota" type="text" :readonly="!row.enabled">
										<template #label>每日免费次数</template>
										<template #caption>设为 0 则无免费额度；每日 0 点（北京时间）重置</template>
									</MkInput>
									<MkInput v-model="row.defaultArtistPresetId" :readonly="!row.enabled"><template #label>默认画师串 ID</template></MkInput>
									<MkInfo warn>以下是 Aurora 参数。不了解时保持默认；会话页可在此基础上个性化覆盖。</MkInfo>
									<FormSplit :minWidth="180">
										<MkInput v-model="row.steps" type="text" :readonly="!row.enabled"><template #label>Steps</template></MkInput>
										<MkInput v-model="row.scale" type="text" :readonly="!row.enabled"><template #label>Scale</template></MkInput>
										<MkInput v-model="row.cfgRescale" type="text" :readonly="!row.enabled"><template #label>CFG Rescale</template></MkInput>
									</FormSplit>
									<FormSplit :minWidth="220">
										<MkInput v-model="row.sampler" :readonly="!row.enabled"><template #label>Sampler</template></MkInput>
										<MkInput v-model="row.noiseSchedule" :readonly="!row.enabled"><template #label>Noise Schedule</template></MkInput>
									</FormSplit>
									<MkTextarea v-model="row.promptPrefix" :readonly="!row.enabled"><template #label>Prompt Prefix</template></MkTextarea>
									<MkTextarea v-model="row.promptSuffix" :readonly="!row.enabled"><template #label>Prompt Suffix</template></MkTextarea>
								</template>
								<template v-else-if="row.provider === 'qwen'">
									<FormSplit :minWidth="220">
										<MkInput v-model="row.apiUrl" :readonly="!row.enabled">
											<template #label>{{ i18n.ts._agents.adminQwenImageRequestUrl }}</template>
											<template #caption>{{ i18n.ts._agents.adminQwenImageRequestUrlCaption }}</template>
										</MkInput>
										<MkInput v-model="row.apiKey" type="password" :readonly="!row.enabled"><template #label>{{ i18n.ts._agents.adminQwenImageApiKey }}</template></MkInput>
									</FormSplit>
									<FormSplit :minWidth="220">
										<MkInput v-model="row.apiModelName" :readonly="!row.enabled"><template #label>{{ i18n.ts._agents.adminQwenImageModelName }}</template></MkInput>
										<MkInput v-model="row.costPerCall" type="text" :readonly="!row.enabled"><template #label>{{ i18n.ts._agents.adminImageModelCost }}</template></MkInput>
									</FormSplit>
									<MkInput v-model="row.dailyFreeQuota" type="text" :readonly="!row.enabled">
										<template #label>每日免费次数</template>
										<template #caption>设为 0 则无免费额度；每日 0 点（北京时间）重置</template>
									</MkInput>
									<MkInfo warn>Qwen-Image 接口使用 DashScope 风格协议（input/parameters），同步返回 output.results 图片地址，不支持参考图。</MkInfo>
								</template>
								<template v-else-if="row.provider === 'sensenova'">
									<FormSplit :minWidth="220">
										<MkInput v-model="row.apiUrl" :readonly="!row.enabled">
											<template #label>{{ i18n.ts._agents.adminSenseNovaImageRequestUrl }}</template>
											<template #caption>{{ i18n.ts._agents.adminSenseNovaImageRequestUrlCaption }}</template>
										</MkInput>
										<MkInput v-model="row.apiKey" type="password" :readonly="!row.enabled"><template #label>{{ i18n.ts._agents.adminOpenaiImageApiKey }}</template></MkInput>
									</FormSplit>
									<FormSplit :minWidth="220">
										<MkInput v-model="row.apiModelName" :readonly="!row.enabled"><template #label>{{ i18n.ts._agents.adminSenseNovaImageModelName }}</template></MkInput>
										<MkInput v-model="row.costPerCall" type="text" :readonly="!row.enabled"><template #label>{{ i18n.ts._agents.adminImageModelCost }}</template></MkInput>
									</FormSplit>
									<MkInput v-model="row.dailyFreeQuota" type="text" :readonly="!row.enabled">
										<template #label>每日免费次数</template>
										<template #caption>设为 0 则无免费额度；每日 0 点（北京时间）重置</template>
									</MkInput>
									<MkSwitch v-model="row.supportsReferenceImage" :disabled="!row.enabled">
										<template #label>{{ i18n.ts._agents.adminImageModelReferenceImage }}</template>
										<template #caption>{{ i18n.ts._agents.adminSenseNovaReferenceImageCaption }}</template>
									</MkSwitch>
									<MkInfo>{{ i18n.ts._agents.adminSenseNovaImageModeCaption }}</MkInfo>
								</template>
									<template v-else>
										<FormSplit :minWidth="220">
											<MkInput v-model="row.apiUrl" :readonly="!row.enabled">
												<template #label>{{ i18n.ts._agents.adminOpenaiImageRequestUrl }}</template>
												<template #caption>{{ i18n.ts._agents.adminOpenaiImageRequestUrlCaption }}</template>
											</MkInput>
											<MkInput v-model="row.apiKey" type="password" :readonly="!row.enabled"><template #label>{{ i18n.ts._agents.adminOpenaiImageApiKey }}</template></MkInput>
										</FormSplit>
										<FormSplit :minWidth="220">
											<MkInput v-model="row.apiModelName" :readonly="!row.enabled"><template #label>{{ i18n.ts._agents.adminOpenaiImageModelName }}</template></MkInput>
											<MkInput v-model="row.costPerCall" type="text" :readonly="!row.enabled"><template #label>{{ i18n.ts._agents.adminImageModelCost }}</template></MkInput>
										</FormSplit>
										<MkInput v-model="row.dailyFreeQuota" type="text" :readonly="!row.enabled">
											<template #label>每日免费次数</template>
											<template #caption>设为 0 则无免费额度；每日 0 点（北京时间）重置</template>
										</MkInput>
										<MkSwitch v-model="row.supportsReferenceImage" :disabled="!row.enabled">
											<template #label>{{ i18n.ts._agents.adminImageModelReferenceImage }}</template>
											<template #caption>{{ i18n.ts._agents.adminImageModelReferenceImageCaption }}</template>
										</MkSwitch>
									</template>
							</div>
						</div>
					</template>
					<MkFolder v-if="hasAuroraImageModel">
						<template #icon><i class="ti ti-cloud-cog"></i></template>
						<template #label>Aurora 提供商配置</template>
						<div class="_gaps">
							<MkInput v-model="form.state.agentImageBaseUrl">
								<template #label>Aurora Base URL</template>
							</MkInput>
							<div v-for="(row, i) in form.state.agentImageTokenRows" :key="row.id" :class="$style.tokenCard" class="_gaps_s">
								<div :class="$style.modelCardHead">
									<b>Token #{{ i + 1 }}</b>
									<button type="button" class="_button" :class="$style.iconWarn" @click="removeImageToken(i)"><i class="ti ti-trash"></i></button>
								</div>
								<FormSplit :minWidth="220">
									<MkInput v-model="row.name"><template #label>备注</template></MkInput>
									<MkInput v-model="row.token" type="password"><template #label>Token</template></MkInput>
								</FormSplit>
								<FormSplit :minWidth="180">
									<MkInput v-model="row.sortOrder" type="text"><template #label>排序</template></MkInput>
									<MkSwitch v-model="row.enabled"><template #label>启用</template></MkSwitch>
								</FormSplit>
								<div :class="$style.tokenMeta">
									<span>余额：{{ row.points === '' ? '未知' : row.points }}</span>
									<span>最后使用：{{ row.lastUsedAt || '未知' }}</span>
									<span v-if="row.lastError">错误：{{ row.lastError }}</span>
								</div>
							</div>
							<div class="_buttons">
								<MkButton rounded @click="addImageToken"><i class="ti ti-plus"></i> 添加 Token</MkButton>
								<MkButton rounded :disabled="imageTokenRefreshing" @click="refreshImageTokens"><i class="ti ti-refresh"></i> 刷新余额</MkButton>
							</div>
							<MkFolder :defaultOpen="true">
								<template #icon><i class="ti ti-brush"></i></template>
								<template #label>画师串管理</template>
								<div class="_gaps">
									<MkInfo>这些画师串只作用于 Aurora / Naval AI 模型。用户和智能体只选择名称，实际前缀、后缀、负面提示词由后端填充。</MkInfo>
									<div v-if="form.state.agentImageArtistPresetRows.length === 0" :class="$style.emptyModels">当前没有画师串，聊天页将没有可选画师串。</div>
									<div :class="$style.artistPresetGrid">
										<div v-for="(preset, presetIndex) in form.state.agentImageArtistPresetRows" :key="preset.id" :class="$style.artistPresetCard" class="_gaps_s">
											<div :class="$style.modelCardHead">
												<b>{{ preset.name.trim() || `画师串 #${presetIndex + 1}` }}</b>
												<button type="button" class="_button" :class="$style.iconWarn" title="删除画师串" @click="removeImageArtistPreset(presetIndex)">
													<i class="ti ti-trash"></i>
												</button>
											</div>
											<div :class="$style.artistPresetPreview">
												<img v-if="preset.thumbnailUrl" :src="preset.thumbnailUrl" alt=""/>
												<i v-else class="ti ti-brush"></i>
											</div>
											<div class="_buttons">
												<MkButton small rounded @click="selectImageArtistPresetThumbnail(presetIndex, $event)"><i class="ti ti-photo-plus"></i> 选择预览图</MkButton>
												<MkButton v-if="preset.thumbnailUrl" small rounded @click="clearImageArtistPresetThumbnail(presetIndex)"><i class="ti ti-x"></i> 清除</MkButton>
											</div>
											<FormSplit :minWidth="220">
												<MkInput v-model="preset.name"><template #label>名称</template></MkInput>
												<MkInput v-model="preset.id"><template #label>ID</template><template #caption>用于模型默认画师串和会话配置引用。</template></MkInput>
											</FormSplit>
											<MkInput v-model="preset.thumbnailUrl">
												<template #label>预览图 URL</template>
												<template #caption>可通过上方按钮上传到 Drive，也可以粘贴已有图片地址。</template>
											</MkInput>
											<MkTextarea v-model="preset.promptPrefix"><template #label>Prompt Prefix</template></MkTextarea>
											<MkTextarea v-model="preset.promptSuffix"><template #label>Prompt Suffix</template></MkTextarea>
											<MkTextarea v-model="preset.negativePrompt"><template #label>Negative Prompt</template></MkTextarea>
										</div>
									</div>
									<MkButton rounded @click="addImageArtistPreset"><i class="ti ti-plus"></i> 添加画师串</MkButton>
								</div>
							</MkFolder>
						</div>
					</MkFolder>
					<FormSplit :minWidth="180">
						<MkInput v-model="form.state.agentImageMaxPerReply" type="text">
							<template #label>每轮最多图片</template>
							<template #caption>作为会话「自动生图张数」的默认值。每轮解析图片指令的数量不设上限，超出自动生成上限的指令将进入待手动生成状态。</template>
						</MkInput>
						<MkInput v-if="hasAuroraImageModel" v-model="form.state.agentImageTokenMinPoints" type="text"><template #label>最低可用点数</template></MkInput>
						<MkInput v-if="hasAuroraImageModel" v-model="form.state.agentImageTokenBalanceTtlSeconds" type="text"><template #label>余额缓存秒数</template></MkInput>
					</FormSplit>
					<MkTextarea v-if="hasAuroraImageModel" v-model="form.state.agentImageDefaultNegativePrompt">
						<template #label>默认负面提示词</template>
						<template #caption>留空会使用内置默认负面词；后端始终会额外追加 NSFW、未成年、暴力等安全负面标签。</template>
					</MkTextarea>
				</div>
			</MkFolder>

			<MkFolder v-if="activeTab === 'sticker'" :defaultOpen="true">
				<template #icon><i class="ti ti-sticker"></i></template>
				<template #label>{{ i18n.ts._agents.stickerTabTitle }}</template>
				<div class="_gaps">
					<MkInfo>{{ i18n.ts._agents.stickerAdminIntro }}</MkInfo>
					<MkSwitch v-model="form.state.agentStickerEnabled">
						<template #label>{{ i18n.ts._agents.stickerEnabled }}</template>
						<template #caption>{{ i18n.ts._agents.stickerEnabledCaption }}</template>
					</MkSwitch>
					<FormSplit :minWidth="180">
						<MkInput v-model="form.state.agentStickerMaxPerMessage" type="text">
							<template #label>{{ i18n.ts._agents.stickerMaxPerMessage }}</template>
							<template #caption>{{ i18n.ts._agents.stickerMaxPerMessageCaption }}</template>
						</MkInput>
						<MkInput v-model="form.state.agentEmojiPromptMaxCount" type="text">
							<template #label>{{ i18n.ts._agents.emojiPromptMaxCount }}</template>
							<template #caption>{{ i18n.ts._agents.emojiPromptMaxCountCaption }}</template>
						</MkInput>
					</FormSplit>
				</div>
			</MkFolder>

			<MkFolder v-if="activeTab === 'pet'" :defaultOpen="true">
				<template #icon><i class="ti ti-paw"></i></template>
				<template #label>桌宠表演</template>
				<div class="_gaps">
					<MkInfo>桌宠客户端（Live2D 桌面宠物）发消息时会携带可用的表情与动作清单，后端据此注入表演协议，让回复中穿插 [[agent_cue]] 指令驱动角色表演。网页端会话不受影响。</MkInfo>
					<MkSwitch v-model="form.state.agentPerformanceEnabled">
						<template #label>启用桌宠表演协议</template>
						<template #caption>关闭后，即使请求携带表情与动作清单，也按普通网页会话处理：不注入表演协议，回复中的表演指令一律剥离。</template>
					</MkSwitch>
					<MkTextarea v-model="form.state.agentPerformanceSystemPrompt">
						<template #label>桌宠默认提示词</template>
						<template #caption>桌宠会话注入表演协议时追加的自定义提示词，位于 system 提示末尾的桌宠协议块内（示例之后）；留空不追加。</template>
					</MkTextarea>
				</div>
			</MkFolder>

			<MkFolder v-if="activeTab === 'vision'" :defaultOpen="true">
				<template #icon><i class="ti ti-eye"></i></template>
				<template #label>{{ i18n.ts._agents.adminVisionTitle }}</template>
				<div class="_gaps">
					<MkInfo>{{ i18n.ts._agents.adminVisionCaption }}</MkInfo>
					<MkSelect v-model="form.state.agentVisionDefaultModelId" :items="agentVisionDefaultItems"><template #label>{{ i18n.ts._agents.adminVisionDefaultModel }}</template></MkSelect>
					<div v-for="(row, i) in form.state.agentVisionModelRows" :key="row.id" :class="$style.modelCard" class="_gaps_s">
						<div :class="$style.modelCardHead"><b>{{ row.name.trim() || `${i18n.ts._agents.adminVisionModel} #${i + 1}` }}</b><button type="button" class="_button" :class="$style.iconWarn" @click="removeVisionModel(i)"><i class="ti ti-trash"></i></button></div>
						<FormSplit :minWidth="220"><MkInput v-model="row.name"><template #label>{{ i18n.ts._agents.adminVisionModel }}</template></MkInput><MkSwitch v-model="row.enabled"><template #label>{{ i18n.ts.enabled }}</template></MkSwitch></FormSplit>
						<FormSplit :minWidth="220"><MkInput v-model="row.apiUrl"><template #label>{{ i18n.ts._agents.adminVisionRequestUrl }}</template><template #caption>{{ i18n.ts._agents.adminVisionRequestUrlCaption }}</template></MkInput><MkInput v-model="row.apiKey" type="password"><template #label>{{ i18n.ts._agents.adminVisionApiKey }}</template></MkInput></FormSplit>
						<FormSplit :minWidth="220"><MkInput v-model="row.apiModelName"><template #label>{{ i18n.ts._agents.adminVisionUpstreamModel }}</template></MkInput><MkInput v-model="row.costPerCall" type="text"><template #label>{{ i18n.ts._agents.adminVisionCost }}</template></MkInput></FormSplit>
					</div>
					<MkButton rounded @click="addVisionModel"><i class="ti ti-plus"></i> {{ i18n.ts._agents.adminVisionAddModel }}</MkButton>
				</div>
			</MkFolder>

			<MkFolder v-if="activeTab === 'checkin'" :defaultOpen="true">
				<template #icon><i class="ti ti-calendar-check"></i></template>
				<template #label>每日签到</template>
				<div class="_gaps">
					<MkSwitch v-model="form.state.checkinEnabled">
						<template #label>启用每日签到</template>
						<template #caption>用户每日首次打开站点时自动签到，获得智能体额度</template>
					</MkSwitch>
					<FormSplit :minWidth="220">
						<MkInput v-model="form.state.checkinStreakMaxDays" type="text">
							<template #label>连续达标天数</template>
							<template #caption>连续签到多少天达到最大倍率（默认 365）</template>
						</MkInput>
						<MkInput v-model="form.state.checkinStreakMaxMultiplier" type="text">
							<template #label>连续最大倍率</template>
							<template #caption>达标时的倍率（默认 2.0 = 翻倍）</template>
						</MkInput>
					</FormSplit>
					<FormSplit :minWidth="220">
						<MkInput v-model="form.state.checkinSpecialDayMultiplier" type="text">
							<template #label>节日倍率</template>
							<template #caption>特殊日子的奖励倍率（默认 2.0）</template>
						</MkInput>
						<MkInput v-model="form.state.checkinSpecialDays" type="text">
							<template #label>特殊日子</template>
							<template #caption>MM-DD 格式，逗号分隔（如 01-01,05-01,10-01）</template>
						</MkInput>
					</FormSplit>
					<hr>
					<MkSwitch v-model="form.state.checkinMakeupEnabled">
						<template #label>启用补签</template>
					</MkSwitch>
					<FormSplit :minWidth="220">
						<MkInput v-model="form.state.checkinMakeupMaxPerMonth" type="text">
							<template #label>每月补签上限</template>
						</MkInput>
						<MkInput v-model="form.state.checkinMakeupBaseCost" type="text">
							<template #label>补签基础消耗</template>
							<template #caption>第 1 次补签消耗的额度</template>
						</MkInput>
					</FormSplit>
					<FormSplit :minWidth="220">
						<MkInput v-model="form.state.checkinMakeupCostIncrement" type="text">
							<template #label>补签消耗递增</template>
							<template #caption>第 N 次 = 基础 + (N-1) × 递增</template>
						</MkInput>
						<MkInput v-model="form.state.checkinMakeupAllowedWindowDays" type="text">
							<template #label>可补签回溯天数</template>
							<template #caption>只能补最近 N 天（默认 7）</template>
						</MkInput>
					</FormSplit>
					<hr>
					<MkFolder>
						<template #icon><i class="ti ti-calendar-plus"></i></template>
						<template #label>{{ i18n.ts._agents.adminCheckinMakeupTitle }}</template>
						<div class="_gaps">
							<MkInfo>{{ i18n.ts._agents.adminCheckinMakeupCaption }}</MkInfo>
							<MkInput v-model="checkinMakeupForm.userId" type="text">
								<template #label>{{ i18n.ts._agents.adminCheckinMakeupUser }}</template>
								<template #caption>{{ i18n.ts._agents.adminCheckinMakeupUserCaption }}</template>
							</MkInput>
							<MkInput v-model="checkinMakeupForm.date" type="date">
								<template #label>{{ i18n.ts._agents.adminCheckinMakeupDate }}</template>
							</MkInput>
							<MkButton primary rounded :disabled="checkinMakeupSubmitting || !checkinMakeupForm.userId.trim() || !checkinMakeupForm.date" @click="adminMakeupCheckin">
								<i class="ti ti-calendar-plus"></i> {{ i18n.ts._agents.adminCheckinMakeupButton }}
							</MkButton>
						</div>
					</MkFolder>
					<MkButton danger rounded @click="revokeTodayCheckin"><i class="ti ti-rotate-back"></i> 撤销当日签到（测试用）</MkButton>
				</div>
			</MkFolder>

			<template v-if="activeTab === 'credits'">
				<MkFolder :defaultOpen="true">
					<template #icon><i class="ti ti-gift"></i></template>
					<template #label>签发奖励</template>
					<div class="_gaps">
						<MkInfo>向指定用户发放奖励额度，入账后用户会收到通知，并在消费日志中显示。</MkInfo>
						<MkInput v-model="rewardForm.userId" type="text">
							<template #label>指定用户</template>
							<template #caption>用户 ID 或 @username / @username@host</template>
						</MkInput>
						<MkInput v-model="rewardForm.reason" type="text" :maxlength="200">
							<template #label>{{ i18n.ts._agents.adminRewardReason }}</template>
						</MkInput>
						<MkInput v-model="rewardForm.amount" type="number" :min="0.01" :max="100000" :step="0.01">
							<template #label>{{ i18n.ts._agents.adminRewardAmount }}</template>
							<template #prefix><i class="ti ti-coin"></i></template>
						</MkInput>
						<MkButton primary rounded :disabled="rewardIssuing || !rewardForm.userId.trim() || !rewardForm.amount || Number(rewardForm.amount) <= 0" @click="issueReward">
							<i class="ti ti-gift"></i> {{ i18n.ts._agents.adminIssueRewardBtn }}
						</MkButton>
					</div>
				</MkFolder>

				<MkFolder :defaultOpen="true">
					<template #icon><i class="ti ti-plus"></i></template>
					<template #label>{{ i18n.ts._agents.redeemCodesGenerate }}</template>
					<div class="_gaps">
						<FormSplit :minWidth="220">
							<MkInput v-model="redeemForm.amount" type="number" :min="0.0001">
								<template #label>{{ i18n.ts._agents.redeemCodesAmount }}</template>
							</MkInput>
							<MkInput v-model="redeemForm.count" type="number" :min="1" :max="100">
								<template #label>{{ i18n.ts._agents.redeemCodesCount }}</template>
							</MkInput>
						</FormSplit>
						<MkInput v-model="redeemForm.note" type="text">
							<template #label>{{ i18n.ts._agents.redeemCodesNote }}</template>
						</MkInput>
						<MkInput v-model="redeemForm.expiresAt" type="datetime-local">
							<template #label>{{ i18n.ts._agents.redeemCodesExpires }}</template>
						</MkInput>
						<div class="_buttons">
							<MkButton primary rounded :disabled="redeemGenerating" @click="generateRedeemCodes"><i class="ti ti-plus"></i> {{ i18n.ts._agents.redeemCodesGenerateBtn }}</MkButton>
							<MkButton rounded :disabled="redeemLoading" @click="loadRedeemListPage(1, true)"><i class="ti ti-refresh"></i> 刷新列表</MkButton>
						</div>
						<div v-if="generatedCodes.length > 0" :class="$style.generatedBox">
							<div :class="$style.generatedHead">
								<b>{{ i18n.ts._agents.redeemCodesGenerated }}</b>
								<MkButton small rounded @click="copyGeneratedCodes"><i class="ti ti-copy"></i> {{ i18n.ts._agents.redeemCodesCopyAll }}</MkButton>
							</div>
							<code v-for="c in generatedCodes" :key="c.id" :class="$style.generatedCode">{{ c.code }} · {{ c.creditAmount }}</code>
						</div>
					</div>
				</MkFolder>

				<MkFolder :defaultOpen="true">
					<template #icon><i class="ti ti-link"></i></template>
					<template #label>{{ i18n.ts._agents.redeemPurchaseUrl }}</template>
					<div class="_gaps">
						<MkInput v-model="form.state.agentRedeemPurchaseUrl" type="url">
							<template #label>{{ i18n.ts._agents.redeemPurchaseUrl }}</template>
							<template #caption>{{ i18n.ts._agents.redeemPurchaseUrlCaption }}</template>
						</MkInput>
					</div>
				</MkFolder>

				<MkFolder :defaultOpen="true">
					<template #icon><i class="ti ti-list"></i></template>
					<template #label>{{ i18n.ts._agents.redeemCodesList }}</template>
					<div class="_gaps">
						<div :class="$style.filterRow">
							<MkSelect v-model="redeemStatus" :items="redeemStatusItems" small>
								<template #label>{{ i18n.ts._agents.redeemCodesFilterStatus }}</template>
							</MkSelect>
							<MkInput v-model="redeemQuery" type="text" small :class="$style.searchInput">
								<template #label>{{ i18n.ts._agents.redeemCodesSearch }}</template>
								<template #prefix><i class="ti ti-search"></i></template>
							</MkInput>
							<MkButton small rounded :disabled="redeemLoading" @click="loadRedeemListPage(1, true)"><i class="ti ti-refresh"></i></MkButton>
						</div>

						<MkLoading v-if="redeemLoading && redeemCodes.length === 0"/>
						<div v-else-if="redeemCodes.length === 0" :class="$style.emptyMsg">{{ i18n.ts._agents.redeemCodesEmpty }}</div>

						<div v-if="redeemCodes.length > 0" :class="$style.redeemTable">
							<div :class="$style.redeemHead">
								<span :class="$style.colCreatedAt">{{ i18n.ts._agents.redeemCodesColCreatedAt }}</span>
								<span :class="$style.colCode">{{ i18n.ts._agents.redeemCodesColCode }}</span>
								<span :class="$style.colAmount">{{ i18n.ts._agents.redeemCodesAmount }}</span>
								<span :class="$style.colStatus">{{ i18n.ts._agents.redeemCodesColStatus }}</span>
								<span :class="$style.colNote">{{ i18n.ts._agents.redeemCodesNote }}</span>
								<span :class="$style.colUser">{{ i18n.ts._agents.redeemCodesColUser }}</span>
								<span :class="$style.colActions"></span>
							</div>
							<div v-for="row in redeemCodes" :key="row.id" :class="$style.redeemRow">
								<span :class="$style.colCreatedAt">{{ formatBjt(row.createdAt) }}</span>
								<code :class="$style.colCode">{{ row.code }}</code>
								<span :class="$style.colAmount">{{ row.creditAmount }}</span>
								<span :class="$style.colStatus" :style="{ color: redeemStatusColor(row.status) }">{{ redeemStatusLabel(row.status) }}</span>
								<span :class="$style.colNote" :title="row.note">{{ row.note || '—' }}</span>
								<span :class="$style.colUser">
									<template v-if="row.redeemedBy">
										<MkA :to="`/admin/user/${row.redeemedBy.id}`" :class="$style.userLink">
											<MkUserName :user="row.redeemedBy"/>
											<MkAcct :user="row.redeemedBy" :class="$style.userAcct"/>
										</MkA>
										<button
											type="button"
											class="_button"
											:class="$style.userCopyBtn"
											:title="i18n.ts.copy"
											:aria-label="i18n.ts.copy"
											@click="copyAcct(row.redeemedBy)"
										>
											<i class="ti ti-copy"></i>
										</button>
									</template>
									<template v-else>—</template>
								</span>
								<span :class="$style.colActions">
									<button v-if="row.status === 'available'" type="button" class="_button" :class="$style.revokeBtn" :disabled="redeemRevoking" @click="revokeRedeemCode(row)">
										<i class="ti ti-ban"></i>
										<span>{{ i18n.ts._agents.redeemCodesRevoke }}</span>
									</button>
								</span>
							</div>
						</div>
						<div v-if="redeemCodes.length > 0" :class="$style.pagerBar" role="navigation" :aria-label="i18n.ts._agents.redeemCodesList">
							<div :class="$style.pagerSegGroup" :aria-label="i18n.ts._agents.pageSize" role="group">
								<button
									v-for="size in redeemPageSizeOptions"
									:key="`redeem-${size}`"
									type="button"
									class="_button"
									:class="[$style.pagerSegBtn, redeemPageSize === size ? $style.pagerSegBtnActive : null]"
									@click="redeemPageSize = size"
								>
									{{ size }}
								</button>
							</div>
							<div :class="$style.pagerNavGroup" role="group">
								<button
									type="button"
									class="_button"
									:class="$style.pagerNavIconBtn"
									:disabled="redeemListPage <= 1 || redeemLoading"
									:aria-label="i18n.ts._agents.sessionMemoryPrevPage"
									@click="goRedeemPage(redeemListPage - 1)"
								>
									<i class="ti ti-chevron-left" aria-hidden="true"></i>
								</button>
								<span :class="$style.pagerNavText">{{ redeemListPage }}</span>
								<button
									type="button"
									class="_button"
									:class="$style.pagerNavIconBtn"
									:disabled="!redeemHasNext || redeemLoading"
									:aria-label="i18n.ts._agents.sessionMemoryNextPage"
									@click="goRedeemPage(redeemListPage + 1)"
								>
									<i class="ti ti-chevron-right" aria-hidden="true"></i>
								</button>
							</div>
							<div :class="$style.pagerGoGroup" role="group" :aria-label="i18n.ts._agents.pageJump">
								<div :class="$style.pagerGoInputCell">
									<input
										type="number"
										inputmode="numeric"
										:min="1"
										:value="redeemListPageInput"
										:disabled="redeemLoading"
										:class="$style.pagerGoNativeInput"
										:aria-label="i18n.ts._agents.pageJump"
										@input="syncRedeemPagerInput"
										@keydown.enter.prevent="goRedeemInputPage"
									/>
								</div>
								<button
									type="button"
									class="_button"
									:class="$style.pagerGoJumpBtn"
									:disabled="redeemLoading"
									@click="goRedeemInputPage"
								>
									{{ i18n.ts._agents.pageJump }}
								</button>
							</div>
						</div>
					</div>
				</MkFolder>
			</template>

			<template v-if="activeTab === 'migration'">
				<MkFolder :defaultOpen="true">
					<template #icon><i class="ti ti-key"></i></template>
					<template #label>系统授权 Key</template>
					<div class="_gaps">
						<MkInfo>{{ i18n.ts._agents.adminMigrationKeyHint }}</MkInfo>
						<div :class="$style.migrationKeyStatus">
							<span :class="[$style.migrationKeyDot, migrationKeyExists ? $style.migrationKeyDotActive : null]"></span>
							<span>{{ migrationKeyExists ? i18n.ts._agents.adminMigrationKeyGenerated : i18n.ts._agents.adminMigrationKeyNotGenerated }}</span>
						</div>
						<MkButton primary rounded :disabled="migrationKeyGenerating" @click="generateMigrationKey">
							<i class="ti ti-refresh"></i> {{ migrationKeyExists ? i18n.ts._agents.adminMigrationKeyRegenerate : i18n.ts._agents.adminMigrationKeyGenerate }}
						</MkButton>
					</div>
				</MkFolder>

				<MkFolder :defaultOpen="true">
					<template #icon><i class="ti ti-history"></i></template>
					<template #label>迁移日志</template>
					<div class="_gaps">
						<div class="_buttons">
							<MkButton rounded :disabled="migrationLogsLoading" @click="loadMigrationLogs()"><i class="ti ti-refresh"></i> 刷新</MkButton>
						</div>
						<MkLoading v-if="migrationLogsLoading"/>
						<div v-else-if="migrationLogs.length === 0" :class="$style.emptyModels">暂无迁移记录</div>
						<div v-else :class="$style.simpleTable">
							<div :class="[$style.simpleRow, $style.simpleHeadRow]">
								<span>时间</span>
								<span>目标用户</span>
								<span>金额</span>
								<span>状态</span>
								<span>来源</span>
								<span>操作者</span>
							</div>
							<div v-for="row in migrationLogs" :key="row.id" :class="$style.simpleRow">
								<span>{{ new Date(row.createdAt).toLocaleString() }}</span>
								<span><MkUserName v-if="row.targetUser" :user="row.targetUser"/><template v-else>—</template></span>
								<span :class="$style.migrationAmount">+{{ row.amount.toFixed(2) }}</span>
								<span>{{ row.status === 'success' ? '成功' : '失败' }}</span>
								<span>{{ row.sourceInfo || '—' }}</span>
								<span><MkUserName v-if="row.operator" :user="row.operator"/><template v-else>—</template></span>
							</div>
						</div>
						<MkButton v-if="migrationLogs.length > 0 && migrationLogs.length % 30 === 0" rounded @click="loadMoreMigrationLogs"><i class="ti ti-chevron-down"></i> 加载更多</MkButton>
					</div>
				</MkFolder>
			</template>

			<template v-if="activeTab === 'reports'">
				<!-- 报表分类切换：仅切换视图区域，不触发路由跳转 -->
				<div :class="$style.reportTabRow">
					<button
						v-for="t in reportTypeTabs"
						:key="t.value"
						type="button"
						:class="[$style.reportTabBtn, reportType === t.value ? $style.reportTabBtnActive : null]"
						@click="reportType = t.value"
					>
						<i :class="t.icon"></i> {{ t.label }}
					</button>
				</div>

				<!-- 模型报表（v-show保留状态，切换不重新加载） -->
				<div v-show="reportType === 'model'">
					<XModelReports/>
				</div>

				<!-- 签到报表（KeepAlive缓存，切换回来不重新加载） -->
				<KeepAlive>
					<XCheckinReports v-if="reportType === 'checkin'"/>
				</KeepAlive>
			</template>

			<MkFolder v-if="activeTab === 'proactive'" :defaultOpen="true">
				<template #icon><i class="ti ti-message-chatbot"></i></template>
				<template #label>主动消息默认设置</template>
				<div class="_gaps">
					<MkInfo>以下设置作为新建智能体会话的默认值。用户可在各会话中单独覆盖。</MkInfo>
					<MkSwitch v-model="form.state.agentProactiveRandomDefaultEnabled">
						<template #label>随机主动消息默认开启</template>
						<template #caption>新建会话时是否默认启用随机主动消息（需同时开启时间感知）</template>
					</MkSwitch>
					<MkSwitch v-model="form.state.agentProactiveScheduledDefaultEnabled">
						<template #label>定时主动消息默认开启</template>
						<template #caption>新建会话时是否默认启用定时主动消息（需同时开启时间感知）</template>
					</MkSwitch>
					<hr>
					<MkInput v-model="form.state.agentProactiveMinSilenceMinutes" type="text">
						<template #label>最小静默时间（分钟）</template>
						<template #caption>助手回复后至少等待多久才可能发送随机主动消息，范围 5–1440</template>
					</MkInput>
					<MkInput v-model="form.state.agentProactiveMaxWindowMinutes" type="text">
						<template #label>最大等待窗口（分钟）</template>
						<template #caption>从最小静默时间起，在多大的时间窗口内随机选取发送时刻，范围 30–10080（7 天）</template>
					</MkInput>
					<MkInput v-model="form.state.agentProactiveDaytimeWeight" type="text">
						<template #label>白天权重倍率</template>
						<template #caption>北京时间 08:00–22:00 时段被选中的权重相对于夜间的倍数，范围 1–10</template>
					</MkInput>
					<MkInput v-model="form.state.agentProactiveRecencyBias" type="text">
						<template #label>近期偏好系数</template>
						<template #caption>取值 1–10。1 = 窗口内均匀分布；值越大越偏向近期时间点发送</template>
					</MkInput>
					<MkInput v-model="form.state.agentProactiveMaxChainLength" type="text">
						<template #label>最大连续主动次数</template>
						<template #caption>限制用户在单个会话中可设置的连续主动消息次数，范围 1–100，默认 7</template>
					</MkInput>
				</div>
			</MkFolder>

			<div v-if="form.modified.value && ['basic', 'models', 'memory', 'compression', 'externalAudit', 'images', 'sticker', 'pet', 'vision', 'credits', 'proactive'].includes(activeTab)" :class="$style.saveBar">
				<MkFormFooter :form="form"/>
			</div>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import type { MkSelectItem } from '@/components/MkSelect.vue';
import type { MenuItem } from '@/types/menu.js';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkFormFooter from '@/components/MkFormFooter.vue';
import MkButton from '@/components/MkButton.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import MkUserName from '@/components/global/MkUserName.vue';
import MkAcct from '@/components/global/MkAcct.vue';
import MkA from '@/components/global/MkA.vue';
import FormSplit from '@/components/form/split.vue';
import MkTabs from '@/components/MkTabs.vue';
import XCheckinReports from './agents-checkin-reports.vue';
import XModelReports from './agents-model-reports.vue';
import * as os from '@/os.js';
import { misskeyApi, formatApiError } from '@/utility/misskey-api.js';
import { fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { useForm } from '@/composables/use-form.js';
import { genId } from '@/utility/id.js';
import { useRouter } from '@/router.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import { selectFile } from '@/utility/drive.js';
import { formatDateTimeString } from '@/utility/format-time-string.js';

const router = useRouter();
const activeTab = ref('overview');

const meta = await misskeyApi('admin/meta') as Record<string, unknown>;

type RedeemCodeRow = {
	id: string;
	createdAt: string;
	code: string;
	creditAmount: number;
	note: string;
	expiresAt: string | null;
	redeemedAt: string | null;
	redeemedBy: any | null;
	revoked: boolean;
	status: 'available' | 'redeemed' | 'expired' | 'revoked';
};

// 总览页 24h 小卡片仅需整体统计，完整报表见 agents-model-reports.vue
type ReportsOverview = {
	overall: { total: number; success: number };
};

type AgentLlmModelRow = {
	id: string;
	name: string;
	description: string;
	baseUrl: string;
	apiKeys: string[];
	multiKeyEnabled: boolean;
	apiModelName: string;
	maxContextTokens: string;
	maxOutputTokensPerCall: string;
	unlisted: boolean;
	/** 所属模型分组 id；'' 表示无分组 */
	groupId: string;
	costPerCall: string;
	/** 计费方式：per_call 按次；usage 按量（token 单价） */
	billingMode: 'per_call' | 'usage';
	pricePerMillionInputCacheHitTokens: string;
	pricePerMillionInputCacheMissTokens: string;
	pricePerMillionOutputTokens: string;
	/** 高峰时段价格倍率（留空/1 不启用） */
	peakPriceMultiplier: string;
	charsPerToken: string;
	tokenizerEncoding: string;
	dailyFreeQuota: string;
};

type AgentLlmModelGroupRow = {
	id: string;
	name: string;
};

type AgentImageTokenRow = {
	id: string;
	token: string;
	name: string;
	enabled: boolean;
	sortOrder: string;
	points: string;
	lastUsedAt: string;
	lastCheckedAt: string;
	lastError: string;
};

type AgentImageModelRow = {
	id: string;
	name: string;
	description: string;
	/** 保留 meta 中的原始字符串：未知提供商（如新版后端先发布）不回退改写，保存时显式校验 */
	provider: string;
	enabled: boolean;
	apiModelName: string;
	apiUrl: string;
	apiKey: string;
	supportsReferenceImage: boolean;
	costPerCall: string;
	dailyFreeQuota: string;
	defaultArtistPresetId: string;
	steps: string;
	scale: string;
	cfgRescale: string;
	sampler: string;
	noiseSchedule: string;
	promptPrefix: string;
	promptSuffix: string;
};

type AgentImageArtistPresetRow = {
	id: string;
	name: string;
	promptPrefix: string;
	promptSuffix: string;
	negativePrompt: string;
	thumbnailUrl: string;
};

type AgentVisionModelRow = { id: string; name: string; enabled: boolean; apiUrl: string; apiKey: string; apiModelName: string; costPerCall: string };

type AgentExternalAuditModelRow = {
	id: string;
	name: string;
	provider: string;
	baseUrl: string;
	apiKey: string;
	apiModelName: string;
	priority: string;
	enabled: boolean;
	autoDisabledAt: string;
	autoDisabledReason: string;
	lastError: string;
};

type AgentExternalAuditRuleRow = {
	id: string;
	name: string;
	reason: string;
	criteria: string;
	enabled: boolean;
};

type AgentExternalAuditOtherRuleRow = {
	reason: string;
	criteria: string;
};

type AgentExternalAuditModelStat = {
	id: string;
	name: string;
	enabled: boolean;
	autoDisabledAt: string | null;
	autoDisabledReason: string | null;
	total: number;
	allow: number;
	block: number;
	failed: number;
	/** 请求阶段失败数（URL 非法/超时/网络错误/HTTP 错误/响应体非 JSON） */
	apiFailed: number;
	/** 回复解析失败数（回复内容缺失或无法解析为结构化审核结论） */
	parseFailed: number;
	failureRate: number;
};

type AgentExternalAuditFailureRow = {
	id: string;
	createdAt: string;
	durationMs: number | null;
	modelId: string | null;
	modelName: string | null;
	failureKind: 'api' | 'parse' | null;
	errorCode: string | null;
	errorMessage: string | null;
	responseText: string | null;
};

type AgentByokProviderRow = {
	id: string;
	name: string;
	description: string;
	baseUrl: string;
	apiModelName: string;
	maxContextTokens: string;
	maxOutputTokensPerCall: string;
	tokenizerEncoding: string;
	charsPerToken: string;
};

type AgentReviewTriggerRule = {
	id: string;
	timeWindowMinutes: string;
	blockThreshold: string;
	enabled: boolean;
};

const agentImageProviderItems: MkSelectItem[] = [
	{ value: 'aurora', label: 'Aurora / Naval AI' },
	{ value: 'openai', label: i18n.ts._agents.imageProviderOpenai },
	{ value: 'tiptotip', label: i18n.ts._agents.imageProviderTiptotip },
	{ value: 'qwen', label: i18n.ts._agents.imageProviderQwen },
	{ value: 'sensenova', label: i18n.ts._agents.imageProviderSenseNova },
];

const agentImageProviderValues = new Set(agentImageProviderItems.flatMap(item => 'value' in item ? [item.value] : []));

const billingModeItems: MkSelectItem[] = [
	{ value: 'per_call', label: i18n.ts._agents.billingModePerCall },
	{ value: 'usage', label: i18n.ts._agents.billingModeUsage },
];

const tokenizerEncodingItems: MkSelectItem[] = [
	{ value: '', label: '不使用（字符估算）' },
	{ value: 'cl100k_base', label: 'cl100k_base（GPT-4 / GPT-3.5-turbo）' },
	{ value: 'o200k_base', label: 'o200k_base（GPT-4o / GPT-4o-mini）' },
	{ value: 'p50k_base', label: 'p50k_base（text-davinci-003）' },
	{ value: 'r50k_base', label: 'r50k_base（text-davinci-002）' },
	{ value: 'gpt2', label: 'gpt2（GPT-2）' },
	{ value: 'gemini:gemini-3-pro-preview', label: 'Gemini 3' },
	{ value: 'gemini:gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
	{ value: 'gemini:gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
	{ value: 'gemini:gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
	{ value: 'gemini:gemini-2.0-flash-001', label: 'Gemini 2.0 Flash' },
	{ value: 'gemini:gemini-2.0-flash-lite-001', label: 'Gemini 2.0 Flash Lite' },
	{ value: 'glm:glm-5.5', label: 'GLM-5.5（智谱，真分词器）' },
	{ value: 'glm:glm-5.2', label: 'GLM-5.2（智谱，真分词器）' },
	{ value: 'glm:glm-4.7', label: 'GLM-4.7（智谱，真分词器）' },
	{ value: 'glm:glm-4.5', label: 'GLM-4.5（智谱，真分词器）' },
	{ value: 'glm:glm-4-plus', label: 'GLM-4 Plus（智谱，真分词器）' },
	{ value: 'glm:glm-4-flash', label: 'GLM-4 Flash（智谱，真分词器）' },
	{ value: 'deepseek:deepseek-v4-pro', label: 'DeepSeek-V4 Pro（真分词器）' },
	{ value: 'deepseek:deepseek-v4-flash', label: 'DeepSeek-V4 Flash（真分词器）' },
	{ value: 'deepseek:deepseek-v3', label: 'DeepSeek-V3（真分词器）' },
	{ value: 'deepseek:deepseek-r1', label: 'DeepSeek-R1（真分词器）' },
	{ value: 'claude:claude-fable-5', label: 'Claude Fable 5（兼容近似）' },
	{ value: 'claude:claude-opus-4-8', label: 'Claude Opus 4.8（兼容近似）' },
	{ value: 'claude:claude-opus-4-7', label: 'Claude Opus 4.7（兼容近似）' },
	{ value: 'claude:claude-sonnet-4-5', label: 'Claude Sonnet 4.5（兼容近似）' },
];

const charsPerTokenItems: MkSelectItem[] = [
	{ value: '', label: '默认（3 字符/token）' },
	{ value: '2', label: '2（英文为主）' },
	{ value: '3', label: '3（中英混合）' },
	{ value: '4', label: '4（中文为主）' },
	{ value: '6', label: '6（代码/日文）' },
];

function numFromMeta(v: unknown, fallback: number): number {
	if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
	const n = Number(v);
	return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function ratioFromMeta(v: unknown, fallback: number): string {
	if (v == null) return String(fallback);
	if (typeof v === 'number' && Number.isFinite(v)) return String(v);
	const n = Number(v);
	return Number.isFinite(n) ? String(n) : String(fallback);
}

function initAgentLlmModelRows(): AgentLlmModelRow[] {
	const raw = meta.agentLlmModels;
	if (raw == null || !Array.isArray(raw) || raw.length === 0) return [];
	const rows: AgentLlmModelRow[] = [];
	for (const item of raw) {
		if (typeof item !== 'object' || item == null) continue;
		const o = item as Record<string, unknown>;
		const idRaw = typeof o.id === 'string' ? o.id.trim() : '';
		const name = typeof o.name === 'string' ? o.name : '';
		const apiModelName = typeof o.apiModelName === 'string' ? o.apiModelName : '';
		if (!name.trim() || !apiModelName.trim()) continue;
		let description = '';
		if (typeof o.description === 'string') description = o.description;
		const apiKeys = Array.isArray(o.apiKeys)
			? o.apiKeys.filter((key): key is string => typeof key === 'string')
			: [];
		const legacyApiKey = typeof o.apiKey === 'string' ? o.apiKey : '';
		if (apiKeys.length === 0) apiKeys.push(legacyApiKey);
		rows.push({
			id: idRaw || genId(),
			name,
			description,
			baseUrl: typeof o.baseUrl === 'string' ? o.baseUrl : '',
			apiKeys,
			multiKeyEnabled: o.multiKeyEnabled === true,
			apiModelName,
			maxContextTokens: String(numFromMeta(o.maxContextTokens, 8192)),
			maxOutputTokensPerCall: String(numFromMeta(o.maxOutputTokensPerCall, 2048)),
			unlisted: o.unlisted === true,
			groupId: typeof o.groupId === 'string' ? o.groupId.trim() : '',
			costPerCall: typeof o.costPerCall === 'number' && Number.isFinite(o.costPerCall) ? String(o.costPerCall) : '0',
			billingMode: o.billingMode === 'usage' ? 'usage' : 'per_call',
			pricePerMillionInputCacheHitTokens: typeof o.pricePerMillionInputCacheHitTokens === 'number' && Number.isFinite(o.pricePerMillionInputCacheHitTokens) ? String(o.pricePerMillionInputCacheHitTokens) : '',
			pricePerMillionInputCacheMissTokens: typeof o.pricePerMillionInputCacheMissTokens === 'number' && Number.isFinite(o.pricePerMillionInputCacheMissTokens) ? String(o.pricePerMillionInputCacheMissTokens) : '',
			pricePerMillionOutputTokens: typeof o.pricePerMillionOutputTokens === 'number' && Number.isFinite(o.pricePerMillionOutputTokens) ? String(o.pricePerMillionOutputTokens) : '',
			peakPriceMultiplier: typeof o.peakPriceMultiplier === 'number' && Number.isFinite(o.peakPriceMultiplier) ? String(o.peakPriceMultiplier) : '',
			charsPerToken: typeof o.charsPerToken === 'number' && Number.isFinite(o.charsPerToken) ? String(o.charsPerToken) : '',
			tokenizerEncoding: typeof o.tokenizerEncoding === 'string' ? o.tokenizerEncoding : '',
			dailyFreeQuota: typeof o.dailyFreeQuota === 'number' && Number.isFinite(o.dailyFreeQuota) ? String(o.dailyFreeQuota) : '0',
		});
	}
	return rows;
}

function rowIsBlank(row: AgentLlmModelRow): boolean {
	return !row.name.trim() && !row.description.trim() && !row.baseUrl.trim()
		&& !row.apiKeys.some(key => key.trim() !== '') && !row.apiModelName.trim();
}

function initAgentLlmModelGroupRows(): AgentLlmModelGroupRow[] {
	const raw = (meta as Record<string, unknown>).agentLlmModelGroups;
	if (raw == null || !Array.isArray(raw)) return [];
	const rows: AgentLlmModelGroupRow[] = [];
	for (const item of raw) {
		if (typeof item !== 'object' || item == null) continue;
		const o = item as Record<string, unknown>;
		const id = typeof o.id === 'string' ? o.id.trim() : '';
		const name = typeof o.name === 'string' ? o.name.trim() : '';
		if (!id || !name) continue;
		rows.push({ id, name });
	}
	return rows;
}

function initAgentByokProviderRows(): AgentByokProviderRow[] {
	const raw = meta.agentByokProviders;
	if (raw == null || !Array.isArray(raw) || raw.length === 0) return [];
	return raw.map(item => {
		const o = (item && typeof item === 'object') ? item as Record<string, unknown> : {};
		return {
			id: typeof o.id === 'string' && o.id.trim() ? o.id.trim() : genId(),
			name: typeof o.name === 'string' ? o.name : '',
			description: typeof o.description === 'string' ? o.description : '',
			baseUrl: typeof o.baseUrl === 'string' ? o.baseUrl : '',
			apiModelName: typeof o.apiModelName === 'string' ? o.apiModelName : '',
			maxContextTokens: String(numFromMeta(o.maxContextTokens, 8192)),
			maxOutputTokensPerCall: String(numFromMeta(o.maxOutputTokensPerCall, 2048)),
			tokenizerEncoding: typeof o.tokenizerEncoding === 'string' ? o.tokenizerEncoding : '',
			charsPerToken: typeof o.charsPerToken === 'number' && Number.isFinite(o.charsPerToken) ? String(o.charsPerToken) : '',
		};
	});
}

function initAgentImageTokenRows(): AgentImageTokenRow[] {
	const raw = meta.agentImageTokens;
	if (!Array.isArray(raw)) return [];
	return raw.map((item, i) => {
		const o = (item && typeof item === 'object') ? item as Record<string, unknown> : {};
		return {
			id: typeof o.id === 'string' && o.id ? o.id : genId(),
			token: typeof o.token === 'string' ? o.token : '',
			name: typeof o.name === 'string' ? o.name : '',
			enabled: o.enabled !== false,
			sortOrder: String(numFromMeta(o.sortOrder, i)),
			points: typeof o.points === 'number' ? String(o.points) : '',
			lastUsedAt: typeof o.lastUsedAt === 'string' ? o.lastUsedAt : '',
			lastCheckedAt: typeof o.lastCheckedAt === 'string' ? o.lastCheckedAt : '',
			lastError: typeof o.lastError === 'string' ? o.lastError : '',
		};
	});
}

function initAgentImageModelRows(): AgentImageModelRow[] {
	const raw = meta.agentImageModels;
	if (!Array.isArray(raw)) return [];
	return raw.map((item) => {
		const o = (item && typeof item === 'object') ? item as Record<string, unknown> : {};
		const p = (o.defaultParams && typeof o.defaultParams === 'object') ? o.defaultParams as Record<string, unknown> : {};
		return {
			id: typeof o.id === 'string' && o.id ? o.id : genId(),
			name: typeof o.name === 'string' ? o.name : '',
			description: typeof o.description === 'string' ? o.description : '',
			provider: typeof o.provider === 'string' && o.provider !== '' ? o.provider : 'aurora',
			enabled: o.enabled !== false,
			apiModelName: typeof o.apiModelName === 'string' ? o.apiModelName : '',
			apiUrl: typeof o.apiUrl === 'string' ? o.apiUrl : '',
			apiKey: typeof o.apiKey === 'string' ? o.apiKey : '',
			supportsReferenceImage: (o.provider === 'openai' || o.provider === 'tiptotip' || o.provider === 'sensenova') && o.supportsReferenceImage === true,
			costPerCall: typeof o.costPerCall === 'number' ? String(o.costPerCall) : '',
			dailyFreeQuota: typeof o.dailyFreeQuota === 'number' ? String(o.dailyFreeQuota) : '0',
			defaultArtistPresetId: typeof o.defaultArtistPresetId === 'string' ? o.defaultArtistPresetId : '',
			steps: String(numFromMeta(p.steps, 28)),
			scale: typeof p.scale === 'number' ? String(p.scale) : '5',
			cfgRescale: typeof p.cfgRescale === 'number' ? String(p.cfgRescale) : '0',
			sampler: typeof p.sampler === 'string' ? p.sampler : 'k_euler_ancestral',
			noiseSchedule: typeof p.noiseSchedule === 'string' ? p.noiseSchedule : 'karras',
			promptPrefix: typeof p.promptPrefix === 'string' ? p.promptPrefix : '',
			promptSuffix: typeof p.promptSuffix === 'string' ? p.promptSuffix : 'masterpiece,best quality,very aesthetic,highres,absurdres',
		};
	});
}

function initAgentImageArtistPresetRows(): AgentImageArtistPresetRow[] {
	const configured = Array.isArray(meta.agentImageArtistPresets) ? meta.agentImageArtistPresets : [];
	const resolved = Array.isArray(meta.agentImageArtistPresetsResolved) ? meta.agentImageArtistPresetsResolved : [];
	const raw = configured.length > 0 ? configured : resolved;
	return raw.map((item) => {
		const o = (item && typeof item === 'object') ? item as Record<string, unknown> : {};
		return {
			id: typeof o.id === 'string' && o.id.trim() !== '' ? o.id.trim() : genId(),
			name: typeof o.name === 'string' ? o.name : '',
			promptPrefix: typeof o.promptPrefix === 'string' ? o.promptPrefix : '',
			promptSuffix: typeof o.promptSuffix === 'string' ? o.promptSuffix : '',
			negativePrompt: typeof o.negativePrompt === 'string' ? o.negativePrompt : '',
			thumbnailUrl: typeof o.thumbnailUrl === 'string' ? o.thumbnailUrl : '',
		};
	});
}

function initAgentVisionModelRows(): AgentVisionModelRow[] {
	const raw = meta.agentVisionModels;
	if (!Array.isArray(raw)) return [];
	return raw.map(item => {
		const o = item && typeof item === 'object' ? item as Record<string, unknown> : {};
		return { id: typeof o.id === 'string' && o.id ? o.id : genId(), name: typeof o.name === 'string' ? o.name : '', enabled: o.enabled !== false, apiUrl: typeof o.apiUrl === 'string' ? o.apiUrl : '', apiKey: typeof o.apiKey === 'string' ? o.apiKey : '', apiModelName: typeof o.apiModelName === 'string' ? o.apiModelName : '', costPerCall: typeof o.costPerCall === 'number' ? String(o.costPerCall) : '0' };
	});
}

function initAgentExternalAuditModelRows(): AgentExternalAuditModelRow[] {
	const raw = meta.agentExternalAuditModels;
	if (!Array.isArray(raw)) return [];
	return raw.map((item, i) => {
		const o = (item && typeof item === 'object') ? item as Record<string, unknown> : {};
		return {
			id: typeof o.id === 'string' && o.id ? o.id : genId(),
			name: typeof o.name === 'string' ? o.name : '',
				provider: typeof o.provider === 'string' && o.provider !== '' ? o.provider : 'openai',
			baseUrl: typeof o.baseUrl === 'string' ? o.baseUrl : '',
			apiKey: typeof o.apiKey === 'string' ? o.apiKey : '',
			apiModelName: typeof o.apiModelName === 'string' ? o.apiModelName : '',
			priority: String(numFromMeta(o.priority, i)),
			enabled: o.enabled !== false,
			autoDisabledAt: typeof o.autoDisabledAt === 'string' ? o.autoDisabledAt : '',
			autoDisabledReason: typeof o.autoDisabledReason === 'string' ? o.autoDisabledReason : '',
			lastError: typeof o.lastError === 'string' ? o.lastError : '',
		};
	});
}

function parseExternalAuditRuleRows(value: unknown): AgentExternalAuditRuleRow[] {
	if (!Array.isArray(value)) return [];
	return value.map(item => {
		const o = item && typeof item === 'object' ? item as Record<string, unknown> : {};
		return {
			id: typeof o.id === 'string' ? o.id : '',
			name: typeof o.name === 'string' ? o.name : '',
			reason: typeof o.reason === 'string' ? o.reason : '',
			criteria: typeof o.criteria === 'string' ? o.criteria : '',
			enabled: o.enabled !== false,
		};
	});
}

function initAgentExternalAuditRuleRows(): AgentExternalAuditRuleRow[] {
	return parseExternalAuditRuleRows(meta.agentExternalAuditRules);
}

function initAgentExternalAuditOtherRule(): AgentExternalAuditOtherRuleRow {
	const value = meta.agentExternalAuditOtherRule;
	const o = value && typeof value === 'object' ? value as Record<string, unknown> : {};
	return {
		reason: typeof o.reason === 'string' ? o.reason : '',
		criteria: typeof o.criteria === 'string' ? o.criteria : '',
	};
}

function initAgentReviewTriggerRules(): AgentReviewTriggerRule[] {
	const raw = meta.agentReviewTriggerRules;
	if (!Array.isArray(raw)) return [];
	return raw.map((item) => {
		const o = (item && typeof item === 'object') ? item as Record<string, unknown> : {};
		return {
			id: typeof o.id === 'string' && o.id ? o.id : genId(),
			timeWindowMinutes: String(numFromMeta(o.timeWindowMinutes, 60)),
			blockThreshold: String(numFromMeta(o.blockThreshold, 5)),
			enabled: o.enabled !== false,
		};
	});
}

function imageParamsFromMeta(): Record<string, unknown> {
	return (meta.agentImageDefaultParams && typeof meta.agentImageDefaultParams === 'object')
		? meta.agentImageDefaultParams as Record<string, unknown>
		: {};
}

const imageParams = imageParamsFromMeta();

const form = useForm({
	agentFeatureEnabled: Boolean(meta.agentFeatureEnabled),
	agentGlobalSystemPrompt: typeof meta.agentGlobalSystemPrompt === 'string' ? meta.agentGlobalSystemPrompt : '',
	agentLlmModelRows: initAgentLlmModelRows(),
	agentLlmModelGroupRows: initAgentLlmModelGroupRows(),
	agentDefaultModelId: typeof meta.agentDefaultModelId === 'string' ? meta.agentDefaultModelId : '',
	agentByokEnabled: Boolean(meta.agentByokEnabled),
	agentByokProviderRows: initAgentByokProviderRows(),
	agentByokMaxUserModels: String(numFromMeta(meta.agentByokMaxUserModels, 20)),
	agentMem0Enabled: Boolean(meta.agentMem0Enabled),
	agentMem0ApiKey: typeof meta.agentMem0ApiKey === 'string' ? meta.agentMem0ApiKey : '',
	agentMem0ApiBaseUrl: typeof meta.agentMem0ApiBaseUrl === 'string' ? meta.agentMem0ApiBaseUrl : '',
	agentMem0OrgId: typeof meta.agentMem0OrgId === 'string' ? meta.agentMem0OrgId : '',
	agentMem0TopK: String(numFromMeta(meta.agentMem0TopK, 8)),
	agentMem0InjectMaxChars: String(numFromMeta(meta.agentMem0InjectMaxChars, 4000)),
	agentMem0AddMemoryMaxRounds: String(numFromMeta(meta.agentMem0AddMemoryMaxRounds, 3)),
	agentMem0AddMemoryEveryNRounds: String(numFromMeta(meta.agentMem0AddMemoryEveryNRounds, 1)),
	agentCompressionSystemPrompt: typeof meta.agentCompressionSystemPrompt === 'string' ? meta.agentCompressionSystemPrompt : '',
	agentCompressionMaxInputChars: String(numFromMeta(meta.agentCompressionMaxInputChars, 12000)),
	agentCompressionMaxOutputTokens: String(numFromMeta(meta.agentCompressionMaxOutputTokens, 2048)),
	agentCompressionBandT1Ratio: ratioFromMeta((meta as Record<string, unknown>).agentCompressionBandT1Ratio, 0.8),
	agentCompressionBandT2Ratio: ratioFromMeta((meta as Record<string, unknown>).agentCompressionBandT2Ratio, 0.9),
	agentCompressionDefaultModelId: typeof (meta as Record<string, unknown>).agentCompressionDefaultModelId === 'string'
		? String((meta as Record<string, unknown>).agentCompressionDefaultModelId)
		: '',
	agentImageGenerationEnabled: Boolean(meta.agentImageGenerationEnabled),
	agentImageBaseUrl: typeof meta.agentImageBaseUrl === 'string' ? meta.agentImageBaseUrl : 'https://love.auroralove.cc',
	agentImageTokenRows: initAgentImageTokenRows(),
	agentImageModelRows: initAgentImageModelRows(),
	agentImageArtistPresetRows: initAgentImageArtistPresetRows(),
	agentImageDefaultModel: typeof meta.agentImageDefaultModel === 'string' ? meta.agentImageDefaultModel : 'nai-diffusion-4-5-full',
	agentImageDefaultArtistPresetId: typeof meta.agentImageDefaultArtistPresetId === 'string' ? meta.agentImageDefaultArtistPresetId : '',
	agentImageDefaultNegativePrompt: typeof meta.agentImageDefaultNegativePrompt === 'string' ? meta.agentImageDefaultNegativePrompt : (typeof meta.agentImageDefaultNegativePromptResolved === 'string' ? meta.agentImageDefaultNegativePromptResolved : ''),
	agentImageMaxPerReply: String(numFromMeta(meta.agentImageMaxPerReply, 2)),
	agentStickerEnabled: Boolean(meta.agentStickerEnabled),
	agentStickerMaxPerMessage: String(numFromMeta(meta.agentStickerMaxPerMessage, 3)),
	agentEmojiPromptMaxCount: String(numFromMeta(meta.agentEmojiPromptMaxCount, 200)),
	agentPerformanceEnabled: meta.agentPerformanceEnabled !== false,
	agentPerformanceSystemPrompt: typeof meta.agentPerformanceSystemPrompt === 'string' ? meta.agentPerformanceSystemPrompt : '',
	agentImageCostPerCall: typeof meta.agentImageCostPerCall === 'number' ? String(meta.agentImageCostPerCall) : '0',
	agentImageTokenMinPoints: String(numFromMeta(meta.agentImageTokenMinPoints, 1)),
	agentImageTokenBalanceTtlSeconds: String(numFromMeta(meta.agentImageTokenBalanceTtlSeconds, 300)),
	agentImageSteps: String(numFromMeta(imageParams.steps, 28)),
	agentImageScale: typeof imageParams.scale === 'number' ? String(imageParams.scale) : '5',
	agentImageCfgRescale: typeof imageParams.cfgRescale === 'number' ? String(imageParams.cfgRescale) : '0',
	agentImageSampler: typeof imageParams.sampler === 'string' ? imageParams.sampler : 'k_euler_ancestral',
	agentImageNoiseSchedule: typeof imageParams.noiseSchedule === 'string' ? imageParams.noiseSchedule : 'karras',
	agentImagePromptPrefix: typeof imageParams.promptPrefix === 'string' ? imageParams.promptPrefix : '',
	agentImagePromptSuffix: typeof imageParams.promptSuffix === 'string' ? imageParams.promptSuffix : 'masterpiece,best quality,very aesthetic,highres,absurdres',
	agentVisionModelRows: initAgentVisionModelRows(),
	agentVisionDefaultModelId: typeof meta.agentVisionDefaultModelId === 'string' ? meta.agentVisionDefaultModelId : '',
	agentExternalAuditEnabled: Boolean(meta.agentExternalAuditEnabled),
	agentExternalAuditModelRows: initAgentExternalAuditModelRows(),
	agentExternalAuditTimeoutMs: String(numFromMeta(meta.agentExternalAuditTimeoutMs, 10000)),
	agentExternalAuditFailureThresholdPercent: String(numFromMeta(meta.agentExternalAuditFailureThresholdPercent, 60)),
	agentExternalAuditFailureMinRequests: String(numFromMeta(meta.agentExternalAuditFailureMinRequests, 10)),
	agentExternalAuditNotifyEmails: typeof meta.agentExternalAuditNotifyEmails === 'string' ? meta.agentExternalAuditNotifyEmails : '',
		agentExternalAuditSystemPrompt: typeof meta.agentExternalAuditSystemPrompt === 'string'
			? meta.agentExternalAuditSystemPrompt
			: (typeof meta.agentExternalAuditSystemPromptResolved === 'string' ? meta.agentExternalAuditSystemPromptResolved : ''),
		agentExternalAuditRuleRows: initAgentExternalAuditRuleRows(),
		agentExternalAuditOtherRule: initAgentExternalAuditOtherRule(),
		agentReviewTriggerRules: initAgentReviewTriggerRules(),
	checkinEnabled: Boolean((meta as any).agentCheckinSettings?.enabled ?? true),
	checkinStreakMaxDays: String((meta as any).agentCheckinSettings?.streakMaxDays ?? 365),
	checkinStreakMaxMultiplier: String((meta as any).agentCheckinSettings?.streakMaxMultiplier ?? 2.0),
	checkinSpecialDayMultiplier: String((meta as any).agentCheckinSettings?.specialDayMultiplier ?? 2.0),
	checkinSpecialDays: Array.isArray((meta as any).agentCheckinSettings?.specialDays) ? ((meta as any).agentCheckinSettings.specialDays as string[]).join(',') : '01-01,02-14,05-01,10-01,12-25',
	checkinMakeupEnabled: Boolean((meta as any).agentCheckinSettings?.makeupEnabled ?? true),
	checkinMakeupMaxPerMonth: String((meta as any).agentCheckinSettings?.makeupMaxPerMonth ?? 3),
	checkinMakeupBaseCost: String((meta as any).agentCheckinSettings?.makeupBaseCost ?? 20),
	checkinMakeupCostIncrement: String((meta as any).agentCheckinSettings?.makeupCostIncrement ?? 10),
	checkinMakeupAllowedWindowDays: String((meta as any).agentCheckinSettings?.makeupAllowedWindowDays ?? 7),
	agentRedeemPurchaseUrl: typeof meta.agentRedeemPurchaseUrl === 'string' ? meta.agentRedeemPurchaseUrl : '',
	agentAliyaCharacterId: typeof (meta as any).agentAliyaCharacterId === 'string' ? (meta as any).agentAliyaCharacterId : '',
	agentAliyaWebUrl: typeof (meta as any).agentAliyaWebUrl === 'string' ? (meta as any).agentAliyaWebUrl : '',
	agentProactiveRandomDefaultEnabled: Boolean(meta.agentProactiveRandomDefaultEnabled ?? false),
	agentProactiveScheduledDefaultEnabled: Boolean(meta.agentProactiveScheduledDefaultEnabled ?? false),
	agentProactiveMinSilenceMinutes: String(numFromMeta(meta.agentProactiveMinSilenceMinutes, 30)),
	agentProactiveMaxWindowMinutes: String(numFromMeta(meta.agentProactiveMaxWindowMinutes, 1410)),
	agentProactiveDaytimeWeight: String(numFromMeta(meta.agentProactiveDaytimeWeight, 3)),
	agentProactiveRecencyBias: String(numFromMeta(meta.agentProactiveRecencyBias, 1)),
	agentProactiveMaxChainLength: String(numFromMeta(meta.agentProactiveMaxChainLength, 7)),
}, async (state) => {
	type Normalized = {
		id: string;
		name: string;
		description: string | null;
		baseUrl: string;
		apiKey: string;
		apiKeys: string[];
		multiKeyEnabled: boolean;
		apiModelName: string;
		maxContextTokens: number;
		maxOutputTokensPerCall: number;
		unlisted: boolean;
		groupId: string | null;
		costPerCall: number;
		billingMode: 'per_call' | 'usage';
		pricePerMillionInputCacheHitTokens: number;
		pricePerMillionInputCacheMissTokens: number;
		pricePerMillionOutputTokens: number;
		peakPriceMultiplier?: number;
		charsPerToken?: number;
		tokenizerEncoding?: string;
		dailyFreeQuota?: number;
	};
	const normalized: Normalized[] = [];
	const seen = new Set<string>();
	for (const row of state.agentLlmModelRows) {
		if (rowIsBlank(row)) continue;
		let id = row.id.trim();
		if (!id) {
			id = genId();
			row.id = id;
		}
		const name = row.name.trim();
		const baseUrl = row.baseUrl.trim();
		const apiKeys = [...new Set(row.apiKeys.map(key => key.trim()).filter(key => key !== ''))];
		const apiKey = apiKeys[0] ?? '';
		const apiModelName = row.apiModelName.trim();
		const descRaw = row.description.trim();
		const maxCtx = Math.trunc(Number(row.maxContextTokens));
		const maxOut = Math.trunc(Number(row.maxOutputTokensPerCall));
		if (!name || !baseUrl || !apiKey || !apiModelName) {
			os.alert({ type: 'error', text: i18n.ts._agents.agentLlmModelsRowIncomplete });
			throw new Error('incomplete model row');
		}
		if (seen.has(id)) {
			os.alert({ type: 'error', text: i18n.ts._agents.agentLlmModelsDuplicateId });
			throw new Error('duplicate model id');
		}
		seen.add(id);
		if (!Number.isFinite(maxCtx) || maxCtx < 256 || maxCtx > 2_000_000) {
			os.alert({ type: 'error', text: i18n.ts._agents.agentLlmModelsInvalidContext });
			throw new Error('invalid context');
		}
		if (!Number.isFinite(maxOut) || maxOut < 1 || maxOut > 128_000) {
			os.alert({ type: 'error', text: i18n.ts._agents.agentLlmModelsInvalidOutput });
			throw new Error('invalid output');
		}
		const costRaw = row.costPerCall.trim();
		const cost = costRaw === '' ? 0 : Number(costRaw);
		if (!Number.isFinite(cost) || cost < 0 || cost > 1_000_000) {
			os.alert({ type: 'error', text: i18n.ts._agents.agentLlmModelsInvalidCost });
			throw new Error('invalid cost');
		}
		const parseMillionTokenPrice = (raw: string, label: string): number => {
			const t = raw.trim();
			const v = t === '' ? 0 : Number(t);
			if (!Number.isFinite(v) || v < 0 || v > 1_000_000) {
				os.alert({ type: 'error', text: i18n.tsx._agents.adminMillionTokenPriceInvalid({ name, label }) });
				throw new Error('invalid million token price');
			}
			return v;
		};
		const parsePeakMultiplier = (raw: string): number | undefined => {
			const t = raw.trim();
			if (t === '') return undefined;
			const v = Number(t);
			if (!Number.isFinite(v) || v < 1 || v > 10) {
				os.alert({ type: 'error', text: i18n.tsx._agents.billingPeakMultiplierInvalid({ name }) });
				throw new Error('invalid peak price multiplier');
			}
			return v <= 1 ? undefined : v;
		};
		normalized.push({
			id,
			name,
			description: descRaw === '' ? null : descRaw,
			baseUrl,
			apiKey,
			apiKeys,
			multiKeyEnabled: row.multiKeyEnabled,
			apiModelName,
			maxContextTokens: maxCtx,
			maxOutputTokensPerCall: maxOut,
			unlisted: row.unlisted === true,
			groupId: row.groupId.trim() === '' ? null : row.groupId.trim(),
			costPerCall: cost,
			billingMode: row.billingMode === 'usage' ? 'usage' : 'per_call',
			pricePerMillionInputCacheHitTokens: parseMillionTokenPrice(row.pricePerMillionInputCacheHitTokens, i18n.ts._agents.billingInputCacheHit),
			pricePerMillionInputCacheMissTokens: parseMillionTokenPrice(row.pricePerMillionInputCacheMissTokens, i18n.ts._agents.billingInputCacheMiss),
			pricePerMillionOutputTokens: parseMillionTokenPrice(row.pricePerMillionOutputTokens, i18n.ts._agents.billingOutput),
			peakPriceMultiplier: parsePeakMultiplier(row.peakPriceMultiplier),
			charsPerToken: row.charsPerToken.trim() !== '' ? Number(row.charsPerToken) : undefined,
			tokenizerEncoding: row.tokenizerEncoding.trim() !== '' ? row.tokenizerEncoding.trim() : undefined,
			dailyFreeQuota: row.dailyFreeQuota.trim() !== '' && Number(row.dailyFreeQuota) > 0 ? Number(row.dailyFreeQuota) : undefined,
		});
	}
	if (normalized.length === 0) {
		os.alert({ type: 'error', text: i18n.ts._agents.agentLlmModelsNeedOne });
		throw new Error('no models');
	}
	const defTrim = state.agentDefaultModelId.trim();
	if (defTrim !== '' && !normalized.some(m => m.id === defTrim && !m.unlisted)) {
		os.alert({ type: 'error', text: i18n.ts._agents.agentDefaultModelInvalid });
		throw new Error('invalid default model');
	}

	const compDefTrim = state.agentCompressionDefaultModelId.trim();
	if (compDefTrim !== '' && !normalized.some(m => m.id === compDefTrim && !m.unlisted)) {
		os.alert({ type: 'error', text: i18n.ts._agents.agentDefaultModelInvalid });
		throw new Error('invalid compression default model');
	}

	const imageTokens = state.agentImageTokenRows
		.filter(row => row.token.trim() !== '')
		.map((row, i) => ({
			id: row.id || genId(),
			token: row.token.trim(),
			name: row.name.trim() === '' ? null : row.name.trim(),
			enabled: row.enabled,
			sortOrder: Number.isFinite(Number(row.sortOrder)) ? Math.trunc(Number(row.sortOrder)) : i,
			points: row.points === '' ? null : Number(row.points),
			lastUsedAt: row.lastUsedAt || null,
			lastCheckedAt: row.lastCheckedAt || null,
			lastError: row.lastError || null,
		}));
	const imageModels = state.agentImageModelRows
		.filter(row => row.name.trim() !== '' || row.apiModelName.trim() !== '' || row.apiUrl.trim() !== '')
		.map((row) => {
			const steps = Math.trunc(Number(row.steps));
			const scale = Number(row.scale);
			const cfgRescale = Number(row.cfgRescale);
			return {
				id: row.id.trim() || genId(),
				name: row.name.trim(),
				description: row.description.trim() === '' ? null : row.description.trim(),
				// 未识别的 provider 在下方校验循环被拦截，这里必为已知值
				provider: row.provider as 'aurora' | 'openai' | 'tiptotip' | 'qwen' | 'sensenova',
				enabled: row.enabled,
				apiModelName: row.apiModelName.trim() === '' ? null : row.apiModelName.trim(),
				apiUrl: (row.provider === 'openai' || row.provider === 'tiptotip' || row.provider === 'qwen' || row.provider === 'sensenova') && row.apiUrl.trim() !== '' ? row.apiUrl.trim() : null,
				apiKey: (row.provider === 'openai' || row.provider === 'tiptotip' || row.provider === 'qwen' || row.provider === 'sensenova') && row.apiKey.trim() !== '' ? row.apiKey.trim() : null,
				supportsReferenceImage: (row.provider === 'openai' || row.provider === 'tiptotip' || row.provider === 'sensenova') && row.supportsReferenceImage,
				costPerCall: row.costPerCall.trim() === '' ? null : Number(row.costPerCall),
				dailyFreeQuota: row.dailyFreeQuota.trim() !== '' && Number(row.dailyFreeQuota) > 0 ? Number(row.dailyFreeQuota) : null,
				defaultArtistPresetId: row.defaultArtistPresetId.trim() === '' ? null : row.defaultArtistPresetId.trim(),
				defaultParams: row.provider === 'aurora' ? {
					steps,
					scale,
					cfgRescale,
					sampler: row.sampler.trim() || 'k_euler_ancestral',
					noiseSchedule: row.noiseSchedule.trim() || 'karras',
					promptPrefix: row.promptPrefix,
					promptSuffix: row.promptSuffix.trim() || 'masterpiece,best quality,very aesthetic,highres,absurdres',
				} : null,
			};
		});
	for (const row of imageModels) {
		if (!row.id || !row.name || !row.provider) {
			os.alert({ type: 'error', text: i18n.ts._agents.adminImageModelInvalid });
			throw new Error('invalid image model row');
		}
		if (!agentImageProviderValues.has(row.provider)) {
			os.alert({ type: 'error', text: `生图模型「${row.name}」的提供商「${row.provider}」无法识别，请为其重新选择提供商后再保存` });
			throw new Error('unknown image model provider');
		}
		if (row.provider === 'aurora' && !row.apiModelName) {
			os.alert({ type: 'error', text: i18n.ts._agents.adminImageModelInvalid });
			throw new Error('invalid aurora image model api name');
		}
		if (row.provider === 'openai' && (!row.apiModelName || !row.apiUrl || !row.apiKey)) {
			os.alert({ type: 'error', text: i18n.ts._agents.adminOpenaiImageRequired });
			throw new Error('invalid openai image model configuration');
		}
		if (row.provider === 'tiptotip' && (!row.apiModelName || !row.apiUrl || !row.apiKey)) {
			os.alert({ type: 'error', text: i18n.ts._agents.adminOpenaiImageRequired });
			throw new Error('invalid tiptotip image model configuration');
		}
		if (row.provider === 'qwen' && (!row.apiModelName || !row.apiUrl || !row.apiKey)) {
			os.alert({ type: 'error', text: i18n.ts._agents.adminQwenImageRequired });
			throw new Error('invalid qwen image model configuration');
		}
		if (row.provider === 'sensenova' && (!row.apiModelName || !row.apiUrl || !row.apiKey)) {
			os.alert({ type: 'error', text: i18n.ts._agents.adminSenseNovaImageRequired });
			throw new Error('invalid sensenova image model configuration');
		}
		if (row.provider === 'sensenova' && !/\/images\/generations\/?$/.test(row.apiUrl ?? '')) {
			os.alert({ type: 'error', text: i18n.ts._agents.adminSenseNovaImageRequestUrlInvalid });
			throw new Error('invalid sensenova image generations endpoint');
		}
			if (row.costPerCall != null && (!Number.isFinite(row.costPerCall) || row.costPerCall < 0)) {
				os.alert({ type: 'error', text: i18n.ts._agents.adminImageModelInvalid });
				throw new Error('invalid image model cost');
			}
		if (row.provider === 'aurora' && row.defaultParams != null) {
			if (!Number.isFinite(row.defaultParams.steps) || row.defaultParams.steps < 1 || row.defaultParams.steps > 80) {
				os.alert({ type: 'error', text: i18n.ts._agents.adminImageParamsInvalid });
				throw new Error('invalid image model steps');
			}
			if (!Number.isFinite(row.defaultParams.scale) || row.defaultParams.scale < 0 || row.defaultParams.scale > 30) {
				os.alert({ type: 'error', text: i18n.ts._agents.adminImageParamsInvalid });
				throw new Error('invalid image model scale');
			}
			if (!Number.isFinite(row.defaultParams.cfgRescale) || row.defaultParams.cfgRescale < 0 || row.defaultParams.cfgRescale > 1) {
				os.alert({ type: 'error', text: i18n.ts._agents.adminImageParamsInvalid });
				throw new Error('invalid image model cfg rescale');
			}
		}
	}
	const visionModels = state.agentVisionModelRows
		.filter(row => row.name.trim() !== '' || row.apiUrl.trim() !== '' || row.apiModelName.trim() !== '')
		.map(row => ({ id: row.id.trim() || genId(), name: row.name.trim(), enabled: row.enabled, apiUrl: row.apiUrl.trim(), apiKey: row.apiKey.trim(), apiModelName: row.apiModelName.trim(), costPerCall: Number(row.costPerCall) }));
	const visionIds = new Set<string>();
	for (const row of visionModels) {
		if (!row.id || !row.name || !row.apiUrl || !row.apiKey || !row.apiModelName || !Number.isFinite(row.costPerCall) || row.costPerCall < 0 || visionIds.has(row.id)) {
			os.alert({ type: 'error', text: i18n.ts._agents.adminVisionInvalid });
			throw new Error('invalid vision model');
		}
		visionIds.add(row.id);
	}
	const visionDefaultId = state.agentVisionDefaultModelId.trim();
	if (visionDefaultId !== '' && !visionModels.some(row => row.id === visionDefaultId && row.enabled)) {
		os.alert({ type: 'error', text: i18n.ts._agents.adminVisionInvalidDefault });
		throw new Error('invalid vision default model');
	}
	const imageArtistPresets = state.agentImageArtistPresetRows
		.filter(row => row.id.trim() !== '' || row.name.trim() !== '' || row.promptPrefix.trim() !== '' || row.promptSuffix.trim() !== '' || row.negativePrompt.trim() !== '' || row.thumbnailUrl.trim() !== '')
		.map(row => ({
			id: row.id.trim() || genId(),
			name: row.name.trim(),
			promptPrefix: row.promptPrefix,
			promptSuffix: row.promptSuffix,
			negativePrompt: row.negativePrompt,
			thumbnailUrl: row.thumbnailUrl.trim() === '' ? null : row.thumbnailUrl.trim(),
		}));
	const imageArtistPresetIds = new Set<string>();
	for (const row of imageArtistPresets) {
		if (!row.id || !row.name) {
			os.alert({ type: 'error', text: i18n.ts._agents.adminArtistPresetInvalid });
			throw new Error('invalid image artist preset row');
		}
		if (imageArtistPresetIds.has(row.id)) {
			os.alert({ type: 'error', text: i18n.tsx._agents.adminArtistPresetDuplicate({ id: row.id }) });
			throw new Error('duplicate image artist preset id');
		}
		imageArtistPresetIds.add(row.id);
	}
	const imageMaxPerReply = Math.trunc(Number(state.agentImageMaxPerReply));
	const stickerMaxPerMessage = Math.trunc(Number(state.agentStickerMaxPerMessage));
	const emojiPromptMaxCount = Math.trunc(Number(state.agentEmojiPromptMaxCount));
	if (!Number.isFinite(stickerMaxPerMessage) || stickerMaxPerMessage < 0 || stickerMaxPerMessage > 10) {
		os.alert({ type: 'error', text: i18n.ts._agents.stickerAdminParamsInvalid });
		throw new Error('invalid sticker max per message');
	}
	if (!Number.isFinite(emojiPromptMaxCount) || emojiPromptMaxCount < 1 || emojiPromptMaxCount > 2000) {
		os.alert({ type: 'error', text: i18n.ts._agents.stickerAdminParamsInvalid });
		throw new Error('invalid emoji prompt max count');
	}
	const imageCost = Number(state.agentImageCostPerCall);
	const imageMinPoints = Math.trunc(Number(state.agentImageTokenMinPoints));
	const imageTtl = Math.trunc(Number(state.agentImageTokenBalanceTtlSeconds));
	const imageSteps = Math.trunc(Number(state.agentImageSteps));
	const imageScale = Number(state.agentImageScale);
	const imageCfgRescale = Number(state.agentImageCfgRescale);
	if (!Number.isFinite(imageMaxPerReply) || imageMaxPerReply < 0 || imageMaxPerReply > 12) {
		os.alert({ type: 'error', text: i18n.ts._agents.adminImageParamsInvalid });
		throw new Error('invalid image max per reply');
	}
	if (!Number.isFinite(imageCost) || imageCost < 0) {
		os.alert({ type: 'error', text: i18n.ts._agents.adminImageParamsInvalid });
		throw new Error('invalid image cost');
	}
	if (!Number.isFinite(imageMinPoints) || imageMinPoints < 0) {
		os.alert({ type: 'error', text: i18n.ts._agents.adminImageParamsInvalid });
		throw new Error('invalid image min points');
	}
	if (!Number.isFinite(imageTtl) || imageTtl < 0) {
		os.alert({ type: 'error', text: i18n.ts._agents.adminImageParamsInvalid });
		throw new Error('invalid image ttl');
	}
	if (!Number.isFinite(imageSteps) || imageSteps < 1 || imageSteps > 80) {
		os.alert({ type: 'error', text: i18n.ts._agents.adminImageParamsInvalid });
		throw new Error('invalid image steps');
	}
	if (!Number.isFinite(imageScale) || imageScale < 0 || imageScale > 30) {
		os.alert({ type: 'error', text: i18n.ts._agents.adminImageParamsInvalid });
		throw new Error('invalid image scale');
	}
	if (!Number.isFinite(imageCfgRescale) || imageCfgRescale < 0 || imageCfgRescale > 1) {
		os.alert({ type: 'error', text: i18n.ts._agents.adminImageParamsInvalid });
		throw new Error('invalid image cfg rescale');
	}

	const externalAuditModels = state.agentExternalAuditModelRows
		.filter(row => row.name.trim() !== '' || row.baseUrl.trim() !== '' || row.apiModelName.trim() !== '' || row.apiKey.trim() !== '')
		.map((row, i) => ({
			id: row.id.trim() || genId(),
			name: row.name.trim(),
				provider: row.provider,
			baseUrl: row.baseUrl.trim(),
			apiKey: row.apiKey.trim(),
			apiModelName: row.apiModelName.trim(),
			priority: Number.isFinite(Number(row.priority)) ? Math.trunc(Number(row.priority)) : i,
			enabled: row.enabled,
			autoDisabledAt: row.autoDisabledAt.trim() === '' ? null : row.autoDisabledAt.trim(),
			autoDisabledReason: row.autoDisabledReason.trim() === '' ? null : row.autoDisabledReason.trim(),
			lastError: row.lastError.trim() === '' ? null : row.lastError.trim(),
		}));
		const externalAuditIds = new Set<string>();
		for (const row of externalAuditModels) {
			if (!externalAuditProviderValues.has(row.provider)) {
				os.alert({ type: 'error', text: `不支持的外审模型类型：${row.provider}` });
				throw new Error('unsupported external audit provider');
			}
			if (!row.id || !row.name || !row.baseUrl || !row.apiKey || !row.apiModelName) {
			os.alert({ type: 'error', text: i18n.ts._agents.adminExternalAuditInvalid });
			throw new Error('invalid external audit model row');
		}
		if (externalAuditIds.has(row.id)) {
			os.alert({ type: 'error', text: i18n.tsx._agents.adminExternalAuditDuplicate({ id: row.id }) });
			throw new Error('duplicate external audit model id');
		}
		externalAuditIds.add(row.id);
	}
		const externalAuditRules = state.agentExternalAuditRuleRows.map(rule => ({
			id: rule.id.trim(),
			name: rule.name.trim(),
			reason: rule.reason.trim(),
			criteria: rule.criteria.trim(),
			enabled: rule.enabled,
		}));
		const externalAuditRuleIds = new Set<string>();
		for (const rule of externalAuditRules) {
			if (!/^[a-z][a-z0-9_-]{0,63}$/.test(rule.id) || rule.id === 'allow' || rule.id === 'other_high_risk' || !rule.name || !rule.reason || !rule.criteria || externalAuditRuleIds.has(rule.id)) {
				os.alert({ type: 'error', text: '违规条目的 ID、名称、固定原因和判断标准必须完整；ID 需唯一并使用小写字母、数字、下划线或连字符。' });
				throw new Error('invalid external audit rule');
			}
			externalAuditRuleIds.add(rule.id);
		}
		const externalAuditOtherRule = {
			reason: state.agentExternalAuditOtherRule.reason.trim(),
			criteria: state.agentExternalAuditOtherRule.criteria.trim(),
		};
		if (!externalAuditOtherRule.reason || !externalAuditOtherRule.criteria) {
			os.alert({ type: 'error', text: '“其他高风险内容”的兜底原因和判断标准不能为空。' });
			throw new Error('invalid external audit other rule');
		}
		const externalAuditTimeoutMs = Math.trunc(Number(state.agentExternalAuditTimeoutMs));
	const externalAuditFailureThresholdPercent = Math.trunc(Number(state.agentExternalAuditFailureThresholdPercent));
	const externalAuditFailureMinRequests = Math.trunc(Number(state.agentExternalAuditFailureMinRequests));
	if (!Number.isFinite(externalAuditTimeoutMs) || externalAuditTimeoutMs < 1000 || externalAuditTimeoutMs > 120000) {
		os.alert({ type: 'error', text: '外审超时时间必须在 1000 到 120000 毫秒之间。' });
		throw new Error('invalid external audit timeout');
	}
	if (!Number.isFinite(externalAuditFailureThresholdPercent) || externalAuditFailureThresholdPercent < 1 || externalAuditFailureThresholdPercent > 100) {
		os.alert({ type: 'error', text: '外审自动禁用失败率必须在 1 到 100 之间。' });
		throw new Error('invalid external audit failure threshold');
	}
	if (!Number.isFinite(externalAuditFailureMinRequests) || externalAuditFailureMinRequests < 1 || externalAuditFailureMinRequests > 100000) {
		os.alert({ type: 'error', text: '外审自动禁用最小样本数必须大于 0。' });
		throw new Error('invalid external audit min requests');
	}

	const memTopK = Math.trunc(Number(state.agentMem0TopK));
	const memInj = Math.trunc(Number(state.agentMem0InjectMaxChars));
	if (!Number.isFinite(memTopK) || memTopK < 1 || memTopK > 100) {
		os.alert({ type: 'error', text: i18n.ts._agents.adminLongMemoryInvalidTopK });
		throw new Error('invalid memory top k');
	}
	if (!Number.isFinite(memInj) || memInj < 200 || memInj > 50000) {
		os.alert({ type: 'error', text: i18n.ts._agents.adminLongMemoryInvalidInject });
		throw new Error('invalid memory inject');
	}
	const memAddRounds = Math.trunc(Number(state.agentMem0AddMemoryMaxRounds));
	if (!Number.isFinite(memAddRounds) || memAddRounds < 1 || memAddRounds > 24) {
		os.alert({ type: 'error', text: i18n.ts._agents.adminLongMemoryInvalidAddRounds });
		throw new Error('invalid add memory rounds');
	}
	const memAddEveryN = Math.trunc(Number(state.agentMem0AddMemoryEveryNRounds));
	if (!Number.isFinite(memAddEveryN) || memAddEveryN < 1 || memAddEveryN > 48) {
		os.alert({ type: 'error', text: i18n.ts._agents.adminLongMemoryInvalidAddEveryN });
		throw new Error('invalid add memory every n');
	}

	const compMaxIn = Math.trunc(Number(state.agentCompressionMaxInputChars));
	const compMaxOut = Math.trunc(Number(state.agentCompressionMaxOutputTokens));
	if (!Number.isFinite(compMaxIn) || compMaxIn < 500 || compMaxIn > 200000) {
		os.alert({ type: 'error', text: i18n.ts._agents.adminCompressionInvalidInput });
		throw new Error('invalid compression max input');
	}
	if (!Number.isFinite(compMaxOut) || compMaxOut < 1 || compMaxOut > 32000) {
		os.alert({ type: 'error', text: i18n.ts._agents.adminCompressionInvalidOutput });
		throw new Error('invalid compression max output');
	}

	const t1s = String(state.agentCompressionBandT1Ratio ?? '').trim();
	const t2s = String(state.agentCompressionBandT2Ratio ?? '').trim();
	let bandT1: number | null = null;
	let bandT2: number | null = null;
	if (t1s === '' && t2s === '') {
		bandT1 = null;
		bandT2 = null;
	} else {
		bandT1 = Number(t1s);
		bandT2 = Number(t2s);
		if (!Number.isFinite(bandT1) || !Number.isFinite(bandT2) || bandT1 < 0.01 || bandT1 > 0.99 || bandT2 < 0.01 || bandT2 > 0.99) {
			os.alert({ type: 'error', text: i18n.ts._agents.adminCompressionInvalidBandRatio });
			throw new Error('invalid band ratio');
		}
		if (bandT1 >= bandT2) {
			os.alert({ type: 'error', text: i18n.ts._agents.adminCompressionInvalidBandT1T2 });
			throw new Error('invalid t1 t2 order');
		}
	}

	await os.apiWithDialog('admin/update-meta', {
		agentFeatureEnabled: state.agentFeatureEnabled,
		agentGlobalSystemPrompt: state.agentGlobalSystemPrompt === '' ? null : state.agentGlobalSystemPrompt,
		agentLlmModels: normalized,
		agentLlmModelGroups: state.agentLlmModelGroupRows
			.filter(g => g.name.trim() !== '')
			.map(g => ({ id: g.id.trim() || genId(), name: g.name.trim() })),
		agentDefaultModelId: defTrim === '' ? null : defTrim,
		agentByokEnabled: state.agentByokEnabled,
		agentByokMaxUserModels: Math.max(1, Math.min(500, Math.trunc(Number(state.agentByokMaxUserModels) || 20))),
		agentByokProviders: state.agentByokProviderRows
			.filter(row => row.name.trim() !== '' || row.baseUrl.trim() !== '')
			.map(row => ({
				id: row.id.trim() || genId(),
				name: row.name.trim(),
				description: row.description.trim() === '' ? null : row.description.trim(),
				baseUrl: row.baseUrl.trim(),
				apiModelName: row.apiModelName.trim() === '' ? null : row.apiModelName.trim(),
				maxContextTokens: row.maxContextTokens.trim() === '' ? undefined : Math.trunc(Number(row.maxContextTokens)),
				maxOutputTokensPerCall: row.maxOutputTokensPerCall.trim() === '' ? undefined : Math.trunc(Number(row.maxOutputTokensPerCall)),
				tokenizerEncoding: row.tokenizerEncoding.trim() === '' ? null : row.tokenizerEncoding.trim(),
				charsPerToken: row.charsPerToken.trim() === '' ? undefined : Number(row.charsPerToken),
			})),
		agentOpenaiCompatibleBaseUrl: null,
		agentOpenaiCompatibleApiKey: null,
		agentModelDisplayName: null,
		agentModelDescription: null,
		agentModelApiName: null,
		agentMem0Enabled: state.agentMem0Enabled,
		agentMem0ApiKey: state.agentMem0ApiKey.trim() === '' ? null : state.agentMem0ApiKey,
		agentMem0ApiBaseUrl: state.agentMem0ApiBaseUrl.trim() === '' ? null : state.agentMem0ApiBaseUrl.trim(),
		agentMem0OrgId: state.agentMem0OrgId.trim() === '' ? null : state.agentMem0OrgId.trim(),
		agentMem0TopK: memTopK,
		agentMem0InjectMaxChars: memInj,
		agentMem0AddMemoryMaxRounds: memAddRounds,
		agentMem0AddMemoryEveryNRounds: memAddEveryN,
		agentCompressionSystemPrompt: state.agentCompressionSystemPrompt.trim() === '' ? null : state.agentCompressionSystemPrompt,
		agentCompressionMaxInputChars: compMaxIn,
		agentCompressionMaxOutputTokens: compMaxOut,
		agentCompressionBandT1Ratio: bandT1,
		agentCompressionBandT2Ratio: bandT2,
		agentCompressionDefaultModelId: compDefTrim === '' ? null : compDefTrim,
		agentImageGenerationEnabled: state.agentImageGenerationEnabled,
		agentImageBaseUrl: state.agentImageBaseUrl.trim() || 'https://love.auroralove.cc',
		agentImageTokens: imageTokens,
		agentImageModels: imageModels,
		agentVisionModels: visionModels,
		agentVisionDefaultModelId: visionDefaultId === '' ? null : visionDefaultId,
		agentImageArtistPresets: imageArtistPresets,
		agentImageDefaultModel: state.agentImageDefaultModel.trim() || 'nai-diffusion-4-5-full',
		agentImageDefaultArtistPresetId: state.agentImageDefaultArtistPresetId.trim() === '' ? null : state.agentImageDefaultArtistPresetId.trim(),
		agentImageDefaultParams: {
			steps: imageSteps,
			scale: imageScale,
			cfgRescale: imageCfgRescale,
			sampler: state.agentImageSampler.trim() || 'k_euler_ancestral',
			noiseSchedule: state.agentImageNoiseSchedule.trim() || 'karras',
			promptPrefix: state.agentImagePromptPrefix,
			promptSuffix: state.agentImagePromptSuffix,
		},
		agentImageDefaultNegativePrompt: state.agentImageDefaultNegativePrompt.trim() === '' ? null : state.agentImageDefaultNegativePrompt,
		agentImageMaxPerReply: imageMaxPerReply,
		agentStickerEnabled: state.agentStickerEnabled === true,
		agentStickerMaxPerMessage: stickerMaxPerMessage,
		agentEmojiPromptMaxCount: emojiPromptMaxCount,
		agentPerformanceEnabled: state.agentPerformanceEnabled === true,
		agentPerformanceSystemPrompt: state.agentPerformanceSystemPrompt.trim() === '' ? null : state.agentPerformanceSystemPrompt,
		agentImageCostPerCall: imageCost,
		agentImageTokenMinPoints: imageMinPoints,
		agentImageTokenBalanceTtlSeconds: imageTtl,
		agentExternalAuditEnabled: state.agentExternalAuditEnabled,
		agentExternalAuditModels: externalAuditModels,
		agentExternalAuditTimeoutMs: externalAuditTimeoutMs,
		agentExternalAuditFailureThresholdPercent: externalAuditFailureThresholdPercent,
		agentExternalAuditFailureMinRequests: externalAuditFailureMinRequests,
		agentExternalAuditNotifyEmails: state.agentExternalAuditNotifyEmails.trim() === '' ? null : state.agentExternalAuditNotifyEmails,
			agentExternalAuditSystemPrompt: state.agentExternalAuditSystemPrompt.trim() === '' ? null : state.agentExternalAuditSystemPrompt,
			agentExternalAuditRules: externalAuditRules,
			agentExternalAuditOtherRule: externalAuditOtherRule,
			agentReviewTriggerRules: state.agentReviewTriggerRules
			.filter(r => r.timeWindowMinutes.trim() !== '' && r.blockThreshold.trim() !== '')
			.map(r => ({
				id: r.id,
				timeWindowMinutes: Math.max(1, Math.min(10080, Math.trunc(Number(r.timeWindowMinutes) || 60))),
				blockThreshold: Math.max(1, Math.min(1000, Math.trunc(Number(r.blockThreshold) || 5))),
				enabled: r.enabled,
			})),
		agentCheckinSettings: {
			enabled: state.checkinEnabled,
			streakMaxDays: Number(state.checkinStreakMaxDays) || 365,
			streakMaxMultiplier: Number(state.checkinStreakMaxMultiplier) || 2.0,
			specialDayMultiplier: Number(state.checkinSpecialDayMultiplier) || 2.0,
			specialDays: state.checkinSpecialDays.split(',').map(s => s.trim()).filter(s => /^\d{2}-\d{2}$/.test(s)),
			roleMultipliers: {},
			makeupEnabled: state.checkinMakeupEnabled,
			makeupMaxPerMonth: Number(state.checkinMakeupMaxPerMonth) || 3,
			makeupBaseCost: Number(state.checkinMakeupBaseCost) || 20,
			makeupCostIncrement: Number(state.checkinMakeupCostIncrement) || 10,
			makeupAllowedWindowDays: Number(state.checkinMakeupAllowedWindowDays) || 7,
		},
		agentRedeemPurchaseUrl: state.agentRedeemPurchaseUrl.trim() === '' ? null : state.agentRedeemPurchaseUrl.trim(),
		agentAliyaCharacterId: state.agentAliyaCharacterId.trim() === '' ? null : state.agentAliyaCharacterId.trim(),
		agentAliyaWebUrl: state.agentAliyaWebUrl.trim() === '' ? null : state.agentAliyaWebUrl.trim(),
		agentProactiveRandomDefaultEnabled: state.agentProactiveRandomDefaultEnabled,
		agentProactiveScheduledDefaultEnabled: state.agentProactiveScheduledDefaultEnabled,
		agentProactiveMinSilenceMinutes: Math.max(5, Math.min(1440, Number(state.agentProactiveMinSilenceMinutes) || 30)),
		agentProactiveMaxWindowMinutes: Math.max(30, Math.min(10080, Number(state.agentProactiveMaxWindowMinutes) || 1410)),
		agentProactiveDaytimeWeight: Math.max(1, Math.min(10, Number(state.agentProactiveDaytimeWeight) || 3)),
		agentProactiveRecencyBias: Math.max(1, Math.min(10, Number(state.agentProactiveRecencyBias) || 1)),
		agentProactiveMaxChainLength: Math.max(1, Math.min(100, Number(state.agentProactiveMaxChainLength) || 7)),
	} as Record<string, unknown>);
	fetchInstance(true);
});

const defaultModelItems = computed((): MkSelectItem[] => {
	const items: MkSelectItem[] = [{ value: '', label: i18n.ts._agents.agentsMetaDefaultModelUnset }];
	const seen = new Set<string>();
	for (const row of form.state.agentLlmModelRows) {
		if (row.unlisted) continue;
		const id = row.id.trim();
		if (!id || seen.has(id)) continue;
		seen.add(id);
		const label = row.name.trim() || id;
		items.push({ value: id, label });
	}
	return items;
});

const compressionDefaultModelItems = computed((): MkSelectItem[] => {
	const items: MkSelectItem[] = [{ value: '', label: i18n.ts._agents.agentsMetaDefaultModelUnset }];
	const seen = new Set<string>();
	for (const row of form.state.agentLlmModelRows) {
		if (row.unlisted) continue;
		const id = row.id.trim();
		if (!id || seen.has(id)) continue;
		seen.add(id);
		items.push({ value: id, label: row.name.trim() || id });
	}
	return items;
});

const externalAuditProviderItems: MkSelectItem[] = [
	{ value: 'openai', label: 'OpenAI 兼容 Chat Completions' },
	{ value: 'aliyun-decision', label: '阿里云百炼决策模型' },
];
const externalAuditProviderValues = new Set(['openai', 'aliyun-decision']);

const listedModelCount = computed(() => form.state.agentLlmModelRows.filter(r => !r.unlisted && r.name.trim() && r.apiModelName.trim()).length);
const hasAuroraImageModel = computed(() => form.state.agentImageModelRows.some(r => r.provider === 'aurora'));
const selectedDefaultModelName = computed(() => {
	const id = form.state.agentDefaultModelId.trim();
	if (!id) return '未设置';
	return form.state.agentLlmModelRows.find(r => r.id.trim() === id)?.name || id;
});

// 签到身份组倍率配置
const checkinRoleRows = reactive<{ roleId: string; multiplier: string }[]>([]);
const roleItems = ref<MkSelectItem[]>([]);

async function loadRolesForCheckin() {
	try {
		const roles = await misskeyApi('admin/roles/list' as any, {}) as { id: string; name: string }[];
		roleItems.value = roles.map(r => ({ value: r.id, label: r.name }));
	} catch { /* ignore */ }
}

function initCheckinRoleRows(meta: Record<string, any>) {
	const rm = meta.agentCheckinSettings?.roleMultipliers ?? {};
	checkinRoleRows.length = 0;
	for (const [roleId, mul] of Object.entries(rm)) {
		checkinRoleRows.push({ roleId, multiplier: String(mul) });
	}
}

const checkinMakeupForm = reactive({
	userId: '',
	date: '',
});
const checkinMakeupSubmitting = ref(false);

async function adminMakeupCheckin() {
	const userId = checkinMakeupForm.userId.trim();
	const date = checkinMakeupForm.date;
	if (!userId || !date) return;

	const { canceled } = await os.confirm({
		type: 'question',
		title: i18n.ts._agents.adminCheckinMakeupTitle,
		text: i18n.tsx._agents.adminCheckinMakeupConfirm({ user: userId, date }),
	});
	if (canceled) return;

	checkinMakeupSubmitting.value = true;
	try {
		await misskeyApi('admin/agents-checkin-makeup', { userId, date });
		os.alert({ type: 'success', text: i18n.tsx._agents.adminCheckinMakeupSuccess({ user: userId, date }) });
		checkinMakeupForm.date = '';
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	} finally {
		checkinMakeupSubmitting.value = false;
	}
}

async function revokeTodayCheckin() {
	const confirm = await os.confirm({
		type: 'warning',
		title: i18n.ts._agents.adminCheckinRevokeTitle,
		text: i18n.ts._agents.adminCheckinRevokeText,
	});
	if (confirm.canceled) return;
	try {
		const res = await misskeyApi('admin/agents-checkin-revoke-today' as any, {}) as { revokedCount: number; totalRewardReversed: number };
		os.alert({ type: 'success', text: i18n.tsx._agents.adminCheckinRevoked({ count: res.revokedCount, amount: res.totalRewardReversed.toFixed(2) }) });
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	}
}

const redeemForm = reactive({
	amount: 10,
	count: 1,
	note: '',
	expiresAt: '',
});

const rewardForm = reactive({
	userId: '',
	reason: '',
	amount: null as number | null,
});
const rewardIssuing = ref(false);

async function issueReward() {
	const amount = Number(rewardForm.amount);
	if (!rewardForm.userId.trim() || !Number.isFinite(amount) || amount <= 0) return;
	const { canceled } = await os.confirm({
		type: 'question',
		title: i18n.ts._agents.adminIssueRewardTitle,
		text: i18n.tsx._agents.adminIssueRewardConfirm({ user: rewardForm.userId.trim(), amount: amount.toFixed(2) }),
	});
	if (canceled) return;
	rewardIssuing.value = true;
	try {
		const res = await misskeyApi('admin/agents/credits/issue-reward' as any, {
			userId: rewardForm.userId.trim(),
			amount,
			reason: rewardForm.reason.trim() || null,
		}) as { userId: string; amount: number; newBalance: number };
		os.alert({ type: 'success', text: i18n.tsx._agents.adminRewardIssued({ user: rewardForm.userId.trim(), amount: res.amount.toFixed(2) }) });
		rewardForm.userId = '';
		rewardForm.reason = '';
		rewardForm.amount = null;
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	} finally {
		rewardIssuing.value = false;
	}
}

const redeemGenerating = ref(false);
const generatedCodes = ref<{ id: string; code: string; creditAmount: number }[]>([]);
const redeemLoading = ref(false);
const redeemCodes = ref<RedeemCodeRow[]>([]);
const redeemStatus = ref<'available' | 'redeemed' | 'expired' | 'revoked' | 'all'>('available');

// === 迁移 Tab ===
const migrationKeyExists = ref(Boolean(meta.agentMigrationKeyConfigured));
const migrationKeyGenerating = ref(false);
const migrationLogsLoading = ref(false);
const migrationLogs = ref<{
	id: string;
	createdAt: string;
	targetUser: any | null;
	amount: number;
	requestId: string | null;
	sourceInfo: string | null;
	operator: any | null;
	status: string;
	failReason: string | null;
}[]>([]);

async function generateMigrationKey() {
	const { canceled } = await os.confirm({
		type: 'warning',
		title: migrationKeyExists.value ? i18n.ts._agents.adminMigrationKeyRegenTitle : i18n.ts._agents.adminMigrationKeyGenTitle,
		text: migrationKeyExists.value
			? i18n.ts._agents.adminMigrationKeyRegenText
			: i18n.ts._agents.adminMigrationKeyGenText,
	});
	if (canceled) return;
	migrationKeyGenerating.value = true;
	try {
		const res = await misskeyApi('admin/agents/credits/migration/generate-key' as any, {}) as { key: string };
		migrationKeyExists.value = true;
		await os.alert({
			type: 'success',
			title: i18n.ts._agents.adminMigrationKeyGeneratedTitle,
			text: i18n.tsx._agents.adminMigrationKeyGeneratedText({ key: res.key }),
		});
		await copyToClipboard(res.key);
		os.alert({ type: 'info', text: i18n.ts._agents.adminMigrationKeyCopied });
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	}
	migrationKeyGenerating.value = false;
}

async function loadMigrationLogs(append = false) {
	migrationLogsLoading.value = true;
	try {
		const untilId = append && migrationLogs.value.length > 0
			? migrationLogs.value[migrationLogs.value.length - 1].id
			: undefined;
		const res = await misskeyApi('admin/agents/credits/migration/logs' as any, {
			limit: 30,
			untilId,
		}) as typeof migrationLogs.value;
		if (append) {
			migrationLogs.value.push(...res);
		} else {
			migrationLogs.value = res;
		}
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	}
	migrationLogsLoading.value = false;
}

function loadMoreMigrationLogs() {
	void loadMigrationLogs(true);
}

const agentVisionDefaultItems = computed(() => [
	{ value: '', label: i18n.ts.none },
	...form.state.agentVisionModelRows.filter(row => row.enabled && row.name.trim() !== '').map(row => ({ value: row.id, label: row.name.trim() })),
]);

function addVisionModel() {
	form.state.agentVisionModelRows.push({ id: genId(), name: '', enabled: true, apiUrl: '', apiKey: '', apiModelName: '', costPerCall: '0' });
}

function removeVisionModel(index: number) {
	const [removed] = form.state.agentVisionModelRows.splice(index, 1);
	if (removed && form.state.agentVisionDefaultModelId === removed.id) form.state.agentVisionDefaultModelId = '';
}

const redeemPageSizeOptions = [10, 20, 50] as const;
const redeemQuery = ref('');
const redeemListPage = ref(1);
const redeemListPageInput = ref('1');
const redeemPageSize = ref<number>(20);
const redeemHasNext = ref(false);
const redeemRevoking = ref(false);
const redeemPageCache = ref<Record<number, RedeemCodeRow[]>>({});
const redeemPageCursorMap = ref<Record<number, string | null>>({ 1: null });
const redeemStatusItems: MkSelectItem[] = [
	{ value: 'all', label: '全部' },
	{ value: 'available', label: '可用' },
	{ value: 'redeemed', label: '已兑换' },
	{ value: 'expired', label: '已过期' },
	{ value: 'revoked', label: '已撤销' },
];

// 报表分类切换：模型报表 / 签到报表
const reportTypeTabs = [
	{ label: '模型报表', value: 'model' as const, icon: 'ti ti-cpu' },
	{ label: '签到报表', value: 'checkin' as const, icon: 'ti ti-calendar-check' },
];
const reportType = ref<'model' | 'checkin'>('model');
const reportsData = ref<ReportsOverview | null>(null);

interface TokenizerStatus {
	family: string;
	available: boolean;
	vocabPath?: string;
	configPath?: string;
}

const tokenizerStatuses = ref<TokenizerStatus[] | null>(null);

async function loadTokenizerStatus() {
	try {
		const res = await misskeyApi('admin/agents/tokenizer-status' as any, {});
		tokenizerStatuses.value = res.tokenizers;
	} catch (err) {
		console.error('Failed to load tokenizer status:', err);
	}
}

const missingTokenizers = computed(() => {
	return (tokenizerStatuses.value ?? []).filter(t => !t.available);
});

function tokenizerFamilyLabel(family: string): string {
	const labels: Record<string, string> = {
		glm: 'GLM（智谱）',
		deepseek: 'DeepSeek',
	};
	return labels[family] ?? family;
}

const externalAuditStatsLoading = ref(false);
const externalAuditStats = ref<AgentExternalAuditModelStat[]>([]);
const externalAuditSubTab = ref<'stats' | 'failures'>('stats');
const externalAuditFailuresLoading = ref(false);
const externalAuditFailures = ref<AgentExternalAuditFailureRow[]>([]);
const reportSuccessRate = computed(() => {
	const d = reportsData.value;
	if (!d || d.overall.total <= 0) return '—';
	return `${((d.overall.success / d.overall.total) * 100).toFixed(1)}%`;
});

async function generateRedeemCodes() {
	redeemGenerating.value = true;
	try {
		const params: Record<string, unknown> = {
			creditAmount: Number(redeemForm.amount),
			count: Number(redeemForm.count),
			note: redeemForm.note,
		};
		if (redeemForm.expiresAt) params.expiresAt = new Date(redeemForm.expiresAt).toISOString();
		const result = await misskeyApi('admin/agents/redeem-codes/generate' as any, params) as { id: string; code: string; creditAmount: number }[];
		generatedCodes.value = result;
		os.toast(i18n.ts.done);
		resetRedeemPager();
		await loadRedeemListPage(1, true);
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	} finally {
		redeemGenerating.value = false;
	}
}

async function loadRedeemListPage(page: number, force = false) {
	if (page < 1) return;
	redeemLoading.value = true;
	try {
		if (!force && redeemPageCache.value[page]) {
			redeemCodes.value = redeemPageCache.value[page];
			redeemListPage.value = page;
			redeemListPageInput.value = String(page);
			redeemHasNext.value = redeemCodes.value.length === redeemPageSize.value;
			return;
		}
		if (redeemPageCursorMap.value[page] === undefined) {
			for (let p = 1; p < page; p++) {
				if (redeemPageCursorMap.value[p + 1] !== undefined) continue;
				if (!redeemPageCache.value[p]) {
					await loadRedeemListPage(p, true);
				}
				const prevRows = redeemPageCache.value[p] ?? [];
				const prevLast = prevRows.at(-1);
				redeemPageCursorMap.value[p + 1] = prevLast ? prevLast.id : null;
			}
		}
		const params: Record<string, unknown> = { limit: redeemPageSize.value };
		if (redeemStatus.value !== 'all') params.status = redeemStatus.value;
		const keyword = redeemQuery.value.trim();
		if (keyword) params.query = keyword;
		const untilId = redeemPageCursorMap.value[page] ?? null;
		if (untilId) params.untilId = untilId;
		const rows = await misskeyApi('admin/agents/redeem-codes/list' as any, params) as RedeemCodeRow[];

		redeemPageCache.value[page] = rows;
		redeemCodes.value = rows;
		redeemListPage.value = page;
		redeemListPageInput.value = String(page);
		redeemHasNext.value = rows.length === redeemPageSize.value;

		const last = rows.at(-1);
		redeemPageCursorMap.value[page + 1] = last ? last.id : null;
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	} finally {
		redeemLoading.value = false;
	}
}

function syncRedeemPagerInput(ev: Event) {
	redeemListPageInput.value = (ev.target as HTMLInputElement).value;
}

function resetRedeemPager() {
	redeemListPage.value = 1;
	redeemListPageInput.value = '1';
	redeemHasNext.value = false;
	redeemPageCache.value = {};
	redeemPageCursorMap.value = { 1: null };
	redeemCodes.value = [];
}

function goRedeemPage(page: number) {
	const p = Math.max(1, Math.trunc(page));
	void loadRedeemListPage(p);
}

function goRedeemInputPage() {
	const p = Number(redeemListPageInput.value);
	if (!Number.isFinite(p)) return;
	goRedeemPage(p);
}

async function revokeRedeemCode(row: RedeemCodeRow) {
	const { canceled } = await os.confirm({ type: 'warning', text: `${i18n.ts._agents.redeemCodesRevoke}: ${row.code}` });
	if (canceled) return;
	redeemRevoking.value = true;
	try {
		await misskeyApi('admin/agents/redeem-codes/revoke' as any, { codeId: row.id });
		const updated = redeemCodes.value.map(r =>
			r.id === row.id ? { ...r, status: 'revoked' as const } : r,
		);
		redeemCodes.value = updated;
		redeemPageCache.value[redeemListPage.value] = updated;
		os.toast(i18n.ts.done);
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	} finally {
		redeemRevoking.value = false;
	}
}

function copyGeneratedCodes() {
	copyToClipboard(generatedCodes.value.map(c => c.code).join('\n'));
}

function copyAcct(user: NonNullable<RedeemCodeRow['redeemedBy']>) {
	copyToClipboard(`@${user.username}${user.host ? `@${user.host}` : ''}`);
}

function formatBjt(iso: string): string {
	return new Date(iso).toLocaleString('zh-CN', {
		timeZone: 'Asia/Shanghai',
		hour12: false,
	});
}

function redeemStatusLabel(status: RedeemCodeRow['status']) {
	if (status === 'available') return i18n.ts._agents.adminRedeemAvailable;
	if (status === 'redeemed') return i18n.ts._agents.adminRedeemRedeemed;
	if (status === 'expired') return i18n.ts._agents.adminRedeemExpired;
	return i18n.ts._agents.adminRedeemRevoked;
}

function redeemStatusColor(status: RedeemCodeRow['status']) {
	if (status === 'available') return 'var(--MI_THEME-accent)';
	if (status === 'expired') return 'var(--MI_THEME-warn)';
	if (status === 'revoked') return 'var(--MI_THEME-error)';
	return 'var(--MI_THEME-fgTransparentWeak)';
}

// 总览页 24h 小卡片：固定拉取近 24 小时整体统计
async function loadReports() {
	try {
		reportsData.value = await misskeyApi('admin/agents/reports/overview' as any, { hours: 24 }) as ReportsOverview;
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	}
}

function addExternalAuditModel() {
	form.state.agentExternalAuditModelRows.push({
		id: genId(),
		name: '',
		provider: 'openai',
		baseUrl: '',
		apiKey: '',
		apiModelName: '',
		priority: String(form.state.agentExternalAuditModelRows.length),
		enabled: true,
		autoDisabledAt: '',
		autoDisabledReason: '',
		lastError: '',
	});
}

function removeExternalAuditModel(index: number) {
	form.state.agentExternalAuditModelRows.splice(index, 1);
}

function onExternalAuditProviderChange(row: AgentExternalAuditModelRow) {
	if (row.provider === 'aliyun-decision' && row.apiModelName.trim() === '') row.apiModelName = 'decision-model-preview';
}

function addExternalAuditRule() {
	form.state.agentExternalAuditRuleRows.push({
		id: `rule_${genId().slice(-8).toLowerCase()}`,
		name: '',
		reason: '',
		criteria: '',
		enabled: true,
	});
}

function removeExternalAuditRule(index: number) {
	form.state.agentExternalAuditRuleRows.splice(index, 1);
}

function moveExternalAuditRule(index: number, direction: -1 | 1) {
	const target = index + direction;
	if (target < 0 || target >= form.state.agentExternalAuditRuleRows.length) return;
	const [rule] = form.state.agentExternalAuditRuleRows.splice(index, 1);
	if (rule) form.state.agentExternalAuditRuleRows.splice(target, 0, rule);
}

function restoreExternalAuditRules() {
	form.state.agentExternalAuditRuleRows = parseExternalAuditRuleRows(meta.agentExternalAuditDefaultRules);
	const other = meta.agentExternalAuditDefaultOtherRule;
	const o = other && typeof other === 'object' ? other as Record<string, unknown> : {};
	form.state.agentExternalAuditOtherRule = {
		reason: typeof o.reason === 'string' ? o.reason : '',
		criteria: typeof o.criteria === 'string' ? o.criteria : '',
	};
}

function clearExternalAuditAutoDisabled(index: number) {
	const row = form.state.agentExternalAuditModelRows[index];
	if (!row) return;
	row.autoDisabledAt = '';
	row.autoDisabledReason = '';
	row.lastError = '';
}

function addReviewTriggerRule() {
	form.state.agentReviewTriggerRules.push({
		id: genId(),
		timeWindowMinutes: '60',
		blockThreshold: '5',
		enabled: true,
	});
}

function removeReviewTriggerRule(index: number) {
	form.state.agentReviewTriggerRules.splice(index, 1);
}

function restoreExternalAuditPrompt() {
	form.state.agentExternalAuditSystemPrompt = typeof meta.agentExternalAuditDefaultSystemPrompt === 'string'
		? meta.agentExternalAuditDefaultSystemPrompt
		: '';
}

async function loadExternalAuditStats() {
	externalAuditStatsLoading.value = true;
	try {
		externalAuditStats.value = await misskeyApi('admin/agents/external-audit/models/stats' as any, {}) as AgentExternalAuditModelStat[];
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	} finally {
		externalAuditStatsLoading.value = false;
	}
}

function externalAuditStatStatus(row: AgentExternalAuditModelStat) {
	if (row.autoDisabledAt) return i18n.ts._agents.adminAuditAutoDisabled;
	if (!row.enabled) return i18n.ts._agents.adminAuditDisabled;
	return i18n.ts._agents.adminAuditEnabled;
}

async function loadExternalAuditFailures() {
	externalAuditFailuresLoading.value = true;
	try {
		externalAuditFailures.value = await misskeyApi('admin/agents/external-audit/logs/list' as any, { status: 'failed', limit: 50 }) as AgentExternalAuditFailureRow[];
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	} finally {
		externalAuditFailuresLoading.value = false;
	}
}

function externalAuditFailureKindLabel(kind: AgentExternalAuditFailureRow['failureKind']) {
	return kind === 'parse' ? '解析失败' : 'API 请求失败';
}

function formatExternalAuditFailureTime(v: string) {
	return formatDateTimeString(new Date(v), 'yyyy-MM-dd HH:mm:ss');
}

/** 添加模型：先选择模型类型，再创建对应预置行 */
function onAddModelMenu(ev: MouseEvent) {
	const t = i18n.ts._agents;
	const items: MenuItem[] = [
		{ type: 'button', icon: 'ti ti-plus', text: t.billingAddCustomModel, caption: t.billingAddCustomModelCaption, action: () => addRow() },
		{ type: 'divider' },
		{ type: 'label', text: t.billingAddOfficialDeepseek },
		{ type: 'button', icon: 'ti ti-bolt', text: 'DeepSeek-V4-Flash', caption: t.billingAddOfficialDeepseekCaption, action: () => addDeepSeekOfficialRow('flash') },
		{ type: 'button', icon: 'ti ti-bolt', text: 'DeepSeek-V4-Pro', caption: t.billingAddOfficialDeepseekCaption, action: () => addDeepSeekOfficialRow('pro') },
	];
	os.popupMenu(items, ev.currentTarget ?? ev.target);
}

function addLlmApiKey(row: AgentLlmModelRow) {
	row.apiKeys.push('');
}

function removeLlmApiKey(row: AgentLlmModelRow, index: number) {
	if (row.apiKeys.length <= 1) return;
	row.apiKeys.splice(index, 1);
}

function addRow() {
	const id = genId();
	form.state.agentLlmModelRows.push({
		id,
		name: '',
		description: '',
		baseUrl: '',
		apiKeys: [''],
		multiKeyEnabled: false,
		apiModelName: '',
		maxContextTokens: '8192',
		maxOutputTokensPerCall: '2048',
		unlisted: false,
		groupId: '',
		costPerCall: '0',
		billingMode: 'per_call',
		pricePerMillionInputCacheHitTokens: '',
		pricePerMillionInputCacheMissTokens: '',
		pricePerMillionOutputTokens: '',
		peakPriceMultiplier: '',
		charsPerToken: '',
		tokenizerEncoding: '',
		dailyFreeQuota: '0',
	});
	expandedLlmModelIds.value.push(id);
}

function onAddByokProvider() {
	form.state.agentByokProviderRows.push({
		id: genId(),
		name: '',
		description: '',
		baseUrl: '',
		apiModelName: '',
		maxContextTokens: '8192',
		maxOutputTokensPerCall: '2048',
		tokenizerEncoding: '',
		charsPerToken: '',
	});
}

/** 官方 DeepSeek 渠道预置：单价取自官方文档（元/百万 tokens），管理员仅需补 API Key */
function addDeepSeekOfficialRow(variant: 'flash' | 'pro') {
	const preset = variant === 'flash'
		? { name: 'DeepSeek-V4-Flash（官方）', apiModelName: 'deepseek-v4-flash', tokenizerEncoding: 'deepseek:deepseek-v4-flash', hit: '0.02', miss: '1', output: '2' }
		: { name: 'DeepSeek-V4-Pro（官方）', apiModelName: 'deepseek-v4-pro', tokenizerEncoding: 'deepseek:deepseek-v4-pro', hit: '0.025', miss: '3', output: '6' };
	const id = genId();
	form.state.agentLlmModelRows.push({
		id,
		name: preset.name,
		description: i18n.ts._agents.billingDeepseekPresetDesc,
		baseUrl: 'https://api.deepseek.com',
		apiKeys: [''],
		multiKeyEnabled: false,
		apiModelName: preset.apiModelName,
		maxContextTokens: '1000000',
		maxOutputTokensPerCall: '32768',
		unlisted: false,
		groupId: '',
		costPerCall: '0.1',
		billingMode: 'usage',
		pricePerMillionInputCacheHitTokens: preset.hit,
		pricePerMillionInputCacheMissTokens: preset.miss,
		pricePerMillionOutputTokens: preset.output,
		peakPriceMultiplier: '2',
		charsPerToken: '',
		tokenizerEncoding: preset.tokenizerEncoding,
		dailyFreeQuota: '0',
	});
	expandedLlmModelIds.value.push(id);
}

async function toggleUnlist(row: AgentLlmModelRow, next: boolean) {
	if (next === true) {
		const ok = await os.confirm({
			type: 'warning',
			text: i18n.tsx._agents.adminModelUnlistConfirm({ name: row.name.trim() || row.id }),
		});
		if (ok.canceled) return;
		if (form.state.agentDefaultModelId.trim() === row.id.trim()) {
			form.state.agentDefaultModelId = '';
		}
		if (form.state.agentCompressionDefaultModelId.trim() === row.id.trim()) {
			form.state.agentCompressionDefaultModelId = '';
		}
	}
	row.unlisted = next;
}

/** 模型卡片展开态（按内部 id 记录；下架区卡片同样可展开查看） */
const expandedLlmModelIds = ref<string[]>([]);
const expandedImageModelIds = ref<string[]>([]);

function isLlmModelExpanded(id: string): boolean {
	return expandedLlmModelIds.value.includes(id);
}

function toggleLlmModelExpanded(id: string) {
	if (isLlmModelExpanded(id)) {
		expandedLlmModelIds.value = expandedLlmModelIds.value.filter(x => x !== id);
	} else {
		expandedLlmModelIds.value.push(id);
	}
}

function isImageModelExpanded(id: string): boolean {
	return expandedImageModelIds.value.includes(id);
}

function toggleImageModelExpanded(id: string) {
	if (isImageModelExpanded(id)) {
		expandedImageModelIds.value = expandedImageModelIds.value.filter(x => x !== id);
	} else {
		expandedImageModelIds.value.push(id);
	}
}

/** 列表分区：上架中在前，已下架统一沉底 */
const llmModelSections = computed(() => [
	{ key: 'active', label: '上架中', rows: form.state.agentLlmModelRows.filter(r => !r.unlisted) },
	{ key: 'unlisted', label: '已下架', rows: form.state.agentLlmModelRows.filter(r => r.unlisted) },
]);

const imageModelSections = computed(() => [
	{ key: 'active', label: '上架中', rows: form.state.agentImageModelRows.filter(r => r.enabled) },
	{ key: 'unlisted', label: '已下架', rows: form.state.agentImageModelRows.filter(r => !r.enabled) },
]);

/** 卡片折叠态的一行摘要 */
function llmModelRowMeta(row: AgentLlmModelRow): string {
	const group = form.state.agentLlmModelGroupRows.find(g => g.id === row.groupId);
	const billing = row.billingMode === 'usage'
		? i18n.ts._agents.billingModeUsage
		: `${i18n.ts._agents.billingModePerCall} ${row.costPerCall || '0'}`;
	return [row.apiModelName.trim() || '未填上游模型', group ? (group.name.trim() || group.id) : i18n.ts._agents.modelGroupNone, billing].join(' · ');
}

function imageModelRowMeta(row: AgentImageModelRow): string {
	const providerItem = agentImageProviderItems.find(p => 'value' in p && p.value === row.provider);
	const provider = providerItem && 'value' in providerItem ? providerItem.label : row.provider;
	return [provider, row.apiModelName.trim() || '未填模型名', `每次 ${row.costPerCall || '0'}`].join(' · ');
}

/** 模型卡片「分组」下拉选项：无分组 + 现有分组 */
const modelGroupItems = computed<MkSelectItem[]>(() => [
	{ value: '', label: i18n.ts._agents.modelGroupNone },
	...form.state.agentLlmModelGroupRows.map(g => ({ value: g.id, label: g.name.trim() || g.id })),
]);

/** 复制模型：深拷贝该行并生成新 id，插入到原模型之后 */
function copyModelRow(src: AgentLlmModelRow) {
	const index = form.state.agentLlmModelRows.indexOf(src);
	if (index < 0) return;
	const copy: AgentLlmModelRow = {
		...src,
		id: genId(),
		name: `${src.name.trim()}${i18n.ts._agents.adminModelCopySuffix}`,
		apiKeys: [...src.apiKeys],
		unlisted: false,
	};
	form.state.agentLlmModelRows.splice(index + 1, 0, copy);
	expandedLlmModelIds.value.push(copy.id);
}

/** 长按拖动手柄排序：按住手柄 400ms 进入拖拽（行跟随指针、其余行实时让位），松手吸附落位；仅上架区可拖 */
const MODEL_ROW_DRAG_HOLD_MS = 400;
const MODEL_ROW_SNAP_MS = 170;

type ModelRowDrag = {
	kind: 'llm' | 'image';
	id: string;
	startY: number;
	dy: number;
	overId: string | null;
	overPos: 'before' | 'after';
	/** 拖动行在上架区（含自身）的原始索引 */
	from: number;
	/** 行距（行高 + 间距），让位与吸附的位移单位 */
	rowH: number;
	/** 插入点在不包含拖动行的上架区数组中的索引 */
	insertIndex: number;
	/** 松手后的吸附动画中：锁定 dy，不再响应指针移动 */
	snapping: boolean;
};

const modelRowDrag = ref<ModelRowDrag | null>(null);

let dragHoldTimer: number | null = null;
let dragSnapTimer: number | null = null;

function onModelRowGripPointerDown(ev: PointerEvent, kind: 'llm' | 'image', row: { id: string }) {
	if (ev.pointerType === 'mouse' && ev.button !== 0) return;
	ev.preventDefault();
	const startX = ev.clientX;
	const startY = ev.clientY;
	const onHoldMove = (e: PointerEvent) => {
		// 按住期间明显移动视为滚动/选择意图，取消长按判定
		if (Math.hypot(e.clientX - startX, e.clientY - startY) > 8) cancelHold();
	};
	const cancelHold = () => {
		if (dragHoldTimer != null) window.clearTimeout(dragHoldTimer);
		dragHoldTimer = null;
		window.removeEventListener('pointermove', onHoldMove);
		window.removeEventListener('pointerup', cancelHold);
		window.removeEventListener('pointercancel', cancelHold);
	};
	dragHoldTimer = window.setTimeout(() => {
		cancelHold();
		beginModelRowDrag(kind, row.id, startY);
	}, MODEL_ROW_DRAG_HOLD_MS);
	window.addEventListener('pointermove', onHoldMove);
	window.addEventListener('pointerup', cancelHold);
	window.addEventListener('pointercancel', cancelHold);
}

function activeModelRowEls(kind: 'llm' | 'image'): HTMLElement[] {
	const activeIds = new Set((kind === 'llm' ? llmModelSections.value[0].rows : imageModelSections.value[0].rows).map(r => r.id));
	return Array.from(window.document.querySelectorAll<HTMLElement>('[data-model-row-id]')).filter(el => activeIds.has(el.dataset.modelRowId!));
}

function beginModelRowDrag(kind: 'llm' | 'image', id: string, startY: number) {
	const rows = kind === 'llm' ? llmModelSections.value[0].rows : imageModelSections.value[0].rows;
	const from = rows.findIndex(r => r.id === id);
	// 行距 = 行高 + 间距，用相邻行 offsetTop 差量取（不受 transform 影响）；量不到时退化为自身高度
	const els = activeModelRowEls(kind);
	const selfIndex = els.findIndex(el => el.dataset.modelRowId === id);
	const self = selfIndex >= 0 ? els[selfIndex] : null;
	let rowH = 0;
	if (self) {
		if (selfIndex < els.length - 1) rowH = els[selfIndex + 1].offsetTop - self.offsetTop;
		else if (selfIndex > 0) rowH = self.offsetTop - els[selfIndex - 1].offsetTop;
		else rowH = self.offsetHeight;
	}
	modelRowDrag.value = { kind, id, startY, dy: 0, overId: null, overPos: 'before', from, rowH, insertIndex: from, snapping: false };
	window.addEventListener('pointermove', onModelRowDragMove, { passive: false });
	window.addEventListener('pointerup', endModelRowDrag);
	window.addEventListener('pointercancel', cancelModelRowDrag);
}

function onModelRowDragMove(ev: PointerEvent) {
	const drag = modelRowDrag.value;
	if (!drag || drag.snapping) return;
	ev.preventDefault();
	drag.dy = ev.clientY - drag.startY;
	// 用 offsetTop（布局坐标）而非 getBoundingClientRect：让位行的 transform 不能反馈影响命中计算，否则会抖动
	const els = activeModelRowEls(drag.kind).filter(el => el.dataset.modelRowId !== drag.id);
	const parent = els[0]?.offsetParent as HTMLElement | null;
	let overId: string | null = null;
	let overPos: 'before' | 'after' = 'before';
	if (parent) {
		const pointerY = ev.clientY - parent.getBoundingClientRect().top;
		for (const el of els) {
			const center = el.offsetTop + el.offsetHeight / 2;
			if (pointerY < center) {
				overId = el.dataset.modelRowId!;
				overPos = 'before';
				break;
			}
			overId = el.dataset.modelRowId!;
			overPos = 'after';
		}
	}
	drag.overId = overId;
	drag.overPos = overPos;
	if (overId == null) {
		drag.insertIndex = drag.from;
	} else {
		const others = (drag.kind === 'llm' ? llmModelSections.value[0].rows : imageModelSections.value[0].rows).filter(r => r.id !== drag.id);
		const k = others.findIndex(r => r.id === overId);
		drag.insertIndex = k < 0 ? drag.from : k + (overPos === 'after' ? 1 : 0);
	}
}

function endModelRowDrag() {
	const drag = modelRowDrag.value;
	cleanupModelRowDragListeners();
	if (!drag) return;
	// 吸附：先动画到目标格位，再一次性提交重排并清除 transform——新 flow 位置恰好等于吸附落点，视觉无缝
	const noMove = drag.overId == null || drag.overId === drag.id;
	snapModelRowDrag(drag, noMove ? 0 : (drag.insertIndex - drag.from) * drag.rowH, () => {
		if (noMove) return;
		if (drag.kind === 'llm') {
			reorderModelRowById(form.state.agentLlmModelRows, drag.id, drag.overId!, drag.overPos);
		} else {
			reorderModelRowById(form.state.agentImageModelRows, drag.id, drag.overId!, drag.overPos);
		}
	});
}

function cancelModelRowDrag() {
	const drag = modelRowDrag.value;
	cleanupModelRowDragListeners();
	if (!drag) return;
	snapModelRowDrag(drag, 0, () => {});
}

function snapModelRowDrag(drag: ModelRowDrag, targetDy: number, commit: () => void) {
	drag.snapping = true;
	drag.dy = targetDy;
	dragSnapTimer = window.setTimeout(() => {
		dragSnapTimer = null;
		modelRowDrag.value = null;
		commit();
	}, MODEL_ROW_SNAP_MS);
}

/** 拖拽中某行的位移样式：拖动行跟随指针；被跨越的行反向让出拖动行的高度（自身高度无关，跨过即平移一个行距） */
function modelRowDragStyle(rowId: string): { transform: string } | null {
	const drag = modelRowDrag.value;
	if (!drag) return null;
	if (drag.id === rowId) return { transform: `translateY(${drag.dy}px)` };
	const rows = drag.kind === 'llm' ? llmModelSections.value[0].rows : imageModelSections.value[0].rows;
	const j = rows.filter(r => r.id !== drag.id).findIndex(r => r.id === rowId);
	if (j < 0) return null;
	if (j >= drag.from && j < drag.insertIndex) return { transform: `translateY(${-drag.rowH}px)` };
	if (j >= drag.insertIndex && j < drag.from) return { transform: `translateY(${drag.rowH}px)` };
	return null;
}

/** 把 fromId 行移动到 overId 行的前/后；目标缺失时放回原位 */
function reorderModelRowById<T extends { id: string }>(rows: T[], fromId: string, overId: string, overPos: 'before' | 'after') {
	const from = rows.findIndex(r => r.id === fromId);
	if (from < 0) return;
	const [row] = rows.splice(from, 1);
	const target = rows.findIndex(r => r.id === overId);
	if (target < 0) {
		rows.splice(from, 0, row);
		return;
	}
	rows.splice(overPos === 'after' ? target + 1 : target, 0, row);
}

function cleanupModelRowDragListeners() {
	window.removeEventListener('pointermove', onModelRowDragMove);
	window.removeEventListener('pointerup', endModelRowDrag);
	window.removeEventListener('pointercancel', cancelModelRowDrag);
}

onBeforeUnmount(() => {
	if (dragHoldTimer != null) window.clearTimeout(dragHoldTimer);
	if (dragSnapTimer != null) window.clearTimeout(dragSnapTimer);
	cleanupModelRowDragListeners();
});

const newGroupName = ref('');

function addGroup() {
	const name = newGroupName.value.trim();
	if (!name) {
		os.alert({ type: 'error', text: i18n.ts._agents.modelGroupNameRequired });
		return;
	}
	if (form.state.agentLlmModelGroupRows.some(g => g.name.trim() === name)) {
		os.alert({ type: 'error', text: i18n.ts._agents.modelGroupDuplicate });
		return;
	}
	form.state.agentLlmModelGroupRows.push({ id: genId(), name });
	newGroupName.value = '';
}

/** 删除分组：引用该分组的模型回到「无分组」 */
async function removeGroup(groupId: string) {
	const group = form.state.agentLlmModelGroupRows.find(g => g.id === groupId);
	const count = form.state.agentLlmModelRows.filter(r => r.groupId.trim() === groupId).length;
	const ok = await os.confirm({
		type: 'warning',
		text: count > 0
			? i18n.tsx._agents.modelGroupDeleteConfirmWithModels({ name: group?.name.trim() ?? groupId, count })
			: i18n.tsx._agents.modelGroupDeleteConfirm({ name: group?.name.trim() ?? groupId }),
	});
	if (ok.canceled) return;
	form.state.agentLlmModelGroupRows = form.state.agentLlmModelGroupRows.filter(g => g.id !== groupId);
	for (const r of form.state.agentLlmModelRows) {
		if (r.groupId.trim() === groupId) r.groupId = '';
	}
}

/** 移动分组顺序：dir 为 -1（上移）或 1（下移） */
function moveGroup(index: number, dir: -1 | 1) {
	const rows = form.state.agentLlmModelGroupRows;
	const target = index + dir;
	if (target < 0 || target >= rows.length) return;
	const [row] = rows.splice(index, 1);
	rows.splice(target, 0, row);
}

const imageTokenRefreshing = ref(false);

function addImageToken() {
	form.state.agentImageTokenRows.push({
		id: genId(),
		token: '',
		name: '',
		enabled: true,
		sortOrder: String(form.state.agentImageTokenRows.length),
		points: '',
		lastUsedAt: '',
		lastCheckedAt: '',
		lastError: '',
	});
}

function removeImageToken(index: number) {
	form.state.agentImageTokenRows.splice(index, 1);
}

/** 添加生图模型：先选提供商模板，再创建对应预置行 */
function onAddImageModelMenu(ev: MouseEvent) {
	const items: MenuItem[] = [
		{ type: 'button', icon: 'ti ti-plus', text: '自定义模型', caption: '空白模型，手动填写全部配置', action: () => addImageModel() },
		{ type: 'divider' },
		{ type: 'label', text: '提供商预置' },
		{ type: 'button', icon: 'ti ti-bolt', text: 'SenseNova U1.5 Lite', caption: '预填日日新生图端点、模型名与参考图能力，补 API Key 即可', action: () => addImageModel('sensenova-lite') },
		{ type: 'button', icon: 'ti ti-bolt', text: 'SenseNova U1.5 Fast', caption: '预填日日新加速版生图端点、模型名与参考图能力，补 API Key 即可', action: () => addImageModel('sensenova-fast') },
		{ type: 'button', icon: 'ti ti-bolt', text: 'Tiptotip 网关', caption: '预填 ai.tiptotip.cn 生图端点，补 Key 与模型名即可', action: () => addImageModel('tiptotip') },
		{ type: 'button', icon: 'ti ti-bolt', text: 'OpenAI 官方', caption: '预填 api.openai.com 生图端点，补 Key 与模型名即可', action: () => addImageModel('openai') },
	];
	os.popupMenu(items, ev.currentTarget ?? ev.target);
}

function addImageModel(providerPreset?: 'tiptotip' | 'openai' | 'sensenova-lite' | 'sensenova-fast') {
	const id = genId();
	const isSenseNova = providerPreset === 'sensenova-lite' || providerPreset === 'sensenova-fast';
	form.state.agentImageModelRows.push({
		id,
		name: isSenseNova ? (providerPreset === 'sensenova-fast' ? 'SenseNova U1.5 Fast' : 'SenseNova U1.5 Lite') : '',
		description: '',
		provider: isSenseNova ? 'sensenova' : (providerPreset ?? 'aurora'),
		enabled: true,
		apiModelName: isSenseNova
			? (providerPreset === 'sensenova-fast' ? 'sensenova-u1.5-fast' : 'sensenova-u1.5-lite')
			: providerPreset != null ? '' : (form.state.agentImageDefaultModel || 'nai-diffusion-4-5-full'),
		apiUrl: providerPreset === 'tiptotip'
			? 'https://ai.tiptotip.cn/v1/images/generations'
			: providerPreset === 'openai'
				? 'https://api.openai.com/v1/images/generations'
				: isSenseNova
					? 'https://token.sensenova.cn/v1/images/generations'
					: '',
		apiKey: '',
		supportsReferenceImage: isSenseNova,
		costPerCall: form.state.agentImageCostPerCall || '',
		dailyFreeQuota: '0',
		defaultArtistPresetId: form.state.agentImageDefaultArtistPresetId || '',
		steps: form.state.agentImageSteps || '28',
		scale: form.state.agentImageScale || '5',
		cfgRescale: form.state.agentImageCfgRescale || '0',
		sampler: form.state.agentImageSampler || 'k_euler_ancestral',
		noiseSchedule: form.state.agentImageNoiseSchedule || 'karras',
		promptPrefix: form.state.agentImagePromptPrefix || '',
		promptSuffix: form.state.agentImagePromptSuffix || 'masterpiece,best quality,very aesthetic,highres,absurdres',
	});
	expandedImageModelIds.value.push(id);
}

/** 复制生图模型：深拷贝该行并生成新 id，插入到原模型之后 */
function copyImageModelRow(src: AgentImageModelRow) {
	const index = form.state.agentImageModelRows.indexOf(src);
	if (index < 0) return;
	const copy: AgentImageModelRow = {
		...src,
		id: genId(),
		name: `${src.name.trim()}${i18n.ts._agents.adminModelCopySuffix}`,
		enabled: true,
	};
	form.state.agentImageModelRows.splice(index + 1, 0, copy);
	expandedImageModelIds.value.push(copy.id);
}

/** 下架生图模型：保留配置但用户侧不可选，取消下架即恢复；不提供删除，避免用量等历史记录成为脏数据 */
async function toggleImageModelEnabled(row: AgentImageModelRow, next: boolean) {
	if (next === false) {
		const ok = await os.confirm({
			type: 'warning',
			text: i18n.tsx._agents.adminModelUnlistConfirm({ name: row.name.trim() || row.id }),
		});
		if (ok.canceled) return;
	}
	row.enabled = next;
}

function addImageArtistPreset() {
	form.state.agentImageArtistPresetRows.push({
		id: genId(),
		name: '',
		promptPrefix: '',
		promptSuffix: 'masterpiece,best quality,very aesthetic,highres,absurdres',
		negativePrompt: '',
		thumbnailUrl: '',
	});
}

function removeImageArtistPreset(index: number) {
	form.state.agentImageArtistPresetRows.splice(index, 1);
}

async function selectImageArtistPresetThumbnail(index: number, ev: MouseEvent) {
	const row = form.state.agentImageArtistPresetRows[index];
	if (!row) return;
	const file = await selectFile({
		anchorElement: ev.currentTarget,
		multiple: false,
		label: '选择画师串预览图',
	});
	row.thumbnailUrl = (file.thumbnailUrl ?? file.url ?? '').trim();
}

function clearImageArtistPresetThumbnail(index: number) {
	const row = form.state.agentImageArtistPresetRows[index];
	if (!row) return;
	row.thumbnailUrl = '';
}

async function refreshImageTokens() {
	imageTokenRefreshing.value = true;
	try {
		const rows = await misskeyApi(
			'admin/agents/images/tokens/refresh' as Parameters<typeof misskeyApi>[0],
			{} as any,
		) as Array<Record<string, unknown>>;
		form.state.agentImageTokenRows = rows.map((o, i) => ({
			id: typeof o.id === 'string' ? o.id : genId(),
			token: form.state.agentImageTokenRows.find(r => r.id === o.id)?.token ?? '',
			name: typeof o.name === 'string' ? o.name : '',
			enabled: o.enabled !== false,
			sortOrder: String(numFromMeta(o.sortOrder, i)),
			points: typeof o.points === 'number' ? String(o.points) : '',
			lastUsedAt: typeof o.lastUsedAt === 'string' ? o.lastUsedAt : '',
			lastCheckedAt: typeof o.lastCheckedAt === 'string' ? o.lastCheckedAt : '',
			lastError: typeof o.lastError === 'string' ? o.lastError : '',
		}));
		os.toast(i18n.ts._agents.adminImageTokensRefreshed);
	} catch (e) {
		os.alert({ type: 'error', text: formatApiError(e) });
	} finally {
		imageTokenRefreshing.value = false;
	}
}

const headerTabs = computed(() => [{
	key: 'overview',
	title: '总览',
	icon: 'ti ti-dashboard',
}, {
	key: 'basic',
	title: '基础',
	icon: 'ti ti-toggle-right',
}, {
	key: 'models',
	title: '模型',
	icon: 'ti ti-cpu',
}, {
	key: 'memory',
	title: '记忆',
	icon: 'ti ti-brain',
}, {
	key: 'compression',
	title: '压缩',
	icon: 'ti ti-file-zip',
}, {
	key: 'externalAudit',
	title: '外审',
	icon: 'ti ti-shield-check',
}, {
	key: 'images',
	title: '绘图',
	icon: 'ti ti-brush',
}, {
	key: 'sticker',
	title: i18n.ts._agents.stickerTabTitle,
	icon: 'ti ti-sticker',
}, {
	key: 'pet',
	title: '桌宠',
	icon: 'ti ti-paw',
}, {
	key: 'vision',
	title: i18n.ts._agents.adminVisionTitle,
	icon: 'ti ti-eye',
}, {
	key: 'credits',
	title: '额度',
	icon: 'ti ti-ticket',
}, {
	key: 'migration',
	title: '迁移',
	icon: 'ti ti-transfer',
}, {
	key: 'checkin',
	title: '签到',
	icon: 'ti ti-calendar-check',
}, {
	key: 'proactive',
	title: '主动消息',
	icon: 'ti ti-message-chatbot',
}, {
	key: 'reports',
	title: '报表',
	icon: 'ti ti-report-analytics',
}]);

const headerActions = computed(() => []);

definePage(() => ({
	title: i18n.ts._agents.adminSettings,
	icon: 'ti ti-robot',
}));

watch(redeemStatus, () => {
	if (activeTab.value === 'credits') {
		resetRedeemPager();
		void loadRedeemListPage(1, true);
	}
});

watch(redeemPageSize, () => {
	if (activeTab.value === 'credits') {
		resetRedeemPager();
		void loadRedeemListPage(1, true);
	}
});

let redeemSearchDebounceTimer: number | null = null;

watch(redeemQuery, () => {
	if (redeemSearchDebounceTimer) window.clearTimeout(redeemSearchDebounceTimer);
	redeemSearchDebounceTimer = window.setTimeout(() => {
		if (activeTab.value === 'credits') {
			resetRedeemPager();
			void loadRedeemListPage(1, true);
		}
	}, 300);
});

watch(externalAuditSubTab, sub => {
	if (activeTab.value === 'externalAudit' && sub === 'failures' && externalAuditFailures.value.length === 0) void loadExternalAuditFailures();
});

watch(activeTab, tab => {
	if (tab === 'overview' && reportsData.value == null) void loadReports();
	if (tab === 'externalAudit' && externalAuditStats.value.length === 0) void loadExternalAuditStats();
	if (tab === 'externalAudit' && externalAuditSubTab.value === 'failures' && externalAuditFailures.value.length === 0) void loadExternalAuditFailures();
	if (tab === 'credits' && redeemCodes.value.length === 0) void loadRedeemListPage(1, true);
	if (tab === 'migration' && migrationLogs.value.length === 0) void loadMigrationLogs();
	if (tab === 'checkin' && roleItems.value.length === 0) void loadRolesForCheckin();
});

initCheckinRoleRows(meta);

onMounted(() => {
	void loadReports();
	void loadTokenizerStatus();
});
</script>

<style lang="scss" module>
.modelCard {
	padding: 14px 16px;
	border-radius: 12px;
	border: solid 1px var(--MI_THEME-divider);
	background: var(--MI_THEME-panel);
}

.tokenCard {
	padding: 12px;
	border-radius: 8px;
	border: solid 1px var(--MI_THEME-divider);
	background: color-mix(in srgb, var(--MI_THEME-panel) 90%, var(--MI_THEME-bg));
}

.tokenMeta {
	display: flex;
	flex-wrap: wrap;
	gap: 0.45em 0.8em;
	font-size: 0.9em;
	opacity: 0.75;
}

.modelCardHead {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	margin-bottom: 2px;
}

.modelCardTitle {
	font-size: 0.92em;
	font-weight: 600;
	opacity: 0.9;
}

.byokProviderCard {
	border-color: color-mix(in srgb, var(--MI_THEME-accent) 35%, var(--MI_THEME-divider));
	background: color-mix(in srgb, var(--MI_THEME-accent) 5%, var(--MI_THEME-panel));
}

.iconDanger {
	color: var(--MI_THEME-error);

	&:hover {
		opacity: 0.85;
	}
}

.iconWarn {
	color: var(--MI_THEME-warn);

	&:hover {
		opacity: 0.85;
	}
}

.iconMuted {
	color: var(--MI_THEME-fg);
	opacity: 0.72;

	&:hover {
		opacity: 1;
	}
}

.modelCardActions {
	display: flex;
	gap: 4px;
	align-items: center;
	flex-shrink: 0;
}

.modelSectionHead {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.92em;
	font-weight: 600;
}

.modelSectionHeadMuted {
	opacity: 0.7;
}

.modelSectionCount {
	margin-left: 6px;
	padding: 1px 8px;
	border-radius: 999px;
	font-size: 0.78em;
	font-weight: 600;
	background: color-mix(in srgb, var(--MI_THEME-fg) 10%, transparent);
	opacity: 0.85;
}

.modelRow {
	position: relative;
	border-radius: 10px;
	border: solid 1px var(--MI_THEME-divider);
	background: var(--MI_THEME-panel);
	overflow: hidden;
}

.modelRowDragging {
	z-index: 4;
	border-color: var(--MI_THEME-accent);
	box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
	cursor: grabbing;
}

/* 拖拽中被跨越的行平滑让位 */
.modelRowShiftable {
	transition: transform 0.16s ease;
}

/* 松手后被拖行吸附到目标格位 */
.modelRowSnapping {
	transition: transform 0.16s ease;
}

.modelRowDropBefore,
.modelRowDropAfter {
	&::after {
		content: '';
		position: absolute;
		left: 8px;
		right: 8px;
		height: 2px;
		border-radius: 999px;
		background: var(--MI_THEME-accent);
		z-index: 3;
		pointer-events: none;
	}
}

.modelRowDropBefore::after {
	top: 0;
}

.modelRowDropAfter::after {
	bottom: 0;
}

.modelRowGrip {
	display: inline-flex;
	align-items: center;
	padding: 4px 2px;
	cursor: grab;
	opacity: 0.55;
	color: var(--MI_THEME-fg);
	touch-action: none;
	-webkit-touch-callout: none;

	&:hover {
		opacity: 0.95;
	}
}

.modelRowUnlisted {
	opacity: 0.78;
	background: color-mix(in srgb, var(--MI_THEME-panel) 88%, var(--MI_THEME-warn) 12%);
}

.modelRowHead {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 10px 12px;
	cursor: pointer;
	user-select: none;

	&:hover {
		background: color-mix(in srgb, var(--MI_THEME-fg) 4%, transparent);
	}
}

.modelRowChevron {
	font-size: 0.85em;
	opacity: 0.6;
	flex-shrink: 0;
	transition: transform 0.15s ease;
}

.modelRowChevronOpen {
	transform: rotate(90deg);
}

.modelRowTitle {
	font-size: 0.92em;
	font-weight: 600;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	min-width: 0;
}

.modelRowMeta {
	flex: 1;
	min-width: 0;
	font-size: 0.8em;
	opacity: 0.6;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.modelRowBody {
	padding: 12px 14px;
	border-top: solid 1px var(--MI_THEME-divider);
}

.groupRow {
	display: flex;
	align-items: center;
	gap: 8px;
}

.groupNameInput {
	flex: 1;
	min-width: 0;
}

.groupRowActions {
	display: flex;
	gap: 4px;
	align-items: center;
}

.addGroupRow {
	display: flex;
	align-items: center;
	gap: 8px;
}

.unlistedBadge {
	margin-left: 8px;
	padding: 2px 8px;
	border-radius: 999px;
	font-size: 0.75em;
	font-weight: 600;
	background: var(--MI_THEME-warn);
	color: var(--MI_THEME-fgOnWarn, #fff);
}

.emptyModels {
	text-align: center;
	padding: 20px 12px;
	font-size: 0.92em;
	opacity: 0.72;
	border-radius: 12px;
	border: 1px dashed var(--MI_THEME-divider);
}

.internalIdRow {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border-radius: 8px;
	background: var(--MI_THEME-panel);
	border: solid 1px var(--MI_THEME-divider);
}

.internalIdLabel {
	font-size: 0.78em;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	opacity: 0.55;
}

.internalIdValue {
	font-size: 0.88em;
	word-break: break-all;
}

.internalIdCaption {
	margin: 0;
	font-size: 0.82em;
	opacity: 0.72;
	line-height: 1.45;
}

.internalId {
	display: inline-flex;
	align-items: center;
	min-height: 34px;
	padding: 0 10px;
	border-radius: 6px;
	border: solid 1px var(--MI_THEME-divider);
	background: color-mix(in srgb, var(--MI_THEME-panel) 86%, transparent);
	color: var(--MI_THEME-fgTransparentWeak);
	word-break: break-all;
}

.saveBar {
	position: sticky;
	bottom: max(12px, env(safe-area-inset-bottom, 0px));
	padding: 12px 0 4px;
	margin-top: 8px;
	background: linear-gradient(to top, var(--MI_THEME-bg) 70%, transparent);
}

.overviewGrid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
	gap: 12px;
}

.overviewCard {
	padding: 14px 16px;
	border-radius: 8px;

	> span {
		display: block;
		font-size: 0.86em;
		color: var(--MI_THEME-fgTransparentWeak);
	}

	> b {
		display: block;
		margin-top: 4px;
		font-size: 1.35em;
		word-break: break-word;
	}
}

.quickGrid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
	gap: 10px;
}

.generatedBox {
	padding: 12px;
	border-radius: 8px;
	border: 1px solid var(--MI_THEME-divider);
	background: var(--MI_THEME-panel);
}

.generatedHead {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	margin-bottom: 10px;
}

.generatedCode {
	display: block;
	padding: 8px 10px;
	border-radius: 6px;
	background: var(--MI_THEME-bg);
	word-break: break-all;

	& + & {
		margin-top: 6px;
	}
}

.simpleTable {
	display: grid;
	gap: 8px;
}

.simpleRow {
	display: grid;
	grid-template-columns: minmax(160px, 1.4fr) repeat(4, minmax(90px, 1fr)) auto;
	gap: 10px;
	align-items: center;
	padding: 10px 12px;
	border-radius: 8px;
	border: 1px solid var(--MI_THEME-divider);
	background: var(--MI_THEME-panel);
	font-size: 0.9em;

	> * {
		min-width: 0;
		word-break: break-word;
	}
}

.simpleHeadRow {
	font-weight: 700;
	color: var(--MI_THEME-fgTransparentWeak);
	background: color-mix(in srgb, var(--MI_THEME-panel) 86%, var(--MI_THEME-bg));
	border-color: transparent;
	padding-block: 8px;
}

.userCell {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	min-width: 0;
}

.userLink {
	display: inline-flex;
	align-items: baseline;
	gap: 4px;
	min-width: 0;
	overflow: hidden;
	white-space: nowrap;
	> span:first-child {
		overflow: hidden;
		text-overflow: ellipsis;
	}
}

.userAcct {
	flex-shrink: 0;
	font-size: 0.88em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.userCopyBtn {
	flex-shrink: 0;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 22px;
	height: 22px;
	border-radius: 4px;
	font-size: 0.85em;
	color: var(--MI_THEME-fgTransparentWeak);
	&:hover {
		color: var(--MI_THEME-accent);
		background: color-mix(in srgb, var(--MI_THEME-accent) 10%, transparent);
	}
}

/* 卡密列表（自 agents-redeem-codes.vue 合并，与 my-stats.vue 分页条规范一致） */
.filterRow {
	display: flex;
	align-items: flex-end;
	flex-wrap: wrap;
	gap: 10px;
}
.searchInput {
	flex: 1;
	min-width: 180px;
}
.emptyMsg {
	text-align: center;
	padding: 20px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.9em;
}
.redeemTable {
	display: block;
	border-radius: var(--MI-radius);
	border: solid 1px var(--MI_THEME-divider);
	overflow-x: auto;
	overflow-y: hidden;
}
.redeemHead,
.redeemRow {
	display: grid;
	grid-template-columns: 132px minmax(132px, 1fr) 54px 54px minmax(70px, 0.7fr) minmax(110px, 0.9fr) 62px;
	gap: 6px;
	min-width: 620px;
	padding: 8px 12px;
}
.redeemHead {
	background: var(--MI_THEME-bg);
	font-size: 0.78em;
	font-weight: 700;
	color: var(--MI_THEME-fgTransparentWeak);
}
.redeemRow {
	border-top: solid 1px var(--MI_THEME-divider);
	font-size: 0.83em;
	align-items: center;
	&:hover {
		background: color-mix(in srgb, var(--MI_THEME-accent) 3%, transparent);
	}
}
.colCreatedAt {
	min-width: 140px;
	font-variant-numeric: tabular-nums;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.86em;
}
.colCode {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	font-size: 0.88em;
	letter-spacing: 0.02em;
}
.colAmount {
	min-width: 54px;
	font-variant-numeric: tabular-nums;
	font-weight: 600;
	text-align: right;
}
.colStatus {
	min-width: 54px;
	font-weight: 600;
	font-size: 0.85em;
	text-align: center;
}
.colNote {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.88em;
	text-align: center;
}
.colUser {
	min-width: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 4px;
	overflow: hidden;
}
.colActions {
	min-width: 52px;
	display: flex;
	justify-content: flex-end;
}
.revokeBtn {
	white-space: nowrap;
	display: inline-flex;
	align-items: center;
	gap: 4px;
	padding: 4px 8px;
	height: 26px;
	border-radius: 6px;
	font-size: 0.76em;
	font-weight: 600;
	color: var(--MI_THEME-error);
	background: color-mix(in srgb, var(--MI_THEME-error) 12%, transparent);
	border: solid 1px color-mix(in srgb, var(--MI_THEME-error) 35%, var(--MI_THEME-divider));
	&:hover {
		background: color-mix(in srgb, var(--MI_THEME-error) 18%, transparent);
	}
}
@media (max-width: 1100px) {
	.redeemHead,
	.redeemRow {
		grid-template-columns: 126px minmax(120px, 1fr) 52px 52px 62px 96px 58px;
		min-width: 580px;
	}
	.redeemHead {
		font-size: 0.74em;
	}
	.redeemRow {
		padding: 7px 10px;
		font-size: 0.82em;
	}
}

/* 分页条（与 my-stats.vue 一致：native input，三无盒与左中栏对齐） */
.pagerBar {
	--pgh: 28px;
	--pagerShellPad: 2px;
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: center;
	gap: 8px 10px;
	padding: 10px 0 4px;
	width: 100%;
	box-sizing: border-box;
}
.pagerSegGroup,
.pagerNavGroup,
.pagerGoGroup {
	display: inline-flex;
	align-items: stretch;
	align-self: center;
	box-sizing: border-box;
	max-width: 100%;
	overflow: hidden;
	padding: var(--pagerShellPad);
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 6px;
	background: var(--MI_THEME-panel);
	gap: 0;
	flex-wrap: nowrap;
}
.pagerSegBtn {
	min-width: 2.4rem;
	height: var(--pgh);
	max-height: var(--pgh);
	padding: 0 0.5rem;
	border: none;
	border-right: solid 1px var(--MI_THEME-divider);
	background: transparent;
	font-size: 0.82em;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
	color: var(--MI_THEME-fgTransparentWeak);
	cursor: pointer;
	line-height: 1;
	box-sizing: border-box;
	flex: none;
}
.pagerSegBtn:last-child {
	border-right: none;
}
.pagerSegBtn:hover:not(:disabled) {
	background: var(--MI_THEME-buttonHoverBg);
}
.pagerSegBtnActive {
	color: var(--MI_THEME-accent);
	background: color-mix(in srgb, var(--MI_THEME-accent) 12%, transparent);
}
.pagerNavIconBtn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 2.15rem;
	min-width: 2.15rem;
	max-width: 2.15rem;
	height: var(--pgh);
	max-height: var(--pgh);
	padding: 0;
	border: none;
	border-right: solid 1px var(--MI_THEME-divider);
	background: transparent;
	color: var(--MI_THEME-fg);
	font-size: 1.05rem;
	line-height: 1;
	cursor: pointer;
	box-sizing: border-box;
	flex: none;
}
.pagerNavIconBtn:disabled {
	opacity: 0.4;
	cursor: default;
}
.pagerNavIconBtn:hover:not(:disabled) {
	background: var(--MI_THEME-buttonHoverBg);
}
.pagerNavText {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-width: 4.5em;
	height: var(--pgh);
	max-height: var(--pgh);
	padding: 0 0.55rem;
	font-size: 0.84em;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
	color: var(--MI_THEME-fg);
	border-right: solid 1px var(--MI_THEME-divider);
	user-select: none;
	white-space: nowrap;
	flex: none;
	box-sizing: border-box;
	line-height: 1;
}
.pagerNavGroup .pagerNavIconBtn:last-of-type {
	border-right: none;
}
.pagerGoInputCell {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	flex: none;
	min-width: 2.85rem;
	height: var(--pgh);
	max-height: var(--pgh);
	padding: 0 0.42rem;
	border: none;
	border-right: solid 1px var(--MI_THEME-divider);
	background: transparent;
	box-sizing: border-box;
}
.pagerGoNativeInput {
	display: block;
	-moz-appearance: textfield;
	appearance: textfield;
	width: 100%;
	align-self: stretch;
	min-width: 1.85rem;
	max-width: 3.75rem;
	height: 100%;
	min-height: 0;
	margin: 0;
	padding: 0 5px;
	box-sizing: border-box;
	line-height: 1.2;
	font-family: inherit;
	font-size: 0.82em;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
	color: var(--MI_THEME-fg);
	background: transparent;
	border: none;
	outline: none;
	box-shadow: none;
	text-align: center;
}
.pagerGoNativeInput:disabled {
	opacity: 0.45;
	cursor: default;
}
.pagerGoNativeInput::-webkit-outer-spin-button,
.pagerGoNativeInput::-webkit-inner-spin-button {
	-webkit-appearance: none;
	margin: 0;
}
.pagerGoJumpBtn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	flex: none;
	min-width: 3rem;
	height: var(--pgh);
	max-height: var(--pgh);
	padding: 0 0.52rem;
	margin: 0;
	border: none;
	border-radius: 0;
	background: transparent;
	font-size: 0.82em;
	font-weight: 600;
	font-family: inherit;
	font-variant-numeric: tabular-nums;
	color: var(--MI_THEME-fgTransparentWeak);
	cursor: pointer;
	line-height: 1;
	box-sizing: border-box;
}
.pagerGoJumpBtn:hover:not(:disabled) {
	background: var(--MI_THEME-buttonHoverBg);
	color: var(--MI_THEME-fg);
}
.pagerGoJumpBtn:disabled {
	opacity: 0.4;
	cursor: default;
}
.pagerGoGroup:focus-within {
	border-color: var(--MI_THEME-accent);
}
@media (max-width: 600px) {
	.pagerBar {
		gap: 6px 8px;
		padding: 8px 0 4px;
	}
	.pagerNavText {
		min-width: 3.6em;
		padding: 0 0.4rem;
		font-size: 0.8em;
	}
	.pagerNavIconBtn {
		width: 2rem;
		min-width: 2rem;
	}
	.pagerGoInputCell {
		min-width: 2.5rem;
		padding: 0 0.28rem;
	}
}

.reportTabRow {
	display: flex;
	gap: 8px;
}

.reportTabBtn {
	padding: 8px 20px;
	border-radius: 999px;
	border: solid 1px var(--MI_THEME-divider);
	background: var(--MI_THEME-panel);
	color: var(--MI_THEME-fg);
	font-size: 0.92em;
	font-weight: 600;
	cursor: pointer;
	transition: background 0.15s, border-color 0.15s;
	display: inline-flex;
	align-items: center;
	gap: 6px;

	&:hover {
		border-color: var(--MI_THEME-accent);
	}
}

.reportTabBtnActive {
	background: var(--MI_THEME-accent);
	border-color: var(--MI_THEME-accent);
	color: var(--MI_THEME-fgOnAccent, #fff);
}

.auditStatsTable {
	display: grid;
	gap: 8px;
	width: 100%;
	min-width: 0;
	overflow-x: auto;
	overflow-y: hidden;
	overscroll-behavior-inline: contain;
	padding-bottom: 4px;
}

.auditStatsHead,
.auditStatsRow {
	display: grid;
	min-width: 720px;
	grid-template-columns: minmax(140px, 1.4fr) minmax(70px, 0.8fr) minmax(56px, 0.5fr) minmax(72px, 0.6fr) minmax(72px, 0.6fr) minmax(56px, 0.5fr) minmax(72px, 0.7fr);
	gap: 10px;
	align-items: center;
	padding: 10px 12px;
	border-radius: 8px;
	border: 1px solid var(--MI_THEME-divider);
	background: var(--MI_THEME-panel);
	font-size: 0.9em;

	> * {
		min-width: 0;
		word-break: break-word;
	}
}

.multiKeyList {
	display: grid;
	gap: 10px;
}

.multiKeyRow {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	align-items: end;
	gap: 10px;
}

.multiKeyRow > button {
	display: grid;
	place-items: center;
	width: 36px;
	height: 36px;
	margin-bottom: 2px;
	border-radius: 8px;
}

.auditStatsHead {
	font-weight: 700;
	color: var(--MI_THEME-fgTransparentWeak);
	background: color-mix(in srgb, var(--MI_THEME-panel) 86%, var(--MI_THEME-bg));
	border-color: transparent;
}

.auditFailuresToolbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	flex-wrap: wrap;
}

.auditFailuresHint {
	font-size: 0.85em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.auditFailureList {
	display: grid;
	gap: 8px;
}

.auditFailureCard {
	display: grid;
	gap: 6px;
	padding: 10px 12px;
	border-radius: 8px;
	border: 1px solid var(--MI_THEME-divider);
	background: var(--MI_THEME-panel);
	font-size: 0.9em;
}

.auditFailureHead {
	display: flex;
	align-items: center;
	gap: 8px;
	flex-wrap: wrap;
}

.auditFailureKind {
	flex-shrink: 0;
	padding: 2px 8px;
	border-radius: 6px;
	font-size: 0.85em;
	font-weight: 700;
}

.auditFailureKindApi {
	background: color-mix(in srgb, var(--MI_THEME-error) 16%, transparent);
	color: var(--MI_THEME-error);
}

.auditFailureKindParse {
	background: color-mix(in srgb, var(--MI_THEME-warn) 18%, transparent);
	color: var(--MI_THEME-warn);
}

.auditFailureModel {
	min-width: 0;
	word-break: break-word;
}

.auditFailureTime {
	margin-left: auto;
	flex-shrink: 0;
	font-size: 0.85em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.auditFailureReason {
	display: flex;
	align-items: baseline;
	gap: 8px;
	flex-wrap: wrap;
	color: var(--MI_THEME-fg);
	word-break: break-word;
}

.auditFailureCode {
	padding: 1px 6px;
	border-radius: 4px;
	background: color-mix(in srgb, var(--MI_THEME-fg) 10%, transparent);
	font-size: 0.85em;
}

.auditFailurePre {
	margin: 0;
	padding: 8px 10px;
	border-radius: 6px;
	border: 1px solid var(--MI_THEME-divider);
	background: color-mix(in srgb, var(--MI_THEME-panel) 70%, var(--MI_THEME-bg));
	max-height: 200px;
	overflow: auto;
	white-space: pre-wrap;
	word-break: break-word;
	font-size: 0.85em;
}

.artistPresetGrid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
	gap: 12px;
}

.artistPresetCard {
	min-width: 0;
	padding: 12px;
	border-radius: 8px;
	border: 1px solid var(--MI_THEME-divider);
	background: color-mix(in srgb, var(--MI_THEME-panel) 92%, var(--MI_THEME-bg));
}

.artistPresetPreview {
	display: grid;
	place-items: center;
	width: 100%;
	aspect-ratio: 16 / 9;
	overflow: hidden;
	border-radius: 8px;
	border: 1px solid var(--MI_THEME-divider);
	background: color-mix(in srgb, var(--MI_THEME-panel) 72%, var(--MI_THEME-bg));
	color: var(--MI_THEME-accent);
	font-size: 28px;

	> img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
}

@media (max-width: 800px) {
	.simpleRow {
		grid-template-columns: 1fr;
		gap: 6px;
	}

	.simpleHeadRow {
		display: none;
	}

	.generatedHead {
		align-items: flex-start;
		flex-direction: column;
	}

	.overviewGrid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.quickGrid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.artistPresetGrid {
		grid-template-columns: 1fr;
	}

	.reportTabRow {
		flex-wrap: wrap;
	}
}

@media (max-width: 480px) {
	.overviewGrid {
		grid-template-columns: 1fr;
	}

	.quickGrid {
		grid-template-columns: 1fr;
	}
}

.roleMulSection {
	padding: 4px 0;
}

.roleMulRow {
	display: flex;
	align-items: flex-end;
	gap: 10px;
	margin-bottom: 10px;
}

.roleMulDel {
	padding: 8px 10px;
	border-radius: 8px;
	color: var(--MI_THEME-error);
	cursor: pointer;
	&:hover { background: color-mix(in srgb, var(--MI_THEME-error) 10%, transparent); }
}

.migrationKeyStatus {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 0.95em;
	color: var(--MI_THEME-fg);
}

.migrationKeyDot {
	width: 10px;
	height: 10px;
	border-radius: 50%;
	background: var(--MI_THEME-fgTransparentWeak);
}

.migrationKeyDotActive {
	background: var(--MI_THEME-success);
	box-shadow: 0 0 6px color-mix(in srgb, var(--MI_THEME-success) 50%, transparent);
}

.migrationAmount {
	color: var(--MI_THEME-success);
	font-weight: 600;
	font-variant-numeric: tabular-nums;
}
</style>
