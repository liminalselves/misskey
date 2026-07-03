<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="activeTab" :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 1000px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<div class="_gaps_m">
			<MkInfo>{{ i18n.ts._agents.adminSettingsDescription }}</MkInfo>

			<template v-if="activeTab === 'overview'">
				<div :class="$style.overviewGrid">
					<div v-panel :class="$style.overviewCard">
						<span>功能状态</span>
						<b>{{ form.state.agentFeatureEnabled ? '已启用' : '已关闭' }}</b>
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
						<b>{{ form.state.agentMem0Enabled ? '已启用' : '未启用' }}</b>
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
				<div :class="$style.quickGrid">
					<MkButton rounded @click="activeTab = 'models'"><i class="ti ti-cpu"></i> 模型管理</MkButton>
					<MkButton rounded @click="activeTab = 'credits'"><i class="ti ti-ticket"></i> 额度与卡密</MkButton>
					<MkButton rounded @click="activeTab = 'reports'"><i class="ti ti-report-analytics"></i> 请求报表</MkButton>
					<MkButton rounded @click="activeTab = 'externalAudit'"><i class="ti ti-shield-check"></i> 外部审核</MkButton>
					<MkButton rounded @click="router.push('/admin/agents-review' as any)"><i class="ti ti-checkbox"></i> 智能体审查</MkButton>
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
				</div>
			</MkFolder>

			<MkFolder v-if="activeTab === 'models'" :defaultOpen="true">
				<template #icon><i class="ti ti-list-details"></i></template>
				<template #label>{{ i18n.ts._agents.adminSectionModels }}</template>
				<div class="_gaps">
					<MkInfo>{{ i18n.ts._agents.adminModelListHint }}</MkInfo>

					<div v-if="form.state.agentLlmModelRows.length === 0" :class="$style.emptyModels">
						{{ i18n.ts._agents.adminModelListEmpty }}
					</div>

					<div v-for="(row, i) in form.state.agentLlmModelRows" :key="i" :class="[$style.modelCard, row.unlisted ? $style.modelCardUnlisted : null]" class="_gaps_s">
						<div :class="$style.modelCardHead">
							<span :class="$style.modelCardTitle">
								{{ i18n.ts._agents.adminModelRowPrefix }} #{{ i + 1 }}
								<span v-if="row.unlisted" :class="$style.unlistedBadge">{{ i18n.ts._agents.adminModelUnlistedBadge }}</span>
							</span>
							<div :class="$style.modelCardActions">
								<button v-if="row.unlisted" type="button" class="_button" :class="$style.iconMuted" :title="i18n.ts._agents.adminModelRelist" @click="toggleUnlist(i, false)">
									<i class="ti ti-eye"></i>
								</button>
								<button v-else type="button" class="_button" :class="$style.iconWarn" :title="i18n.ts._agents.adminModelUnlist" @click="toggleUnlist(i, true)">
									<i class="ti ti-archive"></i>
								</button>
							</div>
						</div>
						<MkInput v-model="row.name" :readonly="row.unlisted">
							<template #label>{{ i18n.ts._agents.modelDisplayName }}</template>
						</MkInput>
						<div v-if="row.id.trim() !== ''" :class="$style.internalIdRow">
							<span :class="$style.internalIdLabel">{{ i18n.ts._agents.fieldModelInternalId }}</span>
							<code :class="$style.internalIdValue">{{ row.id }}</code>
							<p :class="$style.internalIdCaption">{{ i18n.ts._agents.fieldModelInternalIdCaption }}</p>
						</div>
						<MkTextarea v-model="row.description" :readonly="row.unlisted">
							<template #label>{{ i18n.ts._agents.modelDescription }}</template>
						</MkTextarea>
						<MkInput v-model="row.baseUrl" type="text" :readonly="row.unlisted">
							<template #label>{{ i18n.ts._agents.modelBaseUrl }}</template>
							<template #caption>{{ i18n.ts._agents.fieldModelBaseUrlCaption }}</template>
							<template #prefix><i class="ti ti-link"></i></template>
						</MkInput>
						<MkInput v-model="row.apiKey" type="password" :readonly="row.unlisted">
							<template #label>{{ i18n.ts._agents.modelApiKey }}</template>
						</MkInput>
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
						<MkInput v-model="row.costPerCall" type="text" :readonly="row.unlisted">
							<template #label>{{ i18n.ts._agents.modelCostPerCall }}</template>
							<template #caption>{{ i18n.ts._agents.modelCostPerCallCaption }}</template>
							<template #prefix><i class="ti ti-coin"></i></template>
						</MkInput>
					</div>

					<div>
						<MkButton rounded @click="addRow"><i class="ti ti-plus"></i> {{ i18n.ts._agents.addAgentModel }}</MkButton>
					</div>

					<MkSelect v-model="form.state.agentDefaultModelId" :items="defaultModelItems">
						<template #label>{{ i18n.ts._agents.agentDefaultModelId }}</template>
					</MkSelect>
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
						<MkInput v-model="row.baseUrl" type="text">
							<template #label>请求端点</template>
							<template #caption>填写 OpenAI 兼容 Base URL，例如 http://127.0.0.1:8000/v1。</template>
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
						<template #label>外审系统提示词</template>
						<template #caption>要求模型返回 allow/block JSON。留空或点击恢复默认会使用内置审核标准。</template>
					</MkTextarea>
					<div class="_buttons">
						<MkButton rounded @click="restoreExternalAuditPrompt"><i class="ti ti-restore"></i> 恢复默认审核提示词</MkButton>
						<MkButton rounded :disabled="externalAuditStatsLoading" @click="loadExternalAuditStats"><i class="ti ti-refresh"></i> 刷新健康统计</MkButton>
					</div>

					<MkFolder :defaultOpen="true">
						<template #icon><i class="ti ti-chart-bar"></i></template>
						<template #label>最近 1 小时模型统计</template>
						<MkLoading v-if="externalAuditStatsLoading"/>
						<MkInfo v-else-if="externalAuditStats.length === 0">暂无外审模型统计。</MkInfo>
						<div v-else :class="$style.auditStatsTable">
							<div :class="$style.auditStatsHead">
								<span>模型</span><span>状态</span><span>总数</span><span>失败率</span>
							</div>
							<div v-for="row in externalAuditStats" :key="row.id" :class="$style.auditStatsRow">
								<span>{{ row.name }}</span>
								<span>{{ externalAuditStatStatus(row) }}</span>
								<span>{{ row.total }}</span>
								<span>{{ (row.failureRate * 100).toFixed(1) }}%</span>
							</div>
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
					<div v-for="(row, i) in form.state.agentImageModelRows" :key="row.id" :class="$style.modelCard" class="_gaps_s">
						<div :class="$style.modelCardHead">
							<b>{{ row.name.trim() || `生图模型 #${i + 1}` }}</b>
							<button type="button" class="_button" :class="$style.iconWarn" @click="removeImageModel(i)"><i class="ti ti-trash"></i></button>
						</div>
						<FormSplit :minWidth="220">
							<MkInput v-model="row.name"><template #label>显示名称</template></MkInput>
							<MkSelect v-model="row.provider" :items="agentImageProviderItems"><template #label>模型提供商</template></MkSelect>
						</FormSplit>
						<MkSwitch v-model="row.enabled"><template #label>启用</template></MkSwitch>
						<template v-if="row.provider === 'aurora'">
							<FormSplit :minWidth="220">
								<MkInput v-model="row.apiModelName"><template #label>Aurora 上游模型名</template></MkInput>
								<MkInput v-model="row.costPerCall" type="text"><template #label>每张扣费</template></MkInput>
							</FormSplit>
							<MkInput v-model="row.defaultArtistPresetId"><template #label>默认画师串 ID</template></MkInput>
							<MkInfo warn>以下是 Aurora 参数。不了解时保持默认；会话页可在此基础上个性化覆盖。</MkInfo>
							<FormSplit :minWidth="180">
								<MkInput v-model="row.steps" type="text"><template #label>Steps</template></MkInput>
								<MkInput v-model="row.scale" type="text"><template #label>Scale</template></MkInput>
								<MkInput v-model="row.cfgRescale" type="text"><template #label>CFG Rescale</template></MkInput>
							</FormSplit>
							<FormSplit :minWidth="220">
								<MkInput v-model="row.sampler"><template #label>Sampler</template></MkInput>
								<MkInput v-model="row.noiseSchedule"><template #label>Noise Schedule</template></MkInput>
							</FormSplit>
							<MkTextarea v-model="row.promptPrefix"><template #label>Prompt Prefix</template></MkTextarea>
							<MkTextarea v-model="row.promptSuffix"><template #label>Prompt Suffix</template></MkTextarea>
						</template>
					</div>
					<MkButton rounded @click="addImageModel"><i class="ti ti-plus"></i> 添加生图模型</MkButton>
					<div v-if="hasAuroraImageModel" v-panel :class="$style.modelCard" class="_gaps_s">
						<div :class="$style.modelCardHead">
							<b>Aurora 提供商配置</b>
						</div>
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
					<FormSplit :minWidth="180">
						<MkInput v-model="form.state.agentImageMaxPerReply" type="text">
							<template #label>每轮最多图片</template>
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

			<template v-if="activeTab === 'credits'">
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
							<MkButton rounded :disabled="redeemLoading" @click="loadRedeemCodes"><i class="ti ti-refresh"></i> 刷新列表</MkButton>
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
					<template #icon><i class="ti ti-list"></i></template>
					<template #label>{{ i18n.ts._agents.redeemCodesList }}</template>
					<div class="_gaps">
						<FormSplit :minWidth="220">
							<MkSelect v-model="redeemStatus" :items="redeemStatusItems">
								<template #label>{{ i18n.ts._agents.redeemCodesFilterStatus }}</template>
							</MkSelect>
							<MkInput v-model="redeemPageSize" type="number" :min="10" :max="100">
								<template #label>每页数量</template>
							</MkInput>
						</FormSplit>
						<MkLoading v-if="redeemLoading"/>
						<div v-else-if="redeemCodes.length === 0" :class="$style.emptyModels">{{ i18n.ts._agents.redeemCodesEmpty }}</div>
						<div v-else :class="$style.simpleTable">
							<div :class="[$style.simpleRow, $style.simpleHeadRow]">
								<span>{{ i18n.ts._agents.redeemCodesColCode }}</span>
								<span>{{ i18n.ts._agents.redeemCodesAmount }}</span>
								<span>{{ i18n.ts._agents.redeemCodesColStatus }}</span>
								<span>{{ i18n.ts._agents.redeemCodesNote }}</span>
								<span>{{ i18n.ts._agents.redeemCodesColUser }}</span>
								<span>操作</span>
							</div>
							<div v-for="row in redeemCodes" :key="row.id" :class="$style.simpleRow">
								<code>{{ row.code }}</code>
								<span>{{ row.creditAmount }}</span>
								<span>{{ redeemStatusLabel(row.status) }}</span>
								<span>{{ row.note || '—' }}</span>
								<span><MkUserName v-if="row.redeemedBy" :user="row.redeemedBy"/><template v-else>—</template></span>
								<MkButton v-if="row.status === 'available'" small rounded danger @click="revokeRedeemCode(row)"><i class="ti ti-ban"></i> {{ i18n.ts._agents.redeemCodesRevoke }}</MkButton>
							</div>
						</div>
					</div>
				</MkFolder>
			</template>

			<template v-if="activeTab === 'reports'">
				<section :class="$style.reportToolbar">
					<div class="_buttons">
						<MkButton v-for="w in reportWindows" :key="w.value" rounded :primary="reportHours === w.value" @click="setReportWindow(w.value)">{{ w.label }}</MkButton>
					</div>
					<MkButton rounded :disabled="reportsLoading" @click="loadReports"><i class="ti ti-refresh"></i> 刷新</MkButton>
				</section>
				<MkLoading v-if="reportsLoading"/>
				<template v-else-if="reportsData">
					<div :class="$style.overviewGrid">
						<div v-panel :class="$style.overviewCard"><span>总请求</span><b>{{ reportsData.overall.total }}</b></div>
						<div v-panel :class="$style.overviewCard"><span>成功率</span><b>{{ reportSuccessRate }}</b></div>
						<div v-panel :class="$style.overviewCard"><span>失败数</span><b>{{ reportsData.overall.failed }}</b></div>
						<div v-panel :class="$style.overviewCard"><span>总费用</span><b>{{ reportsData.overall.totalCost.toFixed(4) }}</b></div>
						<div v-panel :class="$style.overviewCard"><span>活跃用户</span><b>{{ reportsData.overall.uniqueUsers }}</b></div>
					</div>
					<MkFolder :defaultOpen="true">
						<template #icon><i class="ti ti-cpu"></i></template>
						<template #label>按模型统计</template>
						<div :class="$style.simpleTable">
							<div v-for="m in reportsData.byModel" :key="m.modelId ?? '__null__'" :class="$style.simpleRow">
								<span>
									{{ formatReportModelName(m) }}
									<small v-if="m.modelId && !m.modelName" :class="$style.mutedBlock">ID: {{ m.modelId }}</small>
								</span>
								<span>成功 {{ m.success }}</span>
								<span>失败 {{ m.failed }}</span>
								<span>中断 {{ m.aborted }}</span>
								<span>费用 {{ m.totalCost.toFixed(4) }}</span>
							</div>
						</div>
					</MkFolder>
				</template>
			</template>

			<div v-if="form.modified.value && ['basic', 'models', 'memory', 'compression', 'externalAudit', 'images'].includes(activeTab)" :class="$style.saveBar">
				<MkFormFooter :form="form"/>
			</div>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import type { MkSelectItem } from '@/components/MkSelect.vue';
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
import FormSplit from '@/components/form/split.vue';
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

