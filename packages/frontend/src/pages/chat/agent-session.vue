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
							@editRequested="onEditRequested"
							@rollbackRequested="onRollbackRequested"
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

	<div v-else-if="tab === 'memory'" class="_spacer" style="--MI_SPACER-w: 720px;">
		<div v-if="loading" class="_gaps">
			<MkLoading/>
		</div>
		<div v-else :class="['_gaps', $style.memPage]">
			<MkInfo v-if="session == null">{{ i18n.ts.somethingHappened }}</MkInfo>
			<template v-else>
				<div v-panel :class="$style.settingHero">
					<FormSplit :minWidth="280">
						<MkSelect v-model="memProvider" :items="longMemoryProviderItems" :disabled="memSaving || moderationLocksSessionWrites">
							<template #label>{{ i18n.ts._agents.sessionLongMemoryProvider }}</template>
							<template #caption>{{ i18n.ts._agents.sessionLongMemoryProviderCaption }}</template>
						</MkSelect>
					</FormSplit>
					<div v-if="memoryProviderSelectionDirty" :class="$style.memProviderSaveRow">
						<MkButton primary rounded :disabled="memSaving || moderationLocksSessionWrites" @click="saveSessionLongMemoryMode">
							<template v-if="memSaving"><MkLoading :em="true"/></template>
							<template v-else>{{ i18n.ts._agents.saveSessionLongMemoryMode }}</template>
						</MkButton>
					</div>
				</div>
				<MkInfo v-if="longMemoryConfigured && memProvider === 'aliyun'">
					<span :class="$style.sessionMemoryHint">{{ i18n.ts._agents.sessionMemoryHint }}</span>
				</MkInfo>
				<MkInfo v-if="instance.agentLlmConfigured && memProvider === 'compression' && compressionCreditInsufficient" warn>
					<span :class="$style.sessionMemoryHint">{{ i18n.tsx._agents.sessionCompressionInsufficientCredit({ cost: String(expectedCompressionCallCost), balance: String(agentCreditBalance ?? 0) }) }}</span>
				</MkInfo>
				<MkInfo v-if="moderationLocksSessionWrites" warn>{{ moderationBlockUserMessage }}</MkInfo>
				<template v-if="longMemoryConfigured && memProvider === 'aliyun'">
					<MkSwitch v-model="memLongMemoryEnabled" :disabled="memSaving || moderationLocksSessionWrites">
						<template #label>{{ i18n.ts._agents.sessionMemoryEnable }}</template>
					</MkSwitch>
					<div :class="$style.memEnableCaption">{{ i18n.ts._agents.sessionMemoryEnableCaption }}</div>
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
							<template v-else>{{ i18n.ts._agents.sessionMemorySaveAction }}</template>
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
						<div :class="['_gaps', $style.memAddPanel]">
							<MkTextarea v-model="newMemoryText" :disabled="memoryMutating || moderationLocksSessionWrites" tall pre>
								<template #label>{{ i18n.ts._agents.sessionMemoryAddLabel }}</template>
							</MkTextarea>
							<MkButton primary rounded :disabled="memoryMutating || moderationLocksSessionWrites || newMemoryText.trim() === ''" @click="submitNewMemory">
								<template v-if="memoryMutating"><MkLoading :em="true"/></template>
								<template v-else>{{ i18n.ts._agents.sessionMemoryAddSubmit }}</template>
							</MkButton>
						</div>

						<div v-if="memoryNodes.length === 0" class="_note">{{ i18n.ts._agents.sessionMemoryNodesEmpty }}</div>
						<div v-else :class="['_gaps', $style.memNodesList]">
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
										<span v-if="node.updatedAt != null" :class="$style.memTimeChip">{{ formatMemTs(node.updatedAt) }}</span>
										<span v-else-if="node.createdAt != null" :class="$style.memTimeChip">{{ formatMemTs(node.createdAt) }}</span>
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

				<template v-if="memProvider === 'compression' && session.dialogueStyleId">
					<div :class="$style.compressionMemorySheet">
						<MkInfo v-if="memoryProviderSelectionDirty" :class="$style.compressionMemoryNote">{{ i18n.ts._agents.compressionPendingSaveHint }}</MkInfo>
						<FormSplit v-if="instance.agentLlmConfigured" :minWidth="280">
							<MkSelect
								v-model="memCompressionModelId"
								:items="compressionModelSelectItems"
								:disabled="memSaving || moderationLocksSessionWrites"
							>
								<template #label>{{ i18n.ts._agents.compressionModelForSession }}</template>
							</MkSelect>
						</FormSplit>
						<p v-if="instance.agentLlmConfigured" :class="$style.compressionBillingNote">{{ i18n.ts._agents.compressionModelSessionBillingLine }}</p>
						<MkInfo v-if="compressionOverview && compressionOverview.historyBudgetTokens === 0" warn :class="$style.compressionMemoryNote">{{ i18n.ts._agents.compressionOverviewZeroHistoryBudget }}</MkInfo>
						<MkFolder :defaultOpen="false">
							<template #icon><i class="ti ti-bookmarks"></i></template>
							<template #label>
								<span>{{ i18n.ts._agents.compressionStickyTitle }}</span>
								<template v-if="compressionOverview"><span :class="$style.compressionCountMuted"> · {{ compressionOverview.stickies.length }}</span></template>
							</template>
							<template #caption>{{ i18n.ts._agents.compressionStickyFolderCaption }}</template>
							<template #suffix>
								<button type="button" class="_button" :disabled="compressionOverviewLoading" :title="i18n.ts.reload" @click.stop="() => { void loadCompressionOverview(); }">
									<i class="ti ti-refresh"/>
								</button>
							</template>
							<div v-if="compressionOverviewLoading" class="_gaps">
								<MkLoading/>
							</div>
							<template v-else-if="compressionOverview">
								<div v-if="compressionOverview.stickies.length === 0" :class="$style.compressionEmptyHint">{{ i18n.ts._agents.compressionStickyEmpty }}</div>
								<div v-else :class="$style.compressionStickyList">
									<div
										v-for="(st, stIdx) in compressionOverview.stickies"
										:key="st.id"
										:class="$style.compressionStickyCard"
									>
										<div :class="$style.compressionStickyCardHead">
											<span :class="$style.compressionStatePill" :data-state="st.state">{{ compressionStateLabel(st.state) }}</span>
											<span v-if="st.userOverridden" :class="$style.compressionUserTag">{{ i18n.ts._agents.compressionStickyUserEdited }}</span>
										</div>
										<div :class="$style.compressionRangeRow">
											<button type="button" :class="$style.compressionEndChip" @click="jumpToChatMessage(st.fromMessageId)">
												<span :class="$style.compressionEndLabel">{{ i18n.ts._agents.compressionStickyFrom }}</span>
												<span :class="$style.compressionEndText">{{ messageBandPlainPreview(st.fromMessagePreview ?? '') }}</span>
											</button>
											<span :class="$style.compressionRangeArrow" aria-hidden="true">→</span>
											<button type="button" :class="$style.compressionEndChip" @click="jumpToChatMessage(st.toMessageId)">
												<span :class="$style.compressionEndLabel">{{ i18n.ts._agents.compressionStickyTo }}</span>
												<span :class="$style.compressionEndText">{{ messageBandPlainPreview(st.toMessagePreview ?? '') }}</span>
											</button>
										</div>
										<div v-if="compressionStickyErrorText(st.errorMessage)" :class="$style.compressionError">{{ compressionStickyErrorText(st.errorMessage) }}</div>
										<div v-if="editingCompressionStickyId === st.id" class="_gaps">
											<MkTextarea v-model="editingCompressionStickyText" :disabled="compressionStickyMutating || moderationLocksSessionWrites" tall pre/>
											<div :class="$style.compressionStickyToolbar">
												<MkButton rounded small :disabled="compressionStickyMutating || moderationLocksSessionWrites" @click="cancelEditCompressionSticky">{{ i18n.ts.cancel }}</MkButton>
												<MkButton primary rounded small :disabled="compressionStickyMutating || moderationLocksSessionWrites" @click="submitEditCompressionSticky(st.id)">
													<template v-if="compressionStickyMutating"><MkLoading :em="true"/></template>
													<template v-else>{{ i18n.ts.save }}</template>
												</MkButton>
											</div>
										</div>
										<template v-else>
											<div :class="$style.compressionStickySummary">{{ st.summaryText }}</div>
											<div :class="$style.compressionStickyToolbar">
												<MkButton rounded small :disabled="compressionStickyMutating || moderationLocksSessionWrites || stIdx === 0" :title="i18n.ts._agents.compressionStickyMoveUp" @click="moveCompressionSticky(st.id, -1)">
													<i class="ti ti-chevron-up"/>
												</MkButton>
												<MkButton rounded small :disabled="compressionStickyMutating || moderationLocksSessionWrites || stIdx >= compressionOverview.stickies.length - 1" :title="i18n.ts._agents.compressionStickyMoveDown" @click="moveCompressionSticky(st.id, 1)">
													<i class="ti ti-chevron-down"/>
												</MkButton>
												<MkButton rounded small danger :disabled="compressionStickyMutating || moderationLocksSessionWrites" @click="confirmDeleteCompressionSticky(st.id)">
													{{ i18n.ts.delete }}
												</MkButton>
												<MkButton rounded small :disabled="compressionStickyMutating || moderationLocksSessionWrites" @click="startEditCompressionSticky(st)">
													{{ i18n.ts.edit }}
												</MkButton>
											</div>
										</template>
									</div>
								</div>
							</template>
							<div v-else-if="!compressionOverviewLoading" :class="$style.compressionOverviewFail">
								<span>{{ i18n.ts._agents.compressionOverviewLoadFailed }}</span>
								<MkButton rounded small @click="loadCompressionOverview">{{ i18n.ts._agents.compressionOverviewRetry }}</MkButton>
							</div>
						</MkFolder>
						<template v-if="compressionOverview && compressionOverview.messages.length">
							<div :class="$style.compressionBandsSection">
								<button
									type="button"
									:class="$style.compressionBandsHeader"
									:aria-expanded="compressionBandsOpen"
									@click="compressionBandsOpen = !compressionBandsOpen"
								>
									<i :class="['ti', compressionBandsOpen ? 'ti-chevron-up' : 'ti-chevron-down', $style.compressionBandsChevron]" aria-hidden="true"></i>
									<span :class="$style.compressionBandsTitleBlock">
										<span :class="$style.compressionBandsTitle">{{ i18n.ts._agents.compressionMessageBands }}</span>
										<span :class="$style.compressionBandsSubtitle">{{ i18n.ts._agents.compressionMessageBandsSubtitle }}</span>
									</span>
								</button>
								<div v-if="compressionBandsOpen && compressionBandScaleCaption" :class="$style.compressionBandScaleInline">{{ compressionBandScaleCaption }}</div>
								<p v-if="compressionBandsOpen && compressionBandLegendLine" :class="$style.compressionBandsFootnote">{{ compressionBandLegendLine }}</p>
								<div v-show="compressionBandsOpen" :class="$style.compressionBandGroups">
									<div
										v-for="block in compressionMessageBandBlocks"
										:key="block.band"
										:class="$style.compressionBandGroup"
									>
										<div :class="$style.compressionBandGroupTitle">{{ block.title }}</div>
										<div :class="$style.compressionMessageTable">
											<template v-for="(row, ridx) in block.rows" :key="row.kind === 'msg' ? row.m.id : `omit-${block.band}-${ridx}`">
												<div
													v-if="row.kind === 'msg'"
													:class="[$style.compressionMsgRow, $style.compressionMsgRowClickable]"
													role="button"
													tabindex="0"
													@click="jumpToChatMessage(row.m.id)"
													@keydown.enter.prevent="jumpToChatMessage(row.m.id)"
													@keydown.space.prevent="jumpToChatMessage(row.m.id)"
												>
													<div :class="$style.compressionMsgRowTop">
														<span :class="[$style.compressionMsgRolePill, row.m.role === 'user' ? $style.compressionMsgRoleUser : $style.compressionMsgRoleAsst]">{{ messageRoleLabel(row.m.role) }}</span>
														<span v-if="row.m.compressed" :class="$style.compressionMsgBadgeCompressed">{{ i18n.ts._agents.compressionMessageCompressed }}</span>
													</div>
													<div :class="$style.compressionMsgPreview">{{ messageBandPlainPreview(row.m.contentPreview) }}</div>
													<div :class="$style.compressionMsgTokenMeta">{{ compressionMsgTokensLabel(row.m) }}</div>
												</div>
												<div v-else :class="$style.compressionMsgOmitRow">
													<span :class="$style.compressionOmitDots">···</span>
													<span :class="$style.compressionOmitHint">{{ i18n.ts._agents.compressionBandOmitted.replace('{n}', String(row.hidden)) }}</span>
												</div>
											</template>
										</div>
									</div>
								</div>
							</div>
						</template>
					</div>
				</template>
				<MkInfo v-else-if="memProvider === 'compression'" warn>{{ i18n.ts._agents.compressionNeedDialogueStyle }}</MkInfo>

				<div :class="[$style.memContextDividerRow, $style.memToolbar, $style.memContextDividerBeforePorter]">
					<MkButton
						rounded
						:primary="canLocateContextDivider"
						:disabled="!canLocateContextDivider"
						v-tooltip="contextDividerButtonTooltip"
						@click="scrollToContextWindowDivider"
					>
						<i class="ti ti-messages"/>
						{{ i18n.ts._agents.sessionMemoryLocateContextDivider }}
					</MkButton>
				</div>
				<hr :class="$style.memDivider">
				<div :class="[$style.memContextPorter, $style.memPorterPanel]">
					<div :class="$style.memContextPorterLabel">{{ i18n.ts._agents.sessionMemoryContextPorterTitle }}</div>
					<div :class="$style.memContextPorterActions">
						<MkButton rounded :wait="contextExporting" :disabled="contextExporting" @click="exportSessionContext">
							<i class="ti ti-download"/>
							{{ i18n.ts._agents.sessionMemoryExportContext }}
						</MkButton>
						<MkButton rounded :wait="contextImporting" :disabled="contextImporting || moderationLocksSessionWrites" @click="openContextImportFileDialog">
							<i class="ti ti-upload"/>
							{{ i18n.ts._agents.sessionMemoryImportContext }}
						</MkButton>
						<input
							ref="contextImportInputEl"
							type="file"
							accept="application/json,.json"
							style="display: none;"
							@change="onContextImportFileChange"
						>
					</div>
					<MkInfo warn>{{ i18n.ts._agents.sessionMemoryImportContextHint }}</MkInfo>
				</div>
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
					<div v-panel :class="$style.settingHero">
						<div :class="$style.settingTitleRow">
							<span :class="$style.settingLabel">{{ i18n.ts._agents.sessionDialogueStyle }}</span>
							<span :class="$style.settingValue">{{ selectedStyleMeta?.name ?? (session.dialogueStyleId ? '-' : i18n.ts._agents.sessionStyleNotSelected) }}</span>
						</div>
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
									<span :class="$style.stylePlazaLabel"><i class="ti ti-message-cog"/> {{ i18n.ts._agents.plazaMetricAiReplies }}</span>
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
					<div v-panel :class="[$style.settingHero, $style.modelHeroCompact]">
						<div :class="$style.modelHeroSummary">
							<span :class="$style.modelHeroSummaryItem">
								<span :class="$style.settingLabel">{{ i18n.ts._agents.sessionModel }}</span>
								<span :class="$style.modelHeroSummaryValue">{{ selectedModelMeta?.name ?? '-' }}</span>
							</span>
							<span v-if="agentCreditBalance != null" :class="$style.modelHeroSummaryItem">
								<span :class="$style.settingLabel">{{ i18n.ts._agents.myStatsCreditBalance }}</span>
								<span :class="$style.modelHeroSummaryValue"><MkNumber :value="agentCreditBalance" :tween="false"/></span>
							</span>
							<span v-if="expectedCallCostForSession > 0" :class="$style.modelHeroSummaryItem">
								<span :class="$style.settingLabel">{{ i18n.ts._agents.sessionModelExpectedCost }}</span>
								<span :class="$style.modelHeroSummaryValue">{{ expectedCallCostForSession.toLocaleString() }}</span>
							</span>
						</div>
					</div>
					<div :class="$style.selectCardList">
						<div
							v-for="m in agentModels"
							:key="m.id"
							v-panel
							:class="[$style.selectCard, $style.modelSelectCard, modelCardSelectionId === m.id ? $style.selectCardActive : '']"
						>
							<div :class="[$style.selectCardMain, $style.modelSelectCardMain]">
								<div :class="[$style.selectCardHead, $style.modelSelectCardHead]">
									<div :class="$style.selectCardTitleWrap">
										<div :class="$style.modelSelectCardTitle">{{ m.name }}</div>
										<div :class="$style.modelMetaChips" :aria-label="i18n.ts._agents.sessionModel" role="list">
											<span
												:class="$style.modelMetaChip"
												:title="i18n.ts._agents.maxContextTokens"
												role="listitem"
											>
												<i class="ti ti-stack-2" :class="$style.modelMetaChipIcon" aria-hidden="true"/>
												<span :class="$style.modelMetaChipKicker">{{ i18n.ts._agents.modelRowLabelContext }}</span>
												<span :class="$style.modelMetaChipVal">{{ formatTokenCountCompact(m.maxContextTokens) }}</span>
											</span>
											<span
												:class="$style.modelMetaChip"
												:title="i18n.ts._agents.maxOutputTokens"
												role="listitem"
											>
												<i class="ti ti-message-2" :class="$style.modelMetaChipIcon" aria-hidden="true"/>
												<span :class="$style.modelMetaChipKicker">{{ i18n.ts._agents.modelRowLabelOutput }}</span>
												<span :class="$style.modelMetaChipVal">{{ formatTokenCountCompact(m.maxOutputTokensPerCall) }}</span>
											</span>
											<span
												:class="$style.modelMetaChip"
												:title="i18n.ts._agents.modelCostPerCall"
												role="listitem"
											>
												<i class="ti ti-coin" :class="$style.modelMetaChipIcon" aria-hidden="true"/>
												<span :class="$style.modelMetaChipKicker">{{ i18n.ts._agents.modelRowLabelCost }}</span>
												<span
													:class="[
														$style.modelMetaChipVal,
														typeof m.costPerCall === 'number' && m.costPerCall === 0
															? $style.modelMetaChipValHighlight
															: '',
													]"
												>{{ formatModelCostPerCall(m.costPerCall) }}</span>
											</span>
											<span
												:class="$style.modelMetaChip"
												:title="i18n.ts._agents.successRate1h"
												role="listitem"
											>
												<i class="ti ti-chart-line" :class="$style.modelMetaChipIcon" aria-hidden="true"/>
												<span :class="$style.modelMetaChipKicker">{{ i18n.ts._agents.modelRowLabelSuccess1h }}</span>
												<template v-if="modelSuccessRates[m.id] && modelSuccessRates[m.id].total > 0">
													<span :class="[...getSuccessRateClassNameModelRow(modelSuccessRates[m.id].success, modelSuccessRates[m.id].total), $style.modelMetaChipValLong]">
														{{ getSuccessRatePercentage(modelSuccessRates[m.id].success, modelSuccessRates[m.id].total) }}% ({{ modelSuccessRates[m.id].success }}/{{ modelSuccessRates[m.id].total }})
													</span>
												</template>
												<span v-else :class="[$style.modelMetaChipVal, $style.modelMetaChipValMuted]">{{ i18n.ts._agents.noDataAvailable }}</span>
											</span>
										</div>
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
								<p v-if="m.description" :class="$style.modelDescClamp">{{ m.description }}</p>
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
			<div v-if="compressionSidecarHintVisible" :class="$style.memAddHint" role="status">
				<i class="ti ti-loader-2" :class="$style.memAddHintIcon"></i>
				<span>{{ i18n.ts._agents.compressionSidecarScheduledHint }}</span>
			</div>
			<XForm ref="formRef" :class="$style.form" :disabled="formDisabled" :sending="sending || editSaving" :editing="editingForForm" @submit="onFormSubmit" @cancelEdit="cancelEditingMessage" @abort="onAbortRequest"/>
		</div>
	</template>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useCssModule, useTemplateRef, watch } from 'vue';
import { getScrollContainer } from '@@/js/scroll.js';
import MkLoading from '@/components/global/MkLoading.vue';
import MkAvatar from '@/components/global/MkAvatar.vue';
import MkUserName from '@/components/global/MkUserName.vue';
import MkTime from '@/components/global/MkTime.vue';
import MkNumber from '@/components/MkNumber.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkInput from '@/components/MkInput.vue';
import MkButton from '@/components/MkButton.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkSelect, { type MkSelectItem } from '@/components/MkSelect.vue';
import FormSplit from '@/components/form/split.vue';
import MkFolder from '@/components/MkFolder.vue';
import { formatDateTimeString } from '@/utility/format-time-string.js';
import { misskeyApi, formatApiError } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import * as os from '@/os.js';
import type { PageHeaderItem } from '@/types/page-header.js';
import { fetchInstance, instance } from '@/instance.js';
import { useRouter } from '@/router.js';
import { makeDateSeparatedTimelineComputedRef, type DateSeparetedTimelineItem } from '@/utility/timeline-date-separate.js';
import { useMutationObserver } from '@/composables/use-mutation-observer.js';
import { prefer } from '@/preferences.js';
import XAgentMessage from './agent-session.message.vue';
import XForm from './agent-session.form.vue';
import XAgentSearch from './agent-session.search.vue';
import type { AgentsStylesListUsableResponse } from 'misskey-js/entities.js';