type ReportsOverview = {
	overall: { total: number; success: number; failed: number; aborted: number; totalCost: number; uniqueUsers: number };
	byModel: { modelId: string | null; modelName: string | null; total: number; success: number; failed: number; aborted: number; totalCost: number; unlisted: boolean }[];
	hourlyBuckets: { bucketStart: string; total: number; success: number; failed: number; aborted: number }[];
};

type AgentLlmModelRow = {
	id: string;
	name: string;
	description: string;
	baseUrl: string;
	apiKey: string;
	apiModelName: string;
	maxContextTokens: string;
	maxOutputTokensPerCall: string;
	unlisted: boolean;
	costPerCall: string;
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
	provider: 'aurora';
	enabled: boolean;
	apiModelName: string;
	costPerCall: string;
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

type AgentExternalAuditModelRow = {
	id: string;
	name: string;
	baseUrl: string;
	apiKey: string;
	apiModelName: string;
	priority: string;
	enabled: boolean;
	autoDisabledAt: string;
	autoDisabledReason: string;
	lastError: string;
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
	failureRate: number;
};

const agentImageProviderItems: MkSelectItem[] = [
	{ value: 'aurora', label: 'Aurora / Naval AI' },
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
		rows.push({
			id: idRaw || genId(),
			name,
			description,
			baseUrl: typeof o.baseUrl === 'string' ? o.baseUrl : '',
			apiKey: typeof o.apiKey === 'string' ? o.apiKey : '',
			apiModelName,
			maxContextTokens: String(numFromMeta(o.maxContextTokens, 8192)),
			maxOutputTokensPerCall: String(numFromMeta(o.maxOutputTokensPerCall, 2048)),
			unlisted: o.unlisted === true,
			costPerCall: typeof o.costPerCall === 'number' && Number.isFinite(o.costPerCall) ? String(o.costPerCall) : '0',
		});
	}
	return rows;
}