const agentSessionCss = useCssModule();

const props = defineProps<{
	sessionId: string;
	messageId?: string;
}>();
const sessionId = props.sessionId;
const router = useRouter();

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
	id: string;
	name: string;
	sessionKind: 'draft_test' | 'community';
	dialogueStyleId: string | null;
	agentModelId: string | null;
	agentCompressionModelId?: string | null;
	characterId: string;
	agentLongMemoryEnabled?: boolean;
	agentLongMemoryTopK?: number;
	agentLongMemoryMinScore?: number | null;
	agentLongMemoryInjectMaxChars?: number;
	agentLongMemoryAddMaxRounds?: number | null;
	agentLongMemoryAddEveryNRounds?: number | null;
	agentLongMemoryProvider?: 'none' | 'aliyun' | 'compression';
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
const memLongMemoryEnabled = ref(false);
const memTopK = ref('8');
const memMinScore = ref('');
const memInject = ref('4000');
const memAddMaxRounds = ref('');
const memAddEveryN = ref('');

const memProvider = ref<'none' | 'aliyun' | 'compression'>('none');
/** 记忆页为便签摘要选择的会话模型，与会话字段 `agentCompressionModelId` 一致 */
const memCompressionModelId = ref('');
const longMemoryProviderItems = computed((): { value: 'none' | 'aliyun' | 'compression'; label: string }[] => {
	const items: { value: 'none' | 'aliyun' | 'compression'; label: string }[] = [
		{ value: 'none', label: i18n.ts._agents.sessionLongMemoryProviderNone },
	];
	if (instance.agentLlmConfigured === true) {
		items.push({ value: 'compression', label: i18n.ts._agents.sessionLongMemoryProviderCompression });
	}
	if (longMemoryConfigured.value) {
		items.push({ value: 'aliyun', label: i18n.ts._agents.sessionLongMemoryProviderAliyun });
	}
	const needAliyunOrphan = !items.some(x => x.value === 'aliyun')
		&& (memProvider.value === 'aliyun' || session.value?.agentLongMemoryProvider === 'aliyun');
	if (needAliyunOrphan) {
		items.push({
			value: 'aliyun',
			label: i18n.ts._agents.sessionLongMemoryProviderAliyunSavedButUnavailable,
		});
	}
	const needCompressionOrphan = !items.some(x => x.value === 'compression')
		&& (memProvider.value === 'compression' || session.value?.agentLongMemoryProvider === 'compression');
	if (needCompressionOrphan) {
		items.push({
			value: 'compression',
			label: i18n.ts._agents.sessionLongMemoryProviderCompressionSavedButUnavailable,
		});
	}
	return items;
});

const memoryProviderSelectionDirty = computed(() => {
	const s = session.value;
	if (s == null) return false;
	const raw = s.agentLongMemoryProvider;
	const saved: 'none' | 'aliyun' | 'compression' =
		raw === 'none' || raw === 'aliyun' || raw === 'compression' ? raw : 'none';
	return memProvider.value !== saved;
});

type CompressionOverviewPayload = {
	historyBudgetTokens: number;
	t1Tokens: number;
	t2Tokens: number;
	t1Ratio: number;
	t2Ratio: number;
	messages: { id: string; role: string; messageTokens?: number; dFromNewTokens: number; band: string; contentPreview: string; compressed: boolean }[];
	stickies: {
		id: string;
		createdAt: string;
		updatedAt: string;
		fromMessageId: string;
		toMessageId: string;
		fromMessagePreview?: string;
		toMessagePreview?: string;
		summaryText: string;
		state: string;
		userOverridden: boolean;
		sourceFingerprint: string | null;
		errorMessage: string | null;
		lastModelId: string | null;
		sortIndex: number;
	}[];
};

const compressionOverview = ref<CompressionOverviewPayload | null>(null);
const compressionOverviewLoading = ref(false);
const compressionBandsOpen = ref(false);

type CompressionBandRow =
	| { kind: 'msg'; m: CompressionOverviewPayload['messages'][0] }
	| { kind: 'ellipsis'; hidden: number };

/** 消息区带过长时首尾各保留的条数（各 2 轮对话 ≈ 4 条 user+assistant） */
const COMPRESSION_BAND_EDGE_COUNT = 4;

const compressionMessageBandBlocks = computed((): { band: string; title: string; rows: CompressionBandRow[] }[] => {
	const o = compressionOverview.value;
	if (o == null) return [];
	const order = ['new', 'prep', 'staged', 'out'] as const;
	const by: Record<string, typeof o.messages> = { new: [], prep: [], staged: [], out: [] };
	for (const m of o.messages) {
		if (m.band in by) by[m.band]!.push(m);
	}
	const edge = COMPRESSION_BAND_EDGE_COUNT;
	const fullMax = edge * 2;
	const blocks: { band: string; title: string; rows: CompressionBandRow[] }[] = [];
	for (const band of order) {
		const list = by[band] ?? [];
		if (list.length === 0) continue;
		const title = compressionBandGroupTitle(band);
		const rows: CompressionBandRow[] = [];
		if (list.length <= fullMax) {
			for (const m of list) rows.push({ kind: 'msg', m });
		} else {
			for (const m of list.slice(0, edge)) rows.push({ kind: 'msg', m });
			rows.push({ kind: 'ellipsis', hidden: list.length - fullMax });
			for (const m of list.slice(list.length - edge, list.length)) rows.push({ kind: 'msg', m });
		}
		blocks.push({ band, title, rows });
	}
	return blocks;
});
const editingCompressionStickyId = ref<string | null>(null);
const editingCompressionStickyText = ref('');
const compressionStickyMutating = ref(false);

const compressionBandLegendLine = computed((): string => {
	const o = compressionOverview.value;
	if (o == null || o.historyBudgetTokens === 0) return '';
	return i18n.ts._agents.compressionBandLegend;
});

const compressionBandScaleCaption = computed((): string => {
	const o = compressionOverview.value;
	if (o == null || o.historyBudgetTokens === 0) return '';
	return i18n.tsx._agents.compressionBandScaleCaption({
		h: String(o.historyBudgetTokens),
		t1: String(o.t1Tokens),
		t2: String(o.t2Tokens),
	});
});

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

const longMemoryConfigured = computed(() => Boolean((instance as Record<string, unknown>).agentLongMemoryConfigured));
const showLongMemoryTab = computed(() => true);

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

/** 编辑既有消息不需要对话风格，因此编辑模式下放宽禁用条件。 */
const formDisabled = computed(() => {
	if (loading.value || chatInitializing.value || session.value == null) return true;
	if (moderationLocksSessionWrites.value) return true;
	if (editingMessage.value != null) return false;
	return chatComposeDisabled.value;
});

const memoryAddHintVisible = ref(false);
let memoryAddHintTimer: number | null = null;
const compressionSidecarHintVisible = ref(false);
let compressionLlmPollGen = 0;
let compressionLlmPollTimeout: number | null = null;

const editingMessage = ref<{ id: string; role: string; originalContent: string } | null>(null);
const editSaving = ref(false);

const modelSuccessRates = ref<Record<string, { success: number; total: number }>>({});

const editingForForm = computed(() => {
	if (editingMessage.value == null) return null;
	const preview = editingMessage.value.originalContent.replace(/\s+/g, ' ').trim().slice(0, 80);
	return { id: editingMessage.value.id, preview };
});

function onEditRequested(payload: { id: string; role: string; content: string }) {
	if (moderationLocksSessionWrites.value) {
		os.alert({ type: 'info', text: moderationBlockUserMessage.value });
		return;
	}
	editingMessage.value = {
		id: payload.id,
		role: payload.role,
		originalContent: payload.content,
	};
	void nextTick(() => {
		formRef.value?.setText(payload.content);
		formRef.value?.focus();
	});
}

function cancelEditingMessage() {
	editingMessage.value = null;
	formRef.value?.clearText();
}

async function onRollbackRequested(payload: { id: string; content: string }) {
	if (moderationLocksSessionWrites.value) {
		os.alert({ type: 'info', text: moderationBlockUserMessage.value });
		return;
	}
	if (sending.value || session.value?.agentReplyPending) {
		os.alert({ type: 'info', text: i18n.ts._agents.replyStillGenerating });
		return;
	}
	const anchor = messages.value.find(m => m.id === payload.id);
	if (!anchor) return;
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.ts._agents.rollbackConfirm,
	});
	if (canceled) return;
	try {
		await (misskeyApi as unknown as (
			endpoint: 'agents/messages/rollback',
			data: { sessionId: string; messageId: string },
		) => Promise<{ deletedCount: number; content: string }>)(
			'agents/messages/rollback',
			{ sessionId, messageId: payload.id },
		);
		// 消息按 createdAt 降序存储，回溯即删除锚点及其之后（时间戳更新）的条目
		const anchorTs = new Date(anchor.createdAt).getTime();
		messages.value = messages.value.filter(m => {
			const ts = new Date(m.createdAt).getTime();
			if (ts > anchorTs) return false;
			if (m.id === anchor.id) return false;
			return true;
		});
		if (editingMessage.value != null) cancelEditingMessage();
		formRef.value?.setText(payload.content);
		void nextTick(() => formRef.value?.focus());
		os.toast(i18n.ts._agents.rollbackDone);
		void refreshContextWindow();
		void loadSession();
	} catch (e) {
		os.alert({ type: 'error', text: formatApiError(e) });
		try { await loadInitialTimeline(); } catch { /* ignore */ }
	}
}

async function saveEditingMessage(text: string) {
	const target = editingMessage.value;
	if (target == null) return;
	const content = text.trim();
	if (!content) {
		os.alert({ type: 'error', text: i18n.ts._agents.editMessageEmpty });
		return;
	}
	if (content === target.originalContent) {
		cancelEditingMessage();
		return;
	}
	editSaving.value = true;
	try {
		// 自动生成的 misskey-js 类型尚未包含本端点，运行时仍走标准 API 通道。
		const updated = await (misskeyApi as unknown as (
			endpoint: 'agents/messages/update',
			data: { sessionId: string; messageId: string; content: string },
		) => Promise<{ id: string; role: string; content: string; createdAt: string }>)(
			'agents/messages/update',
			{ sessionId, messageId: target.id, content },
		);
		const idx = messages.value.findIndex(m => m.id === target.id);
		if (idx !== -1) {
			messages.value[idx] = {
				...messages.value[idx]!,
				content: updated.content,
			};
		}
		os.toast(i18n.ts._agents.editingMessageSaved);
		cancelEditingMessage();
	} catch (e) {
		os.alert({ type: 'error', text: formatApiError(e) });
	} finally {
		editSaving.value = false;
	}
}

const contextWindowTruncated = ref(false);
const contextWindowBoundaryId = ref<string | null>(null);
const highlightedContextDivider = ref(false);
let contextDividerHighlightTimer: number | null = null;

const canLocateContextDivider = computed(() => {
	if (!contextWindowTruncated.value) return false;
	const b = contextWindowBoundaryId.value;
	return b != null && b !== '';
});

const contextDividerButtonTooltip = computed((): string | undefined => {
	if (canLocateContextDivider.value) return undefined;
	return i18n.ts._agents.sessionMemoryLocateContextDividerDisabled;
});

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
const contextImportInputEl = useTemplateRef<HTMLInputElement>('contextImportInputEl');
const contextExporting = ref(false);
const contextImporting = ref(false);

const agentModels = computed(() => {
	const raw = (instance as Record<string, unknown>).agentModels;
	if (!raw || !Array.isArray(raw)) return [] as {
		id: string;
		name: string;
		description: string | null;
		maxContextTokens: number;
		maxOutputTokensPerCall: number;
		costPerCall: number;
	}[];
	return raw as {
		id: string;
		name: string;
		description: string | null;
		maxContextTokens: number;
		maxOutputTokensPerCall: number;
		costPerCall: number;
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

const resolvedSiteCompressionDefaultModelId = computed(() => {
	const raw = (instance as Record<string, unknown>).agentCompressionDefaultModelId;
	if (typeof raw === 'string' && raw.trim() !== '' && agentModels.value.some(m => m.id === raw.trim())) {
		return raw.trim();
	}
	return resolvedInstanceDefaultModelId.value;
});

/** 记忆页展示用：会话里保存的模型若仍在列表中则用保存值，否则用站点压缩默认 */
function displayCompressionModelIdForSession(stored: string | null | undefined): string {
	const t = typeof stored === 'string' ? stored.trim() : '';
	if (t && agentModels.value.some(m => m.id === t)) return t;
	const fb = resolvedSiteCompressionDefaultModelId.value;
	if (fb !== '') return fb;
	return agentModels.value[0]?.id ?? '';
}

const compressionModelSelectItems = computed((): MkSelectItem[] => {
	const items: MkSelectItem[] = [];
	for (const m of agentModels.value) {
		items.push({ value: m.id, label: m.name });
	}
	const cur = memCompressionModelId.value.trim();
	if (cur && !agentModels.value.some(m => m.id === cur)) {
		items.push({ value: cur, label: `${cur} (${i18n.ts._agents.compressionModelOrphanLabel})` });
	}
	return items;
});

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

/** 主对话单次扣点示意：按会话当前模型单价换算 */
const expectedCallCostForSession = computed(() => {
	if (!session.value) return 0;
	const id = displayModelIdForSession(session.value.agentModelId);
	if (!id) return 0;
	const m = agentModels.value.find(x => x.id === id);
	const c = m?.costPerCall;
	if (typeof c === 'number' && Number.isFinite(c)) return Math.max(0, c);
	if (c != null && Number.isFinite(Number(c))) return Math.max(0, Number(c));
	return 0;
});

/** 便签摘要单次扣点示意：按会话实际采用的压缩模型单价换算 */
const effectiveCompressionModelIdForCost = computed((): string => {
	if (memProvider.value !== 'compression') return '';
	const id = memCompressionModelId.value.trim();
	if (id && agentModels.value.some(m => m.id === id)) return id;
	return resolvedSiteCompressionDefaultModelId.value;
});

const expectedCompressionCallCost = computed((): number => {
	if (memProvider.value !== 'compression') return 0;
	if (!instance.agentLlmConfigured) return 0;
	const id = effectiveCompressionModelIdForCost.value;
	if (!id) return 0;
	const m = agentModels.value.find(x => x.id === id);
	const c = m?.costPerCall;
	if (typeof c === 'number' && Number.isFinite(c)) return Math.max(0, c);
	if (c != null && Number.isFinite(Number(c))) return Math.max(0, Number(c));
	return 0;
});

const compressionCreditInsufficient = computed((): boolean => {
	if (expectedCompressionCallCost.value <= 0) return false;
	if (agentCreditBalance.value == null) return false;
	return agentCreditBalance.value < expectedCompressionCallCost.value;
});

const agentCreditBalance = ref<number | null>(null);

async function loadAgentCreditBalance() {
	try {
		const r = await misskeyApi('agents/credit-balance' as any, {}) as { creditBalance: number };
		agentCreditBalance.value = r.creditBalance;
	} catch {
		agentCreditBalance.value = null;
	}
}

function formatTokenCount(value: unknown): string {
	const n = typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(n)) {
		return '—';
	}
	return `${Math.max(0, Math.trunc(n)).toLocaleString()} tokens`;
}

/** 模型列表行内展示用（无单位后缀，缩短数字） */
function formatTokenCountCompact(value: unknown): string {
	const n = typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(n)) {
		return '—';
	}
	const t = Math.max(0, Math.trunc(n));
	if (t >= 1_000_000) {
		const m = t / 1_000_000;
		const s = m >= 10 ? String(Math.round(m)) : String(Math.round(m * 10) / 10).replace(/\.0$/, '');
		return `${s}M`;
	}
	if (t >= 1000) {
		const k = t / 1000;
		const rounded = k >= 100 ? Math.round(k) : Math.round(k * 10) / 10;
		const s = String(rounded).replace(/\.0$/, '');
		return `${s}k`;
	}
	return String(t);
}

function formatModelCostPerCall(value: unknown): string {
	const n = typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(n) || n < 0) {
		return '—';
	}
	if (n === 0) {
		return i18n.ts._agents.modelCostPerCallValueFree;
	}
	return n.toLocaleString();
}

function getSuccessRatePercentage(success: number, total: number): string {
	if (total === 0) return '—';
	const percentage = (success / total) * 100;
	return Math.round(percentage).toFixed(0);
}

function getSuccessRateClass(success: number, total: number): string {
	if (total === 0) return '';
	const percentage = (success / total) * 100;
	if (percentage >= 90) return 'successRateHigh';
	if (percentage >= 70) return 'successRateMedium';
	return 'successRateLow';
}

function getSuccessRateClassNameModelRow(success: number, total: number) {
	const className = getSuccessRateClass(success, total);
	if (className === 'successRateHigh') return [agentSessionCss.successRateHigh, agentSessionCss.modelMetaChipVal];
	if (className === 'successRateMedium') return [agentSessionCss.successRateMedium, agentSessionCss.modelMetaChipVal];
	return [agentSessionCss.successRateLow, agentSessionCss.modelMetaChipVal];
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
	{
		icon: 'ti ti-trash',
		text: i18n.ts._agents.deleteSession,
		danger: true,
		handler: () => { void deleteAgentSession(); },
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
		void loadAgentCreditBalance();
		void refreshContextWindow();
		if (longMemoryConfigured.value) {
			void loadMemoryNodes();
		}
	} else if (v === 'model') {
		void loadModelSuccessRates();
		void loadAgentCreditBalance();
	}
});

watch(
	[tab, memProvider, () => session.value?.dialogueStyleId],
	() => {
		if (tab.value !== 'memory' || session.value == null) return;
		if (memProvider.value === 'compression') {
			void loadAgentCreditBalance();
		}
		if (memProvider.value === 'compression' && session.value.dialogueStyleId) {
			void loadCompressionOverview();
		}
	},
);

let compressionOverviewMessagesDebounce: number | null = null;
watch(
	[() => messages.value[0]?.id, () => messages.value.length],
	() => {
		if (tab.value !== 'memory' || memProvider.value !== 'compression' || !session.value?.dialogueStyleId) return;
		if (compressionOverviewMessagesDebounce != null) {
			window.clearTimeout(compressionOverviewMessagesDebounce);
		}
		compressionOverviewMessagesDebounce = window.setTimeout(() => {
			compressionOverviewMessagesDebounce = null;
			if (tab.value === 'memory' && memProvider.value === 'compression' && session.value?.dialogueStyleId) {
				void loadCompressionOverview();
			}
		}, 900);
	},
);

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