function rowIsBlank(row: AgentLlmModelRow): boolean {
	return !row.name.trim() && !row.description.trim() && !row.baseUrl.trim()
		&& !row.apiKey.trim() && !row.apiModelName.trim();
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
			provider: 'aurora',
			enabled: o.enabled !== false,
			apiModelName: typeof o.apiModelName === 'string' ? o.apiModelName : '',
			costPerCall: typeof o.costPerCall === 'number' ? String(o.costPerCall) : '',
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

function initAgentExternalAuditModelRows(): AgentExternalAuditModelRow[] {
	const raw = meta.agentExternalAuditModels;
	if (!Array.isArray(raw)) return [];
	return raw.map((item, i) => {
		const o = (item && typeof item === 'object') ? item as Record<string, unknown> : {};
		return {
			id: typeof o.id === 'string' && o.id ? o.id : genId(),
			name: typeof o.name === 'string' ? o.name : '',
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
	agentDefaultModelId: typeof meta.agentDefaultModelId === 'string' ? meta.agentDefaultModelId : '',
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
	agentExternalAuditEnabled: Boolean(meta.agentExternalAuditEnabled),
	agentExternalAuditModelRows: initAgentExternalAuditModelRows(),
	agentExternalAuditTimeoutMs: String(numFromMeta(meta.agentExternalAuditTimeoutMs, 10000)),
	agentExternalAuditFailureThresholdPercent: String(numFromMeta(meta.agentExternalAuditFailureThresholdPercent, 60)),
	agentExternalAuditFailureMinRequests: String(numFromMeta(meta.agentExternalAuditFailureMinRequests, 10)),
	agentExternalAuditNotifyEmails: typeof meta.agentExternalAuditNotifyEmails === 'string' ? meta.agentExternalAuditNotifyEmails : '',
	agentExternalAuditSystemPrompt: typeof meta.agentExternalAuditSystemPrompt === 'string'
		? meta.agentExternalAuditSystemPrompt
		: (typeof meta.agentExternalAuditSystemPromptResolved === 'string' ? meta.agentExternalAuditSystemPromptResolved : ''),
}, async (state) => {
	type Normalized = {
		id: string;
		name: string;
		description: string | null;
		baseUrl: string;
		apiKey: string;
		apiModelName: string;
		maxContextTokens: number;
		maxOutputTokensPerCall: number;
		unlisted: boolean;
		costPerCall: number;
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
		const apiKey = row.apiKey.trim();
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
		normalized.push({
			id,
			name,
			description: descRaw === '' ? null : descRaw,
			baseUrl,
			apiKey,
			apiModelName,
			maxContextTokens: maxCtx,
			maxOutputTokensPerCall: maxOut,
			unlisted: row.unlisted === true,
			costPerCall: cost,
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
		.filter(row => row.name.trim() !== '' || row.apiModelName.trim() !== '')
		.map((row) => {
			const steps = Math.trunc(Number(row.steps));
			const scale = Number(row.scale);
			const cfgRescale = Number(row.cfgRescale);
			return {
				id: row.id.trim() || genId(),
				name: row.name.trim(),
				provider: row.provider,
				enabled: row.enabled,
				apiModelName: row.apiModelName.trim() === '' ? null : row.apiModelName.trim(),
				costPerCall: row.costPerCall.trim() === '' ? null : Number(row.costPerCall),
				defaultArtistPresetId: row.defaultArtistPresetId.trim() === '' ? null : row.defaultArtistPresetId.trim(),
				defaultParams: {
					steps,
					scale,
					cfgRescale,
					sampler: row.sampler.trim() || 'k_euler_ancestral',
					noiseSchedule: row.noiseSchedule.trim() || 'karras',
					promptPrefix: row.promptPrefix,
					promptSuffix: row.promptSuffix.trim() || 'masterpiece,best quality,very aesthetic,highres,absurdres',
				},
			};
		});
	for (const row of imageModels) {
		if (!row.id || !row.name || !row.provider) throw new Error('invalid image model row');
		if (row.provider === 'aurora' && !row.apiModelName) throw new Error('invalid aurora image model api name');
		if (row.costPerCall != null && (!Number.isFinite(row.costPerCall) || row.costPerCall < 0)) throw new Error('invalid image model cost');
		if (!Number.isFinite(row.defaultParams.steps) || row.defaultParams.steps < 1 || row.defaultParams.steps > 80) throw new Error('invalid image model steps');
		if (!Number.isFinite(row.defaultParams.scale) || row.defaultParams.scale < 0 || row.defaultParams.scale > 30) throw new Error('invalid image model scale');
		if (!Number.isFinite(row.defaultParams.cfgRescale) || row.defaultParams.cfgRescale < 0 || row.defaultParams.cfgRescale > 1) throw new Error('invalid image model cfg rescale');
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
			os.alert({ type: 'error', text: '画师串必须填写 ID 和名称。' });
			throw new Error('invalid image artist preset row');
		}
		if (imageArtistPresetIds.has(row.id)) {
			os.alert({ type: 'error', text: `画师串 ID 重复：${row.id}` });
			throw new Error('duplicate image artist preset id');
		}
		imageArtistPresetIds.add(row.id);
	}
	const imageMaxPerReply = Math.trunc(Number(state.agentImageMaxPerReply));
	const imageCost = Number(state.agentImageCostPerCall);
	const imageMinPoints = Math.trunc(Number(state.agentImageTokenMinPoints));
	const imageTtl = Math.trunc(Number(state.agentImageTokenBalanceTtlSeconds));
	const imageSteps = Math.trunc(Number(state.agentImageSteps));
	const imageScale = Number(state.agentImageScale);
	const imageCfgRescale = Number(state.agentImageCfgRescale);
	if (!Number.isFinite(imageMaxPerReply) || imageMaxPerReply < 0 || imageMaxPerReply > 12) throw new Error('invalid image max per reply');
	if (!Number.isFinite(imageCost) || imageCost < 0) throw new Error('invalid image cost');
	if (!Number.isFinite(imageMinPoints) || imageMinPoints < 0) throw new Error('invalid image min points');
	if (!Number.isFinite(imageTtl) || imageTtl < 0) throw new Error('invalid image ttl');
	if (!Number.isFinite(imageSteps) || imageSteps < 1 || imageSteps > 80) throw new Error('invalid image steps');
	if (!Number.isFinite(imageScale) || imageScale < 0 || imageScale > 30) throw new Error('invalid image scale');
	if (!Number.isFinite(imageCfgRescale) || imageCfgRescale < 0 || imageCfgRescale > 1) throw new Error('invalid image cfg rescale');

	const externalAuditModels = state.agentExternalAuditModelRows
		.filter(row => row.name.trim() !== '' || row.baseUrl.trim() !== '' || row.apiModelName.trim() !== '' || row.apiKey.trim() !== '')
		.map((row, i) => ({
			id: row.id.trim() || genId(),
			name: row.name.trim(),
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
		if (!row.id || !row.name || !row.baseUrl || !row.apiKey || !row.apiModelName) {
			os.alert({ type: 'error', text: '外审模型必须填写模型名、请求端点、API Key 和上游模型名。' });
			throw new Error('invalid external audit model row');
		}
		if (externalAuditIds.has(row.id)) {
			os.alert({ type: 'error', text: `外审模型 ID 重复：${row.id}` });
			throw new Error('duplicate external audit model id');
		}
		externalAuditIds.add(row.id);
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
		agentDefaultModelId: defTrim === '' ? null : defTrim,
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

const listedModelCount = computed(() => form.state.agentLlmModelRows.filter(r => !r.unlisted && r.name.trim() && r.apiModelName.trim()).length);
const hasAuroraImageModel = computed(() => form.state.agentImageModelRows.some(r => r.provider === 'aurora'));
const selectedDefaultModelName = computed(() => {
	const id = form.state.agentDefaultModelId.trim();
	if (!id) return '未设置';
	return form.state.agentLlmModelRows.find(r => r.id.trim() === id)?.name || id;
});

const redeemForm = reactive({
	amount: 10,
	count: 1,
	note: '',
	expiresAt: '',
});
const redeemGenerating = ref(false);
const generatedCodes = ref<{ id: string; code: string; creditAmount: number }[]>([]);
const redeemLoading = ref(false);
const redeemCodes = ref<RedeemCodeRow[]>([]);
const redeemStatus = ref<'available' | 'redeemed' | 'expired' | 'revoked' | 'all'>('available');
const redeemPageSize = ref(30);
const redeemStatusItems: MkSelectItem[] = [
	{ value: 'all', label: '全部' },
	{ value: 'available', label: '可用' },
	{ value: 'redeemed', label: '已兑换' },
	{ value: 'expired', label: '已过期' },
	{ value: 'revoked', label: '已撤销' },
];

const reportWindows = [
	{ label: '24h', value: 24 },
	{ label: '72h', value: 72 },
	{ label: '7 天', value: 168 },
	{ label: '30 天', value: 720 },
];
const reportHours = ref(24);
const reportsLoading = ref(false);
const reportsData = ref<ReportsOverview | null>(null);
const externalAuditStatsLoading = ref(false);
const externalAuditStats = ref<AgentExternalAuditModelStat[]>([]);
const reportSuccessRate = computed(() => {
	const d = reportsData.value;
	if (!d || d.overall.total <= 0) return '—';
	return `${((d.overall.success / d.overall.total) * 100).toFixed(1)}%`;
});

function formatReportModelName(model: ReportsOverview['byModel'][number]): string {
	if (model.modelName) return model.modelName;
	if (model.modelId) return '未知/已删除模型';
	return '默认模型';
}

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
		await loadRedeemCodes();
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	} finally {
		redeemGenerating.value = false;
	}
}

async function loadRedeemCodes() {
	redeemLoading.value = true;
	try {
		const params: Record<string, unknown> = {
			limit: Number(redeemPageSize.value) || 30,
		};
		if (redeemStatus.value !== 'all') params.status = redeemStatus.value;
		redeemCodes.value = await misskeyApi('admin/agents/redeem-codes/list' as any, params) as RedeemCodeRow[];
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	} finally {
		redeemLoading.value = false;
	}
}

async function revokeRedeemCode(row: RedeemCodeRow) {
	const { canceled } = await os.confirm({ type: 'warning', text: `${i18n.ts._agents.redeemCodesRevoke}: ${row.code}` });
	if (canceled) return;
	try {
		await misskeyApi('admin/agents/redeem-codes/revoke' as any, { codeId: row.id });
		os.toast(i18n.ts.done);
		await loadRedeemCodes();
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	}
}

function copyGeneratedCodes() {
	copyToClipboard(generatedCodes.value.map(c => c.code).join('\n'));
}

function redeemStatusLabel(status: RedeemCodeRow['status']) {
	if (status === 'available') return '可用';
	if (status === 'redeemed') return '已兑换';
	if (status === 'expired') return '已过期';
	return '已撤销';
}

async function loadReports() {
	reportsLoading.value = true;
	try {
		reportsData.value = await misskeyApi('admin/agents/reports/overview' as any, { hours: reportHours.value }) as ReportsOverview;
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	} finally {
		reportsLoading.value = false;
	}
}

function setReportWindow(hours: number) {
	reportHours.value = hours;
	void loadReports();
}

function addExternalAuditModel() {
	form.state.agentExternalAuditModelRows.push({
		id: genId(),
		name: '',
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

function clearExternalAuditAutoDisabled(index: number) {
	const row = form.state.agentExternalAuditModelRows[index];
	if (!row) return;
	row.autoDisabledAt = '';
	row.autoDisabledReason = '';
	row.lastError = '';
}

function restoreExternalAuditPrompt() {
	form.state.agentExternalAuditSystemPrompt = typeof meta.agentExternalAuditSystemPromptResolved === 'string'
		? meta.agentExternalAuditSystemPromptResolved
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
	if (row.autoDisabledAt) return '自动禁用';
	if (!row.enabled) return '停用';
	return '启用';
}

function addRow() {
	form.state.agentLlmModelRows.push({
		id: genId(),
		name: '',
		description: '',
		baseUrl: '',
		apiKey: '',
		apiModelName: '',
		maxContextTokens: '8192',
		maxOutputTokensPerCall: '2048',
		unlisted: false,
		costPerCall: '0',
	});
}

async function toggleUnlist(index: number, next: boolean) {
	const row = form.state.agentLlmModelRows[index];
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

function addImageModel() {
	form.state.agentImageModelRows.push({
		id: genId(),
		name: '',
		provider: 'aurora',
		enabled: true,
		apiModelName: form.state.agentImageDefaultModel || 'nai-diffusion-4-5-full',
		costPerCall: form.state.agentImageCostPerCall || '',
		defaultArtistPresetId: form.state.agentImageDefaultArtistPresetId || '',
		steps: form.state.agentImageSteps || '28',
		scale: form.state.agentImageScale || '5',
		cfgRescale: form.state.agentImageCfgRescale || '0',
		sampler: form.state.agentImageSampler || 'k_euler_ancestral',
		noiseSchedule: form.state.agentImageNoiseSchedule || 'karras',
		promptPrefix: form.state.agentImagePromptPrefix || '',
		promptSuffix: form.state.agentImagePromptSuffix || 'masterpiece,best quality,very aesthetic,highres,absurdres',
	});
}

function removeImageModel(index: number) {
	form.state.agentImageModelRows.splice(index, 1);
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
		os.toast('余额已刷新');
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
	key: 'credits',
	title: '额度',
	icon: 'ti ti-ticket',
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
	if (activeTab.value === 'credits') void loadRedeemCodes();
});

watch(activeTab, tab => {
	if (tab === 'overview' && reportsData.value == null) void loadReports();
	if (tab === 'externalAudit' && externalAuditStats.value.length === 0) void loadExternalAuditStats();
	if (tab === 'credits' && redeemCodes.value.length === 0) void loadRedeemCodes();
	if (tab === 'reports' && reportsData.value == null) void loadReports();
});

onMounted(() => {
	void loadReports();
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

.modelCardUnlisted {
	opacity: 0.82;
	background: color-mix(in srgb, var(--MI_THEME-panel) 85%, var(--MI_THEME-warn) 15%);
}

.modelCardActions {
	display: flex;
	gap: 4px;
	align-items: center;
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

.mutedBlock {
	display: block;
	margin-top: 2px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.85em;
}

.reportToolbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	flex-wrap: wrap;
	padding: 12px;
	border-radius: 8px;
	border: 1px solid var(--MI_THEME-divider);
	background: var(--MI_THEME-panel);
}

.auditStatsTable {
	display: grid;
	gap: 8px;
}

.auditStatsHead,
.auditStatsRow {
	display: grid;
	grid-template-columns: minmax(180px, 1.5fr) minmax(90px, 0.8fr) minmax(80px, 0.6fr) minmax(90px, 0.7fr);
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

.auditStatsHead {
	font-weight: 700;
	color: var(--MI_THEME-fgTransparentWeak);
	background: color-mix(in srgb, var(--MI_THEME-panel) 86%, var(--MI_THEME-bg));
	border-color: transparent;
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
	}

	.auditStatsHead {
		display: none;
	}

	.auditStatsRow {
		grid-template-columns: 1fr;
	}

	.simpleHeadRow {
		display: none;
	}

	.generatedHead {
		align-items: flex-start;
		flex-direction: column;
	}
}
</style>