async function deleteAgentSession() {
	if (!session.value) return;
	const { canceled } = await os.confirm({
		type: 'error',
		title: i18n.ts._agents.deleteSessionConfirmTitle,
		text: i18n.ts._agents.deleteSessionConfirmText,
		okText: i18n.ts._agents.deleteSessionConfirmOk,
	});
	if (canceled) return;
	try {
		const r = await misskeyApi('agents/sessions/delete' as Parameters<typeof misskeyApi>[0], {
			sessionId,
		}) as { ok: boolean; aliyunMemoryProviderError: boolean };
		os.toast(i18n.ts._agents.deleteSessionDone);
		if (r.aliyunMemoryProviderError === true) {
			await os.alert({ type: 'warning', text: i18n.ts._agents.deleteSessionAliyunWarn });
		}
		await router.push('/chat');
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
		session.value = (await misskeyApi('agents/sessions/show', { sessionId })) as typeof session.value;
		if (session.value) {
			selectedModelId.value = displayModelIdForSession(session.value.agentModelId);
			selectedStyleId.value = session.value.dialogueStyleId ?? '';
			memLongMemoryEnabled.value = session.value.agentLongMemoryEnabled ?? false;
			memTopK.value = String(session.value.agentLongMemoryTopK ?? 8);
			memMinScore.value = session.value.agentLongMemoryMinScore == null ? '' : String(session.value.agentLongMemoryMinScore);
			memInject.value = String(session.value.agentLongMemoryInjectMaxChars ?? 4000);
			memAddMaxRounds.value = session.value.agentLongMemoryAddMaxRounds == null ? '' : String(session.value.agentLongMemoryAddMaxRounds);
			memAddEveryN.value = session.value.agentLongMemoryAddEveryNRounds == null ? '' : String(session.value.agentLongMemoryAddEveryNRounds);
			{
				const p = session.value.agentLongMemoryProvider;
				if (p === 'none' || p === 'aliyun' || p === 'compression') {
					memProvider.value = p;
				} else {
					memProvider.value = 'none';
				}
			}
			memCompressionModelId.value = displayCompressionModelIdForSession(session.value.agentCompressionModelId);
			compressionOverview.value = null;
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

async function loadModelSuccessRates() {
	try {
		const res = await misskeyApi(
			'agents/models/success-rates' as Parameters<typeof misskeyApi>[0],
			{ windowMs: 60 * 60 * 1000 } as any,
		) as {
			windowMs: number;
			rates: { modelId: string; total: number; success: number; failed: number; aborted: number }[];
		};
		const rates: Record<string, { success: number; total: number }> = {};
		for (const r of res.rates) {
			rates[r.modelId] = { success: r.success, total: r.total };
		}
		modelSuccessRates.value = rates;
	} catch {
		modelSuccessRates.value = {};
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
	if (editingMessage.value?.id === messageId) cancelEditingMessage();
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
		void loadModelSuccessRates();
		void loadAgentCreditBalance();
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
	if (compressionLlmPollTimeout != null) {
		window.clearTimeout(compressionLlmPollTimeout);
		compressionLlmPollTimeout = null;
	}
	compressionLlmPollGen++;
	compressionSidecarHintVisible.value = false;
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

async function saveSessionLongMemoryMode() {
	if (!session.value || memSaving.value || moderationLocksSessionWrites.value) return;
	if (!memoryProviderSelectionDirty.value) return;
	memSaving.value = true;
	try {
		await misskeyApi('agents/sessions/update', {
			sessionId,
			agentLongMemoryProvider: memProvider.value,
			agentCompressionModelId: memProvider.value === 'compression'
				? (memCompressionModelId.value.trim() || displayCompressionModelIdForSession(session.value.agentCompressionModelId))
				: null,
		});
		await loadSession();
		if (memProvider.value === 'compression' && session.value?.dialogueStyleId) {
			void loadCompressionOverview();
		}
		os.toast(i18n.ts._agents.sessionLongMemoryModeSaved);
	} catch (e) {
		os.alert({ type: 'error', text: formatApiError(e) });
		await loadSession();
	} finally {
		memSaving.value = false;
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
			agentLongMemoryProvider: memProvider.value,
			agentCompressionModelId: memProvider.value === 'compression'
				? (memCompressionModelId.value.trim() || displayCompressionModelIdForSession(session.value.agentCompressionModelId))
				: null,
		});
		await loadSession();
		if (session.value?.agentLongMemoryProvider === 'compression' && session.value.dialogueStyleId) {
			void loadCompressionOverview();
		}
		os.toast(i18n.ts._agents.sessionMemorySaved);
	} catch (e) {
		os.alert({ type: 'error', text: formatApiError(e) });
		await loadSession();
	} finally {
		memSaving.value = false;
	}
}

async function loadCompressionOverview() {
	if (!session.value?.dialogueStyleId) return;
	if (memProvider.value !== 'compression') {
		compressionOverview.value = null;
		return;
	}
	compressionOverviewLoading.value = true;
	try {
		compressionOverview.value = await misskeyApi(
			'agents/sessions/compression-overview' as Parameters<typeof misskeyApi>[0],
			{ sessionId } as any,
		) as CompressionOverviewPayload;
	} catch {
		compressionOverview.value = null;
	} finally {
		compressionOverviewLoading.value = false;
	}
}

async function persistMemCompressionModelId() {
	if (!session.value || settingsHydrating.value || memProvider.value !== 'compression' || moderationLocksSessionWrites.value) {
		return;
	}
	const next = memCompressionModelId.value.trim();
	if (next === '') return;
	const prev = session.value.agentCompressionModelId?.trim() ?? null;
	if (next === prev) {
		return;
	}
	if ((prev == null || prev === '') && next === displayCompressionModelIdForSession(null)) {
		return;
	}
	memSaving.value = true;
	try {
		await misskeyApi('agents/sessions/update', {
			sessionId,
			agentCompressionModelId: next,
		});
		await loadSession();
		void loadCompressionOverview();
	} catch (e) {
		os.alert({ type: 'error', text: formatApiError(e) });
		await loadSession();
	} finally {
		memSaving.value = false;
	}
}

watch(memCompressionModelId, () => {
	if (settingsHydrating.value) return;
	void persistMemCompressionModelId();
});

/** 发送后便签在后台写出，多次延迟刷新记忆总览，让便签列表与消息区带尽快与服务器一致 */
let compressionOverviewSidecarTimeoutIds: number[] = [];
function scheduleCompressionOverviewAfterSidecar() {
	for (const id of compressionOverviewSidecarTimeoutIds) {
		window.clearTimeout(id);
	}
	compressionOverviewSidecarTimeoutIds = [];
	const delaysMs = [1200, 3500, 8000];
	for (const ms of delaysMs) {
		const tid = window.setTimeout(() => {
			compressionOverviewSidecarTimeoutIds = compressionOverviewSidecarTimeoutIds.filter(x => x !== tid);
			if (memProvider.value === 'compression' && session.value?.dialogueStyleId) {
				void loadCompressionOverview();
			}
		}, ms);
		compressionOverviewSidecarTimeoutIds.push(tid);
	}
}

function compressionStickyErrorText(raw: string | null | undefined): string {
	if (raw == null || raw === '') return '';
	if (raw === 'COMPRESSION_LLM_FAILED') return i18n.ts._agents.compressionStickyLlmFailedStored;
	return raw;
}

/** 在即将调用压缩模型后轮询总览，直到便签条数变化或超时，并在私信区给出进行中的提示 */
function startCompressionLlmProgressPoll(baselineCount: number) {
	compressionLlmPollGen++;
	if (compressionLlmPollTimeout != null) {
		window.clearTimeout(compressionLlmPollTimeout);
		compressionLlmPollTimeout = null;
	}
	const myGen = compressionLlmPollGen;
	compressionSidecarHintVisible.value = true;
	const t0 = Date.now();
	const maxMs = 120_000;
	const tickDelay = 1600;

	const scheduleNext = () => {
		compressionLlmPollTimeout = window.setTimeout(() => { void tick(); }, tickDelay);
	};

	const tick = async () => {
		if (myGen !== compressionLlmPollGen) return;
		compressionLlmPollTimeout = null;
		try {
			const ov = await misskeyApi(
				'agents/sessions/compression-overview' as Parameters<typeof misskeyApi>[0],
				{ sessionId } as any,
			) as CompressionOverviewPayload;
			if (myGen !== compressionLlmPollGen) return;
			if (ov.stickies.length > baselineCount) {
				compressionSidecarHintVisible.value = false;
				const newest = [...ov.stickies].sort((a, b) =>
					b.sortIndex - a.sortIndex || b.id.localeCompare(a.id))[0];
				if (newest != null && newest.errorMessage != null && String(newest.errorMessage).trim() !== '') {
					os.alert({ type: 'error', text: i18n.ts._agents.compressionSidecarLlmFailed });
				}
				if (memProvider.value === 'compression' && session.value?.dialogueStyleId) {
					compressionOverview.value = ov;
				}
				return;
			}
		} catch {
			// 继续轮询
		}
		if (myGen !== compressionLlmPollGen) return;
		if (Date.now() - t0 > maxMs) {
			compressionSidecarHintVisible.value = false;
			os.alert({ type: 'warning', text: i18n.ts._agents.compressionSidecarLlmTimeout });
			return;
		}
		scheduleNext();
	};
	void tick();
}

function compressionMsgTokensLabel(m: CompressionOverviewPayload['messages'][0]): string {
	const cum = m.dFromNewTokens;
	const raw = m.messageTokens;
	const msg = typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, Math.round(raw)) : null;
	if (msg != null) {
		return i18n.tsx._agents.compressionBandMsgTokens({ msg: String(msg), cum: String(Math.max(0, Math.round(cum))) });
	}
	return i18n.tsx._agents.compressionBandMsgTokensCumulativeOnly({ cum: String(Math.max(0, Math.round(cum))) });
}

function compressionBandGroupTitle(band: string): string {
	if (band === 'new') return i18n.ts._agents.compressionBandNew;
	if (band === 'prep') return i18n.ts._agents.compressionBandPrep;
	if (band === 'staged') return i18n.ts._agents.compressionBandStaged;
	if (band === 'out') return i18n.ts._agents.compressionBandOut;
	return band;
}

function compressionStateLabel(state: string): string {
	if (state === 'active') return i18n.ts._agents.compressionStateActive;
	if (state === 'dormant') return i18n.ts._agents.compressionStateDormant;
	return i18n.ts._agents.compressionStateOther;
}

function messageRoleLabel(role: string): string {
	if (role === 'user') return i18n.ts._agents.compressionMessageRoleUser;
	if (role === 'assistant' || role === 'model') return i18n.ts._agents.compressionMessageRoleAssistant;
	return role;
}

function messageZonePreview(raw: string | null | undefined): string {
	if (raw == null || raw === '') return '…';
	const t = raw.replace(/\s+/g, ' ').trim();
	if (t.length === 0) return '…';
	return t.length <= 140 ? t : `${t.slice(0, 140)}…`;
}

/** 消息区带列表用：去掉常见 Markdown 噪声后再截断，便于阅读 */
function messageBandPlainPreview(raw: string | null | undefined): string {
	if (raw == null || raw === '') return '…';
	let t = String(raw).replace(/\r\n?/g, '\n');
	t = t
		.split('\n')
		.map((line) =>
			line
				.replace(/^#{1,6}\s+/, '')
				.replace(/^\s*[-*+]\s+/, '')
				.replace(/^\s*\d+\.\s+/, ''))
		.join(' ');
	t = t.replace(/\*\*([^*]+)\*\*/g, '$1');
	t = t.replace(/\*([^*]+)\*/g, '$1');
	t = t.replace(/`{1,3}[^`]*`{1,3}/g, ' ');
	t = t.replace(/`+/g, '');
	t = t.replace(/\s+/g, ' ').trim();
	if (t.length === 0) return '…';
	return t.length <= 168 ? t : `${t.slice(0, 168)}…`;
}

async function jumpToChatMessage(messageId: string) {
	tab.value = 'chat';
	await nextTick();
	await nextTick();
	await new Promise(r => window.setTimeout(r, 50));
	await scrollToMessage(messageId);
}

function startEditCompressionSticky(st: { id: string; summaryText: string }) {
	editingCompressionStickyId.value = st.id;
	editingCompressionStickyText.value = st.summaryText;
}

function cancelEditCompressionSticky() {
	editingCompressionStickyId.value = null;
	editingCompressionStickyText.value = '';
}

async function moveCompressionSticky(stickyId: string, delta: -1 | 1) {
	if (!compressionOverview.value || compressionStickyMutating.value || moderationLocksSessionWrites.value) return;
	const list = compressionOverview.value.stickies;
	const i = list.findIndex(s => s.id === stickyId);
	if (i < 0) return;
	const j = i + delta;
	if (j < 0 || j >= list.length) return;
	const next = [...list];
	const t = next[i]!;
	next[i] = next[j]!;
	next[j] = t;
	const stickyIds = next.map(s => s.id);
	compressionStickyMutating.value = true;
	try {
		await misskeyApi(
			'agents/compression-sticky/reorder' as Parameters<typeof misskeyApi>[0],
			{ sessionId, stickyIds } as any,
		);
		await loadCompressionOverview();
	} catch (e) {
		os.alert({ type: 'error', text: formatApiError(e) });
	} finally {
		compressionStickyMutating.value = false;
	}
}

async function submitEditCompressionSticky(stickyId: string) {
	if (!session.value || compressionStickyMutating.value || moderationLocksSessionWrites.value) return;
	const t = editingCompressionStickyText.value.trim();
	if (t.length === 0) return;
	compressionStickyMutating.value = true;
	try {
		await misskeyApi(
			'agents/compression-sticky/update' as Parameters<typeof misskeyApi>[0],
			{ sessionId, stickyId, summaryText: t } as any,
		);
		os.toast(i18n.ts._agents.compressionStickyUpdated);
		cancelEditCompressionSticky();
		await loadCompressionOverview();
	} catch (e) {
		os.alert({ type: 'error', text: formatApiError(e) });
	} finally {
		compressionStickyMutating.value = false;
	}
}

async function confirmDeleteCompressionSticky(stickyId: string) {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.ts._agents.compressionStickyDeleteConfirm,
	});
	if (canceled) return;
	if (!session.value || compressionStickyMutating.value || moderationLocksSessionWrites.value) return;
	compressionStickyMutating.value = true;
	try {
		await misskeyApi(
			'agents/compression-sticky/delete' as Parameters<typeof misskeyApi>[0],
			{ sessionId, stickyId } as any,
		);
		os.toast(i18n.ts._agents.compressionStickyDeleted);
		if (editingCompressionStickyId.value === stickyId) cancelEditCompressionSticky();
		await loadCompressionOverview();
	} catch (e) {
		os.alert({ type: 'error', text: formatApiError(e) });
	} finally {
		compressionStickyMutating.value = false;
	}
}

type SessionContextRole = 'user' | 'assistant';
type SessionContextRow = { role: SessionContextRole; content: string };
type SessionContextExportPayload = {
	format: 'misskey-agent-context-compatible-v1';
	version: 1;
	sessionId: string;
	exportedAt: string;
	messages: SessionContextRow[];
};

function normalizeSessionContextRows(rows: AgentMsg[]): SessionContextRow[] {
	const sortedAsc = [...rows].sort((a, b) => {
		const ta = new Date(a.createdAt).getTime();
		const tb = new Date(b.createdAt).getTime();
		if (ta !== tb) return ta - tb;
		return a.id.localeCompare(b.id);
	});
	const out: SessionContextRow[] = [];
	for (const row of sortedAsc) {
		if (row.role !== 'user' && row.role !== 'assistant') continue;
		out.push({
			role: row.role,
			content: row.content,
		});
	}
	return out;
}

async function fetchAllSessionMessages(): Promise<AgentMsg[]> {
	const limit = 100;
	const all: AgentMsg[] = [];
	let untilId: string | null = null;
	for (let i = 0; i < 1000; i++) {
		const list = await misskeyApi('agents/messages/timeline', {
			sessionId,
			limit,
			untilId,
		}) as AgentMsg[];
		if (list.length === 0) break;
		all.push(...list);
		if (list.length < limit) break;
		untilId = list[list.length - 1]!.id;
	}
	return all;
}

function downloadJsonFile(filename: string, content: string) {
	const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
	const url = URL.createObjectURL(blob);
	const a = window.document.createElement('a');
	a.href = url;
	a.download = filename;
	a.click();
	window.setTimeout(() => {
		URL.revokeObjectURL(url);
	}, 0);
}

async function exportSessionContext() {
	if (contextExporting.value) return;
	contextExporting.value = true;
	try {
		const all = await fetchAllSessionMessages();
		const messagesForContext = normalizeSessionContextRows(all);
		const payload: SessionContextExportPayload = {
			format: 'misskey-agent-context-compatible-v1',
			version: 1,
			sessionId,
			exportedAt: new Date().toISOString(),
			messages: messagesForContext,
		};
		const json = JSON.stringify(payload, null, 2);
		const filename = `agent-context-${sessionId}-${Date.now()}.json`;
		downloadJsonFile(filename, json);
		os.toast(i18n.ts._agents.sessionMemoryExportContextDone);
	} catch (e) {
		os.alert({ type: 'error', text: formatApiError(e) });
	} finally {
		contextExporting.value = false;
	}
}

function openContextImportFileDialog() {
	if (contextImporting.value || moderationLocksSessionWrites.value) return;
	contextImportInputEl.value?.click();
}

function parseImportedContext(text: string): SessionContextRow[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new Error(i18n.ts._agents.sessionMemoryImportContextInvalidJson);
	}
	if (parsed == null || typeof parsed !== 'object') {
		throw new Error(i18n.ts._agents.sessionMemoryImportContextInvalidFormat);
	}
	const rawMessages = (parsed as { messages?: unknown }).messages;
	if (!Array.isArray(rawMessages)) {
		throw new Error(i18n.ts._agents.sessionMemoryImportContextInvalidFormat);
	}
	const out: SessionContextRow[] = [];
	for (const row of rawMessages) {
		if (row == null || typeof row !== 'object') {
			throw new Error(i18n.ts._agents.sessionMemoryImportContextInvalidFormat);
		}
		const role = (row as { role?: unknown }).role;
		const content = (row as { content?: unknown }).content;
		if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') {
			throw new Error(i18n.ts._agents.sessionMemoryImportContextInvalidFormat);
		}
		if (content.trim() === '') {
			throw new Error(i18n.ts._agents.sessionMemoryImportContextEmptyContent);
		}
		out.push({ role, content });
	}
	return out;
}

async function onContextImportFileChange(ev: Event) {
	const input = ev.target as HTMLInputElement | null;
	if (input == null || input.files == null || input.files.length === 0) return;
	const file = input.files[0]!;
	input.value = '';
	if (contextImporting.value || moderationLocksSessionWrites.value) return;
	contextImporting.value = true;
	try {
		const text = await file.text();
		const importedMessages = parseImportedContext(text);
		const { canceled } = await os.confirm({
			type: 'warning',
			text: i18n.ts._agents.sessionMemoryImportContextConfirm,
		});
		if (canceled) return;
		await (misskeyApi as unknown as (
			endpoint: 'agents/messages/import-context',
			data: { sessionId: string; messages: SessionContextRow[] },
		) => Promise<{ importedCount: number }>)('agents/messages/import-context', {
			sessionId,
			messages: importedMessages,
		});
		await loadInitialTimeline();
		await loadSession();
		os.toast(i18n.tsx._agents.sessionMemoryImportContextDone({ n: importedMessages.length }));
	} catch (e) {
		const text = e instanceof Error ? e.message : formatApiError(e);
		os.alert({ type: 'error', text });
	} finally {
		contextImporting.value = false;
	}
}

const OPTIMISTIC_MESSAGE_ID_PREFIX = 'agent-opt:';

/** 当前正在进行的发送请求 ID；由 abort 端点使用 */
let currentClientRequestId: string | null = null;

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
	if (editingMessage.value != null) {
		await saveEditingMessage(text);
		return;
	}
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

	const callCost = expectedCallCostForSession.value;
	if (callCost > 0) {
		try {
			const balRes = await misskeyApi('agents/credit-balance' as any, {}) as { creditBalance: number };
			if (balRes.creditBalance < callCost) {
				os.alert({ type: 'error', text: i18n.ts._agents.insufficientAgentCredit });
				return;
			}
		} catch {
			// 额度无法获取时不阻止发送，由服务端校验
		}
	}

	sending.value = true;
	let leaveSendingSpinner = false;
	const clientRequestId = crypto.randomUUID();
	currentClientRequestId = clientRequestId;
	const optimisticId = OPTIMISTIC_MESSAGE_ID_PREFIX + crypto.randomUUID();
	const userCreatedAt = new Date().toISOString();
	messages.value.unshift({
		id: optimisticId,
		role: 'user',
		content: trimmed,
		createdAt: userCreatedAt,
	});

	try {
		const res = await misskeyApi('agents/messages/send', { sessionId, text: trimmed, clientRequestId }) as {
			userMessageId: string | null;
			assistantMessageId: string | null;
			assistantText: string;
			longTermMemorySearchUnavailable?: boolean;
			longTermMemoryAddScheduled?: boolean;
			compressionLlmPending?: boolean;
			compressionStickiesBaselineCount?: number;
			aborted?: boolean;
		};
		if (res.aborted === true || !res.userMessageId || !res.assistantMessageId) {
			// 服务端已回滚用户消息，回填文本到输入框
			messages.value = messages.value.filter(m => m.id !== optimisticId);
			formRef.value?.restoreDraft(trimmed);
			return;
		}
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
		if (res.compressionLlmPending === true) {
			startCompressionLlmProgressPoll(
				typeof res.compressionStickiesBaselineCount === 'number' ? res.compressionStickiesBaselineCount : 0,
			);
		}
		await scrollToLatest();
		await loadSession();
		void loadAgentCreditBalance();
		if (session.value?.agentLongMemoryProvider === 'compression' && session.value.dialogueStyleId) {
			scheduleCompressionOverviewAfterSidecar();
		}
	} catch (e) {
		const isAborted = e != null && typeof e === 'object' && (e as { code?: string }).code === 'AGENTS_LLM_ABORTED';
		// 中断或失败时均移除乐观气泡
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
		} else if (isAborted) {
			// 服务端已回滚用户消息，回填文本到输入框
			formRef.value?.restoreDraft(trimmed);
		} else {
			formRef.value?.restoreDraft(trimmed);
			if (e != null && typeof e === 'object' && (e as { code?: string }).code === 'AGENT_DIALOGUE_STYLE_REQUIRED') {
				os.alert({ type: 'info', text: i18n.ts._agents.needDialogueStyleBeforeSend });
				tab.value = 'style';
			} else if (e != null && typeof e === 'object' && (e as { code?: string }).code === 'AGENT_THREAD_INVALID_TURNS') {
				os.alert({ type: 'error', text: i18n.ts._agents.invalidTurnOrderCannotSend });
			} else if (e != null && typeof e === 'object' && (e as { code?: string }).code === 'AGENT_AWAIT_ASSISTANT_REPLY') {
				os.alert({ type: 'error', text: i18n.ts._agents.awaitAssistantReplyCannotSend });
			} else if (e != null && typeof e === 'object' && (e as { code?: string }).code === 'AGENT_INSUFFICIENT_CREDIT') {
				os.alert({ type: 'error', text: i18n.ts._agents.insufficientAgentCredit });
			} else {
				os.alert({ type: 'error', text: formatApiError(e) });
			}
		}
	} finally {
		currentClientRequestId = null;
		if (!leaveSendingSpinner) {
			sending.value = false;
		}
	}
}

async function onAbortRequest() {
	const reqId = currentClientRequestId;
	const sess = session.value;
	if (!sending.value || !reqId || !sess) return;
	try {
		await misskeyApi(
			'agents/messages/abort' as Parameters<typeof misskeyApi>[0],
			{ sessionId: sess.id, clientRequestId: reqId } as any,
		);
	} catch {
		// 中断请求本身失败时静默处理（服务端可能已经完成了）
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

.memPage {
	width: 100%;
	max-width: min(100%, 720px);
	margin-inline: auto;
	padding-bottom: 0.15em;
}

.memToolbar {
	padding: 0.65em 0.9em;
	border-radius: 12px;
	border: solid 1px var(--MI_THEME-divider);
	background: color-mix(in srgb, var(--MI_THEME-panel) 94%, var(--MI_THEME-accent) 2%);
	box-shadow: 0 1px 2px color-mix(in srgb, var(--MI_THEME-fg) 3%, transparent);
}

.memAddPanel {
	padding: 0.95em 1.05em;
	border-radius: 12px;
	border: solid 1px var(--MI_THEME-divider);
	background: var(--MI_THEME-panel);
	box-shadow: 0 1px 0 color-mix(in srgb, var(--MI_THEME-fg) 2.5%, transparent);
}

.memPorterPanel {
	padding: 1em 1.1em;
	border-radius: 12px;
	border: solid 1px color-mix(in srgb, var(--MI_THEME-accent) 14%, var(--MI_THEME-divider));
	background: linear-gradient(160deg, color-mix(in srgb, var(--MI_THEME-accent) 6.5%, var(--MI_THEME-panel)), var(--MI_THEME-panel));
	box-shadow: 0 1px 2px color-mix(in srgb, var(--MI_THEME-fg) 3.5%, transparent);
}

.memNodesList {
	gap: 12px;
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

.settingHero {
	padding: 0.9em 1.05em;
	border-radius: 12px;
	border: solid 1px color-mix(in srgb, var(--MI_THEME-accent) 16%, var(--MI_THEME-divider));
	background: linear-gradient(145deg, color-mix(in srgb, var(--MI_THEME-accent) 11%, var(--MI_THEME-panel)), var(--MI_THEME-panel));
	box-shadow: 0 1px 2px color-mix(in srgb, var(--MI_THEME-fg) 3%, transparent);
}

.memProviderSaveRow {
	margin-top: 0.85em;
}

.settingValue {
	font-size: 0.9em;
	font-weight: 700;
	color: var(--MI_THEME-accent);
	max-width: 65%;
	text-align: end;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.selectCardList {
	display: grid;
	gap: 0.75em;
}

.selectCard {
	border: solid 1px var(--MI_THEME-divider);
	border-radius: var(--MI-radius);
	background: linear-gradient(155deg, color-mix(in srgb, var(--MI_THEME-panel) 88%, transparent), var(--MI_THEME-panel));
	transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
}

.selectCardActive {
	border-color: color-mix(in srgb, var(--MI_THEME-accent) 60%, var(--MI_THEME-divider));
	box-shadow: 0 0 0 1px color-mix(in srgb, var(--MI_THEME-accent) 28%, transparent), 0 10px 24px rgba(0, 0, 0, 0.08);
	transform: translateY(-1px);
}

.selectCardMain {
	padding: 0.9em 1em;
	display: flex;
	flex-direction: column;
	gap: 0.75em;
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
	padding: 0.55em 0.7em;
	border-radius: calc(var(--MI-radius) * 0.75);
	background: color-mix(in srgb, var(--MI_THEME-bg) 24%, transparent);
	border: solid 1px color-mix(in srgb, var(--MI_THEME-divider) 75%, transparent);
}

.stylePlazaRow {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: 0.35em 0.5em;
	font-size: 0.86em;
	margin-top: 0.15em;
	line-height: 1.45;
	padding: 0.55em 0.7em;
	border-radius: calc(var(--MI-radius) * 0.75);
	background: color-mix(in srgb, var(--MI_THEME-bg) 20%, transparent);
	border: solid 1px color-mix(in srgb, var(--MI_THEME-divider) 72%, transparent);
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
	padding-top: 0.1em;
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

.modelHeroCompact {
	padding: 0.6em 0.85em;
	background: color-mix(in srgb, var(--MI_THEME-accent) 7%, var(--MI_THEME-panel));
}

.modelHeroSummary {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: 0.5em 1.15em;
}

.modelHeroSummaryItem {
	display: inline-flex;
	align-items: baseline;
	gap: 0.35em;
	font-size: 0.88em;
}

.modelHeroSummaryValue {
	font-weight: 700;
	color: var(--MI_THEME-accent);
	max-width: 14em;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.modelSelectCard {
	border-radius: calc(var(--MI-radius) * 0.92);
}

.modelSelectCardMain {
	padding: 0.5em 0.65em;
	gap: 0.35em;
}

.modelSelectCardHead {
	align-items: center;
}

.modelSelectCardTitle {
	font-size: 0.95em;
	font-weight: 700;
	line-height: 1.25;
	word-break: break-word;
}

.modelMetaChips {
	display: flex;
	flex-wrap: wrap;
	align-items: stretch;
	gap: 0.4em 0.45em;
	margin-top: 0.45em;
	font-size: 0.78em;
	line-height: 1.25;
}

.modelMetaChip {
	display: inline-flex;
	align-items: center;
	gap: 0.32em 0.4em;
	min-height: 1.85em;
	padding: 0.28em 0.55em 0.28em 0.42em;
	border-radius: 8px;
	border: solid 1px color-mix(in srgb, var(--MI_THEME-divider) 85%, var(--MI_THEME-accent) 4%);
	background: color-mix(in srgb, var(--MI_THEME-bg) 38%, var(--MI_THEME-panel));
	box-shadow: 0 1px 0 color-mix(in srgb, var(--MI_THEME-fg) 4%, transparent);
}

.modelMetaChipIcon {
	font-size: 0.95em;
	opacity: 0.48;
	flex-shrink: 0;
	line-height: 1;
}

.modelMetaChipKicker {
	font-weight: 600;
	opacity: 0.58;
	white-space: nowrap;
	flex-shrink: 0;
}

.modelMetaChipVal {
	font-weight: 700;
	font-variant-numeric: tabular-nums;
	min-width: 0;
	white-space: nowrap;
}

.modelMetaChipValHighlight {
	color: color-mix(in srgb, var(--MI_THEME-success, #22c55e) 88%, var(--MI_THEME-fg) 12%);
}

.modelMetaChipValMuted {
	font-weight: 600;
	opacity: 0.52;
	white-space: normal;
}

.modelMetaChipValLong {
	text-align: end;
	line-height: 1.25;
	max-width: min(12.5em, 100%);
	white-space: normal;
	word-break: break-word;
}

.modelDescClamp {
	margin: 0;
	padding-top: 0.2em;
	font-size: 0.82em;
	line-height: 1.4;
	opacity: 0.78;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
	word-break: break-word;
}

.successRateHigh {
	color: var(--MI_THEME-success, #84cc16);
}

.successRateMedium {
	color: var(--MI_THEME-warn, #f59e0b);
}

.successRateLow {
	color: var(--MI_THEME-error, #ef4444);
}

.sessionMemoryHint {
	white-space: pre-line;
	line-height: 1.55;
}

.compressionMemorySheet {
	display: flex;
	flex-direction: column;
	gap: 0.65em;
}

.compressionMemoryNote {
	margin-block: 0;
}

.compressionBillingNote {
	margin: 0;
	font-size: 0.84em;
	line-height: 1.45;
	color: var(--MI_THEME-fgTransparentWeak);
}

.compressionCountMuted {
	font-weight: 600;
	opacity: 0.58;
	font-size: 0.92em;
}

.compressionStickyList {
	display: flex;
	flex-direction: column;
	gap: 0.5em;
}

.compressionStickyCard {
	padding: 0.55em 0.65em 0.6em;
	border-radius: 10px;
	border: solid 1px color-mix(in srgb, var(--MI_THEME-divider) 92%, var(--MI_THEME-accent) 5%);
	background: var(--MI_THEME-panel);
}

.compressionStickyCardHead {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.35em 0.5em;
	margin-bottom: 0.35em;
}

.compressionStickySummary {
	white-space: pre-wrap;
	word-break: break-word;
	font-size: 0.9em;
	line-height: 1.42;
	margin-top: 0.15em;
}

.compressionStickyToolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.35em;
	justify-content: flex-end;
	margin-top: 0.45em;
}

.compressionEmptyHint {
	margin: 0;
	padding: 0.35em 0 0.15em;
	font-size: 0.88em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.compressionOverviewFail {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.5em 0.75em;
	font-size: 0.88em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.memContextDividerBeforePorter {
	margin-top: 0.35em;
}

.memDivider {
	margin: 0.85em 0 1.15em;
	border: none;
	border-top: solid 1px color-mix(in srgb, var(--MI_THEME-fg) 10%, var(--MI_THEME-divider) 90%);
}

.memNodesHeader {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.75em;
	padding-bottom: 0.4em;
	margin-bottom: 0.1em;
	border-bottom: solid 1px color-mix(in srgb, var(--MI_THEME-divider) 90%, var(--MI_THEME-accent) 6%);
}

.memNodesActions {
	display: flex;
	gap: 0.35em;
	flex-shrink: 0;
}

.memCard {
	padding: 0.95em 1.05em;
	border-radius: 12px;
	border: solid 1px var(--MI_THEME-divider);
	background: var(--MI_THEME-panel);
	box-shadow: 0 1px 2px color-mix(in srgb, var(--MI_THEME-fg) 2.5%, transparent);
	transition: border-color 0.12s ease, box-shadow 0.12s ease;

	@media (hover: hover) {
		&:hover {
			border-color: color-mix(in srgb, var(--MI_THEME-accent) 20%, var(--MI_THEME-divider));
			box-shadow: 0 2px 6px color-mix(in srgb, var(--MI_THEME-fg) 4%, transparent);
		}
	}
}

.memMeta {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.4em 0.55em;
	font-size: 0.8em;
	margin-bottom: 0.45em;
}

.memTimeChip {
	display: inline-flex;
	align-items: center;
	font-size: 0.95em;
	font-weight: 500;
	padding: 0.22em 0.6em;
	border-radius: 999px;
	color: var(--MI_THEME-fg);
	background: color-mix(in srgb, var(--MI_THEME-fg) 4.5%, var(--MI_THEME-panel));
	border: solid 1px color-mix(in srgb, var(--MI_THEME-divider) 75%, transparent);
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

.memCardActionsSticky {
	gap: 0.35em;
	margin-top: 0.5em;
}

.memPager {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 0.75em;
	margin-top: 0.5em;
	padding: 0.5em 0.9em;
	font-size: 0.9em;
	font-variant-numeric: tabular-nums;
	border-radius: 999px;
	border: solid 1px var(--MI_THEME-divider);
	background: color-mix(in srgb, var(--MI_THEME-fg) 2.2%, var(--MI_THEME-panel));
	max-width: 20em;
	margin-left: auto;
	margin-right: auto;
}

.memContextPorter {
	display: flex;
	flex-direction: column;
	gap: 0.6em;
}

.memContextPorterLabel {
	font-size: 0.9em;
	font-weight: 700;
	opacity: 0.9;
}

.memContextPorterActions {
	display: flex;
	flex-wrap: wrap;
	gap: 0.5em;
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

.memEnableCaption {
	font-size: 0.82em;
	line-height: 1.45;
	opacity: 0.72;
	margin: -0.15em 0 0.35em;
}

.compressionStatePill {
	display: inline-flex;
	align-items: center;
	font-size: 0.78em;
	font-weight: 700;
	padding: 0.25em 0.55em;
	border-radius: 999px;
	letter-spacing: 0.02em;
	background: color-mix(in srgb, var(--MI_THEME-fg) 6%, var(--MI_THEME-buttonBg));
	border: solid 1px color-mix(in srgb, var(--MI_THEME-divider) 55%, transparent);
	&[data-state="dormant"] {
		color: var(--MI_THEME-fg);
		background: color-mix(in srgb, var(--MI_THEME-fg) 5%, var(--MI_THEME-panel));
		border-color: color-mix(in srgb, var(--MI_THEME-divider) 70%, transparent);
	}
	&[data-state="active"] {
		color: var(--MI_THEME-success, #16a34a);
		background: color-mix(in srgb, var(--MI_THEME-success) 18%, var(--MI_THEME-panel));
		border-color: color-mix(in srgb, var(--MI_THEME-success) 32%, var(--MI_THEME-divider));
	}
}
.compressionUserTag {
	margin-inline-start: 0.15em;
	font-size: 0.75em;
	font-weight: 600;
	opacity: 0.82;
	padding: 0.2em 0.45em;
	border-radius: 6px;
	background: color-mix(in srgb, var(--MI_THEME-accent) 10%, var(--MI_THEME-panel));
}
.compressionRangeRow {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	gap: 0.35em 0.45em;
	margin: 0.3em 0 0.45em;
}
.compressionEndChip {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 0.12em;
	flex: 1 1 0;
	min-width: min(100%, 9.5rem);
	max-width: min(100%, 13rem);
	padding: 0.3em 0.45em;
	border-radius: 8px;
	text-align: start;
	font: inherit;
	font-size: 0.92em;
	color: inherit;
	cursor: pointer;
	border: solid 1px color-mix(in srgb, var(--MI_THEME-divider) 78%, transparent);
	background: color-mix(in srgb, var(--MI_THEME-fg) 2.8%, var(--MI_THEME-panel));
	transition: background 0.12s ease, border-color 0.12s ease;
	@media (hover: hover) {
		&:hover {
			background: color-mix(in srgb, var(--MI_THEME-accent) 8%, var(--MI_THEME-panel));
			border-color: color-mix(in srgb, var(--MI_THEME-accent) 28%, var(--MI_THEME-divider));
		}
	}
}
.compressionEndLabel {
	font-size: 0.65em;
	font-weight: 700;
	opacity: 0.68;
	text-transform: none;
	letter-spacing: 0.02em;
}
.compressionEndText {
	font-size: 0.88em;
	line-height: 1.38;
	width: 100%;
	overflow: hidden;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	line-clamp: 2;
	-webkit-box-orient: vertical;
	word-break: break-word;
}
.compressionRangeArrow {
	align-self: center;
	margin-top: 0.65em;
	opacity: 0.5;
	font-size: 0.85em;
	user-select: none;
}
.compressionError {
	color: var(--MI_THEME-error);
	font-size: 0.9em;
	margin: 0.2em 0 0.4em;
}
.compressionBandScaleInline {
	padding: 0.35em 0.75em 0.5em;
	font-size: 0.82em;
	line-height: 1.42;
	color: var(--MI_THEME-fgTransparentWeak);
	border-bottom: solid 1px color-mix(in srgb, var(--MI_THEME-divider) 55%, transparent);
}
.compressionBandsSection {
	margin-top: 0.35em;
	font-size: 0.98em;
	border-radius: 10px;
	border: solid 1px color-mix(in srgb, var(--MI_THEME-divider) 88%, transparent);
	background: var(--MI_THEME-panel);
	overflow: hidden;
}
.compressionBandsHeader {
	display: flex;
	align-items: flex-start;
	gap: 0.45em;
	width: 100%;
	padding: 0.55em 0.7em;
	margin: 0;
	border: none;
	background: color-mix(in srgb, var(--MI_THEME-fg) 1.8%, var(--MI_THEME-panel));
	font: inherit;
	color: inherit;
	cursor: pointer;
	text-align: start;
	@media (hover: hover) {
		&:hover {
			background: color-mix(in srgb, var(--MI_THEME-fg) 2.8%, var(--MI_THEME-panel));
		}
	}
}
.compressionBandsChevron {
	flex-shrink: 0;
	margin-top: 0.12em;
	font-size: 1.05em;
	opacity: 0.72;
}
.compressionBandsTitleBlock {
	display: flex;
	flex-direction: column;
	gap: 0.12em;
	min-width: 0;
}
.compressionBandsTitle {
	font-weight: 700;
	font-size: 0.98em;
	letter-spacing: 0.01em;
	line-height: 1.25;
}
.compressionBandsSubtitle {
	font-size: 0.78em;
	font-weight: 500;
	line-height: 1.35;
	color: var(--MI_THEME-fgTransparentWeak);
}
.compressionBandsFootnote {
	margin: 0;
	padding: 0 0.75em 0.45em;
	font-size: 0.78em;
	line-height: 1.45;
	color: var(--MI_THEME-fgTransparentWeak);
}
.compressionBandGroups {
	padding: 0.4em 0.45em 0.55em;
	display: flex;
	flex-direction: column;
	gap: 0.65em;
}
.compressionBandGroup {
	display: flex;
	flex-direction: column;
	gap: 0.28em;
	padding: 0;
	border-radius: 0;
	border: none;
	background: transparent;
	box-shadow: none;
}
.compressionBandGroupTitle {
	font-size: 0.78em;
	font-weight: 700;
	letter-spacing: 0.04em;
	text-transform: uppercase;
	color: var(--MI_THEME-fgTransparentWeak);
	padding: 0.15em 0.1em 0.2em;
	margin: 0;
	border-bottom: none;
}
.compressionMessageTable {
	display: flex;
	flex-direction: column;
	gap: 0;
	border-radius: 8px;
	overflow: hidden;
	border: solid 1px color-mix(in srgb, var(--MI_THEME-divider) 50%, transparent);
}
.compressionMsgTokenMeta {
	display: block;
	font-size: 0.82em;
	font-variant-numeric: tabular-nums;
	color: var(--MI_THEME-fgTransparentWeak);
	margin-top: 0.38em;
	letter-spacing: 0.01em;
}
.compressionMsgRow {
	border-bottom: solid 1px color-mix(in srgb, var(--MI_THEME-divider) 45%, transparent);
	&:last-child {
		border-bottom: none;
	}
}
.compressionMsgRowClickable {
	font-size: 1em;
	padding: 0.6em 0.7em;
	min-height: 2.9em;
	cursor: pointer;
	text-align: start;
	border-radius: 0;
	color: inherit;
	background: color-mix(in srgb, var(--MI_THEME-fg) 1.2%, var(--MI_THEME-bg));
	border-left: solid 3px transparent;
	transition: background 0.1s ease, border-color 0.1s ease;
	@media (hover: hover) {
		&:hover {
			background: color-mix(in srgb, var(--MI_THEME-fg) 3.5%, var(--MI_THEME-panel));
			border-left-color: color-mix(in srgb, var(--MI_THEME-accent) 55%, var(--MI_THEME-panel));
		}
	}
	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus, var(--MI_THEME-accent));
		outline-offset: -1px;
	}
}
.compressionMsgRowTop {
	display: flex;
	align-items: center;
	gap: 0.45em 0.6em;
	flex-wrap: wrap;
	margin-bottom: 0.28em;
}
.compressionMsgRolePill {
	font-size: 0.82em;
	font-weight: 800;
	padding: 0.15em 0.5em;
	border-radius: 999px;
}
.compressionMsgRoleUser {
	background: color-mix(in srgb, var(--MI_THEME-accent) 20%, var(--MI_THEME-panel));
	color: var(--MI_THEME-accent);
}
.compressionMsgRoleAsst {
	background: color-mix(in srgb, var(--MI_THEME-fg) 9%, var(--MI_THEME-panel));
}
.compressionMsgBadgeCompressed {
	font-size: 0.8em;
	font-weight: 700;
	color: var(--MI_THEME-warn, #c27803);
}
.compressionMsgPreview {
	font-size: 0.98em;
	line-height: 1.5;
	color: var(--MI_THEME-fg);
	opacity: 0.95;
}
.compressionMsgOmitRow {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 0.5em;
	padding: 0.55em 0.5em;
	font-size: 0.88em;
	color: var(--MI_THEME-fg);
	opacity: 0.6;
	font-weight: 600;
	border-bottom: solid 1px color-mix(in srgb, var(--MI_THEME-divider) 40%, transparent);
}
.compressionOmitDots {
	letter-spacing: 0.12em;
	font-weight: 700;
}
.compressionOmitHint {
	font-size: 0.9em;
}
</style>
