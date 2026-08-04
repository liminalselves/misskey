<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="activeView" :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 1440px; --MI_SPACER-min: 16px; --MI_SPACER-max: 28px;">
		<div class="_gaps_m">
			<section v-if="activeView === 'overview'" :class="$style.hero">
				<div>
					<h1>智能体治理工作台</h1>
					<p>集中处理发布审核、运行治理、外审拦截、AI 生图和治理日志。</p>
				</div>
				<div :class="$style.heroStats" v-if="summary">
					<span :class="$style.heroStat">待处理 <b>{{ summary.pendingTotal }}</b></span>
					<span :class="$style.heroStat">封禁 <b>{{ summary.bannedCharacters + summary.bannedSessions }}</b></span>
				</div>
			</section>

			<main :class="$style.mainPane">
				<section v-if="activeView === 'overview'" :class="$style.overview">
					<div :class="$style.sectionHead">
						<div>
							<h2>治理概览</h2>
							<p>汇总当前待处理审核与运行治理状态。点击卡片快速跳转。</p>
						</div>
					</div>
					<div :class="$style.summaryGrid">
						<button v-for="card in summaryCards" :key="card.key" type="button" class="_button" :class="$style.summaryCard" @click="card.target ? activeView = card.target : null">
							<span :class="$style.summaryLabel"><i :class="card.icon"></i> {{ card.label }}</span>
							<b :class="$style.summaryValue">{{ card.value }}</b>
						</button>
					</div>
				</section>

				<template v-else-if="activeView === 'queue' || activeView === 'library'">
					<section :class="$style.filterBand">
						<div :class="$style.filterToggle" @click="reviewFilterOpen = !reviewFilterOpen">
							<i :class="reviewFilterOpen ? 'ti ti-filter-off' : 'ti ti-filter'"></i>
							<span>筛选条件</span>
							<span v-if="hasActiveReviewFilters" :class="$style.filterActiveDot"></span>
							<i :class="reviewFilterOpen ? 'ti ti-chevron-up' : 'ti ti-chevron-down'" style="margin-left: auto;"></i>
						</div>
						<template v-if="reviewFilterOpen">
							<FormSplit :minWidth="190">
								<MkSelect v-model="reviewFilters.kind" :items="kindItems">
									<template #label>类型</template>
								</MkSelect>
								<MkSelect v-model="reviewFilters.status" :items="reviewStatusItems">
									<template #label>状态</template>
								</MkSelect>
							</FormSplit>
							<FormSplit :minWidth="240">
								<MkInput v-model="reviewFilters.query" type="text">
									<template #label>关键词</template>
								</MkInput>
								<MkInput v-model="reviewFilters.userId" type="text">
									<template #label>作者用户名 / acct</template>
								</MkInput>
							</FormSplit>
							<div class="_buttons">
								<MkButton primary rounded :disabled="reviewLoading" @click="loadReviewList(true)"><i class="ti ti-search"></i> 检索</MkButton>
								<MkButton rounded :disabled="reviewLoading" @click="resetReviewFilters"><i class="ti ti-filter-off"></i> 重置</MkButton>
							</div>
						</template>
					</section>

					<div :class="$style.splitPane">
						<section :class="$style.listPane">
							<div :class="$style.sectionHead">
								<div>
									<h2>{{ activeView === 'queue' ? '待处理' : '内容库' }}</h2>
									<p>{{ activeView === 'queue' ? '按提交时间优先处理等待最久的内容。' : '检索角色和对话风格，查看详情或执行治理操作。' }}</p>
								</div>
								<MkButton small rounded :disabled="reviewLoading" @click="loadReviewList(true)"><i class="ti ti-refresh"></i></MkButton>
							</div>
							<MkLoading v-if="reviewLoading && reviewRows.length === 0"/>
							<MkInfo v-else-if="reviewRows.length === 0">{{ activeView === 'queue' ? '暂无待处理审核。' : '没有匹配的内容。' }}</MkInfo>
							<div v-else :class="$style.list">
								<button v-for="row in reviewRows" :key="row.kind + row.id" type="button" class="_button" :class="[$style.reviewRow, selectedReview?.id === row.id && selectedReview?.kind === row.kind ? $style.rowActive : null]" @click="selectReview(row)">
									<div :class="$style.rowHead">
										<span :class="$style.typeBadge">{{ kindLabel(row.kind) }}</span>
										<b>{{ row.name }}</b>
									</div>
									<p>{{ row.summary || '—' }}</p>
									<div :class="$style.badges">
										<span>{{ statusLabel(row.reviewStatus) }}</span>
										<span>{{ row.publishedVersion == null ? '首次提交' : `V${row.publishedVersion} 更新` }}</span>
										<span v-if="row.moderationBanned" :class="$style.warnBadge">已封禁</span>
										<span v-for="tag in row.riskTags" :key="tag">{{ tag }}</span>
									</div>
									<div :class="$style.rowMeta">
										<UserAcctInline :user="row.user" :fallback="row.userId" @copy="copyText"/>
										<time>{{ formatTime(row.updatedAt) }}</time>
									</div>
								</button>
							</div>
							<div v-if="reviewRows.length > 0 && reviewHasMore" :class="$style.loadMore">
								<MkButton v-appear="prefer.s.enableInfiniteScroll ? loadMoreReviews : null" small rounded :disabled="reviewLoading" @click="loadMoreReviews"><i class="ti ti-chevron-down"></i> {{ reviewLoading ? '载入中…' : '继续载入' }}</MkButton>
							</div>
						</section>

						<aside :class="$style.detailPane">
							<MkLoading v-if="reviewDetailLoading"/>
							<ReviewDetail v-else-if="reviewDetail" :detail="reviewDetail" :canModerate="iAmModerator" @approve="approveReview" @reject="rejectReview" @ban="toggleCharacterBan" @copy="copyText"/>
							<div v-else :class="$style.emptyDetail">
								<i class="ti ti-click"></i>
								<p>选择一条内容查看完整提示词、差异和治理操作。</p>
							</div>
						</aside>
					</div>
				</template>

				<template v-else-if="activeView === 'sessions'">
					<section :class="$style.filterBand">
						<FormSplit :minWidth="240">
							<MkInput v-model="sessionFilters.userId" type="text"><template #label>用户名 / acct</template></MkInput>
							<MkInput v-model="sessionFilters.sessionId" type="text"><template #label>会话 ID</template></MkInput>
						</FormSplit>
						<div class="_buttons">
							<MkButton primary rounded :disabled="sessionsLoading" @click="loadSessions(true)"><i class="ti ti-search"></i> 检索会话</MkButton>
							<MkButton rounded :disabled="sessionsLoading" @click="resetSessionFilters"><i class="ti ti-filter-off"></i> 重置</MkButton>
						</div>
					</section>
					<section :class="$style.searchSection">
						<div :class="$style.sectionHead">
							<div>
								<h2>消息检索</h2>
								<p>按用户、会话、角色或关键词检索历史消息。</p>
							</div>
						</div>
						<FormSplit :minWidth="220">
							<MkInput v-model="messageFilters.userId" type="text"><template #label>用户名 / acct</template></MkInput>
							<MkInput v-model="messageFilters.sessionId" type="text"><template #label>会话 ID</template></MkInput>
							<MkInput v-model="messageFilters.characterId" type="text"><template #label>角色 ID</template></MkInput>
						</FormSplit>
						<FormSplit :minWidth="220">
							<MkSelect v-model="messageFilters.role" :items="roleItems"><template #label>消息角色</template></MkSelect>
							<MkInput v-model="messageFilters.query" type="text"><template #label>关键词</template></MkInput>
						</FormSplit>
						<div class="_buttons">
							<MkButton primary rounded :disabled="messagesLoading" @click="searchMessages"><i class="ti ti-search"></i> 检索消息</MkButton>
							<MkButton rounded :disabled="messagesLoading" @click="resetMessageFilters"><i class="ti ti-filter-off"></i> 重置</MkButton>
						</div>
						<MkLoading v-if="messagesLoading"/>
						<MkInfo v-else-if="messagesSearched && messages.length === 0">没有匹配的消息。</MkInfo>
						<div v-else-if="messages.length > 0" :class="$style.messageResults">
							<article v-for="row in messages" :key="row.id" v-panel :class="$style.messageCard">
								<div :class="$style.cardHead">
									<div :class="$style.badges">
										<span>{{ roleLabel(row.role) }}</span>
										<span>{{ sessionKindLabel(row.sessionKind) }}</span>
									</div>
									<time>{{ formatTime(row.createdAt) }}</time>
								</div>
								<div :class="$style.metaGrid">
									<span>用户：<UserAcctInline :user="row.user" :fallback="row.userId" @copy="copyText"/></span>
									<span>会话：{{ row.sessionName }}</span>
									<span>角色：{{ row.characterName || '—' }}</span>
								</div>
								<pre :class="$style.pre">{{ row.content }}</pre>
								<div class="_buttons">
									<MkButton small rounded @click="jumpSession(row.sessionId)"><i class="ti ti-arrow-right"></i> 查看会话</MkButton>
									<MkButton small rounded @click="copyText(row.id)"><i class="ti ti-copy"></i> 复制消息 ID</MkButton>
								</div>
							</article>
							<div v-if="messagesHasMore" :class="$style.loadMore">
								<MkButton v-appear="prefer.s.enableInfiniteScroll ? () => messagesPagination.load(false) : null" small rounded :disabled="messagesLoading" @click="messagesPagination.load(false)"><i class="ti ti-chevron-down"></i> {{ messagesLoading ? '载入中…' : '继续载入' }}</MkButton>
							</div>
						</div>
					</section>
					<div :class="$style.splitPane">
						<section :class="$style.listPane">
							<div :class="$style.sectionHead">
								<div>
									<h2>会话治理</h2>
									<p>查看会话时间线并封禁异常会话。</p>
								</div>
							</div>
							<MkLoading v-if="sessionsLoading && sessions.length === 0"/>
							<MkInfo v-else-if="sessions.length === 0">没有匹配的会话。</MkInfo>
							<div v-else :class="$style.list">
								<button v-for="row in sessions" :key="row.id" type="button" class="_button" :class="[$style.sessionRow, selectedSession?.id === row.id ? $style.rowActive : null]" @click="selectSession(row)">
									<div :class="$style.rowHead">
										<b>{{ row.name }}</b>
										<span :class="[row.moderationBanned ? $style.warnBadge : $style.typeBadge]">{{ row.moderationBanned ? '已封禁' : sessionKindLabel(row.sessionKind) }}</span>
									</div>
									<p>{{ row.characterName || '—' }}</p>
									<div :class="$style.rowMeta">
										<UserAcctInline :user="row.user" :fallback="row.userId" @copy="copyText"/>
										<time>{{ formatTime(row.lastMessageAt || row.updatedAt) }}</time>
									</div>
								</button>
							</div>
							<div v-if="sessions.length > 0 && sessionsHasMore" :class="$style.loadMore">
								<MkButton v-appear="prefer.s.enableInfiniteScroll ? () => sessionsPagination.load(false) : null" small rounded :disabled="sessionsLoading" @click="sessionsPagination.load(false)"><i class="ti ti-chevron-down"></i> {{ sessionsLoading ? '载入中…' : '继续载入' }}</MkButton>
							</div>
						</section>
						<aside :class="$style.detailPane">
							<MkLoading v-if="sessionDetailLoading"/>
							<SessionDetail v-else-if="sessionDetail" :detail="sessionDetail" :canModerate="iAmModerator" :messagesLoading="sessionMessagesLoading" @toggleBan="toggleSessionBan" @copy="copyText" @loadMoreMessages="loadMoreSessionMessages"/>
							<div v-else :class="$style.emptyDetail">
								<i class="ti ti-messages"></i>
								<p>选择会话查看最近消息。</p>
							</div>
						</aside>
					</div>

				</template>

				<template v-else-if="activeView === 'externalAudit'">
					<section :class="$style.filterBand">
						<FormSplit :minWidth="220">
							<MkSelect v-model="externalFilters.status" :items="externalStatusItems"><template #label>状态</template></MkSelect>
							<MkInput v-model="externalFilters.blockCode" type="text"><template #label>拦截编码</template></MkInput>
						</FormSplit>
						<FormSplit :minWidth="220">
							<MkInput v-model="externalFilters.userId" type="text"><template #label>用户名 / acct</template></MkInput>
							<MkInput v-model="externalFilters.sessionId" type="text"><template #label>会话 ID</template></MkInput>
							<MkInput v-model="externalFilters.modelId" type="text"><template #label>外审模型 ID</template></MkInput>
						</FormSplit>
						<MkInput v-model="externalFilters.query" type="text"><template #label>关键词</template></MkInput>
						<div class="_buttons">
							<MkButton primary rounded :disabled="externalLoading" @click="loadExternalAudits(true)"><i class="ti ti-search"></i> 检索外审</MkButton>
							<MkButton rounded :disabled="externalLoading" @click="resetExternalFilters"><i class="ti ti-filter-off"></i> 重置</MkButton>
						</div>
					</section>
					<MkLoading v-if="externalLoading && externalAudits.length === 0"/>
					<MkInfo v-else-if="externalAudits.length === 0">暂无外审拦截记录。</MkInfo>
					<div v-else :class="$style.evidenceList">
						<article v-for="row in externalAudits" :key="row.id" v-panel :class="$style.evidenceCard">
							<div :class="$style.cardHead">
								<div :class="$style.badges">
									<span :class="row.status === 'block' ? $style.warnBadge : null">{{ externalStatusLabel(row.status) }}</span>
									<code v-if="row.blockCode">{{ row.blockCode }}</code>
								</div>
								<time>{{ formatTime(row.createdAt) }}</time>
							</div>
							<div :class="$style.metaGrid">
								<span>用户：<UserAcctInline :user="row.user" :fallback="row.userId || '—'" @copy="copyText"/></span>
								<span>会话：{{ row.sessionName || row.sessionId || '—' }}</span>
								<span>角色：{{ row.characterName || '—' }}</span>
								<span>模型：{{ row.modelName || row.modelId || '—' }}</span>
							</div>
							<div :class="$style.decisionBox">
								<b>{{ row.category || '未分类' }}</b>
								<p>{{ row.reason || row.errorMessage || '—' }}</p>
							</div>
							<div :class="$style.twoCol">
								<section>
									<h3>用户侧内容</h3>
									<pre :class="$style.pre">{{ row.userText || '—' }}</pre>
								</section>
								<section>
									<h3>待展示/执行内容</h3>
									<pre :class="$style.pre">{{ row.assistantText || '—' }}</pre>
								</section>
							</div>
							<div class="_buttons">
								<MkButton small rounded @click="copyText(row.blockCode || row.id)"><i class="ti ti-copy"></i> 复制编码</MkButton>
								<MkButton v-if="row.sessionId" small rounded @click="jumpSession(row.sessionId)"><i class="ti ti-arrow-right"></i> 查看会话</MkButton>
							</div>
						</article>
						<div v-if="externalHasMore" :class="$style.loadMore">
							<MkButton v-appear="prefer.s.enableInfiniteScroll ? () => externalPagination.load(false) : null" small rounded :disabled="externalLoading" @click="externalPagination.load(false)"><i class="ti ti-chevron-down"></i> {{ externalLoading ? '载入中…' : '继续载入' }}</MkButton>
						</div>
					</div>
				</template>

				<template v-else-if="activeView === 'review'">
					<section :class="$style.filterBand">
						<FormSplit :minWidth="220">
							<MkInput v-model="reviewUserFilter" type="text"><template #label>用户名 / acct</template></MkInput>
						</FormSplit>
						<div class="_buttons">
							<MkButton primary rounded :disabled="reviewListLoading" @click="loadReviewListItems(true)"><i class="ti ti-search"></i> 检索</MkButton>
							<MkButton rounded :disabled="reviewListLoading" @click="resetReviewListFilters"><i class="ti ti-filter-off"></i> 重置</MkButton>
						</div>
					</section>
					<MkLoading v-if="reviewListLoading && reviewUserCards.length === 0" style="margin-top: 12px;"/>
					<MkInfo v-else-if="reviewUserCards.length === 0" style="margin-top: 12px;">暂无需要复审的用户。配置复审触发条件后，满足条件的用户将自动出现在这里。</MkInfo>
					<div v-else :class="$style.reviewUserList">
						<article v-for="card in reviewUserCards" :key="card.userId" v-panel :class="[$style.reviewUserCard, card.isSuspended ? $style.reviewUserCardSuspended : null]">
							<!-- 用户头部：核心信息 + 操作入口 -->
							<div :class="$style.reviewUserHead">
								<div :class="$style.reviewUserInfo">
									<div :class="$style.reviewUserName">
										<UserAcctInline :user="card.user" :fallback="card.userId" @copy="copyText"/>
										<span v-if="card.isSuspended" :class="$style.warnBadge">已封禁</span>
										<span :class="$style.reviewBadge">{{ card.blockCount }} 次拦截</span>
									</div>
									<div :class="$style.reviewUserMeta">
										<span>最近拦截：{{ formatTime(card.latestBlockAt) }}</span>
										<span v-if="card.suspendedUntil">解封时间：{{ formatTime(card.suspendedUntil) }}</span>
									</div>
								</div>
								<div :class="$style.reviewUserActions">
									<MkButton v-if="iAmModerator" small rounded @click="ignoreReviewUser(card)"><i class="ti ti-eye-off"></i> 忽略</MkButton>
									<MkButton v-if="iAmModerator" small rounded danger @click="openQuickActionForUser(card)"><i class="ti ti-gavel"></i> 处理</MkButton>
									<MkButton small rounded @click="toggleReviewUserExpand(card.userId)"><i :class="expandedReviewUsers.has(card.userId) ? 'ti ti-chevron-up' : 'ti ti-chevron-down'"></i> {{ expandedReviewUsers.has(card.userId) ? '收起' : '展开' }}</MkButton>
								</div>
							</div>

							<!-- 管理笔记预览 -->
							<div v-if="card.moderationNote" :class="$style.reviewNotePreview">
								<i class="ti ti-notes"></i>
								<div>
									<b :class="$style.reviewNoteLabel">管理笔记</b>
									<pre>{{ card.moderationNote }}</pre>
								</div>
							</div>

							<!-- 展开的违规记录列表 -->
							<div v-if="expandedReviewUsers.has(card.userId)" :class="$style.reviewLogList">
								<div v-for="log in card.logs" :key="log.id" :class="[$style.reviewLogItem, log.sessionModerationBanned ? $style.reviewLogItemBanned : null]">
									<div :class="$style.reviewLogHead">
										<div :class="$style.badges">
											<code v-if="log.blockCode">{{ log.blockCode }}</code>
											<span v-if="log.category">{{ log.category }}</span>
											<span v-if="log.sessionModerationBanned" :class="$style.warnBadge">会话已封禁</span>
										</div>
										<time>{{ formatTime(log.createdAt) }}</time>
									</div>
									<div :class="$style.reviewLogMeta">
										<span>会话：{{ log.sessionName || log.sessionId || '—' }}</span>
										<span>角色：{{ log.characterName || '—' }}</span>
									</div>
									<div v-if="log.reason" :class="$style.reviewLogReason">{{ log.reason }}</div>
									<div :class="$style.twoCol">
										<section>
											<h3>用户输入</h3>
											<pre :class="$style.pre">{{ log.userText || '—' }}</pre>
										</section>
										<section>
											<h3>AI 回复</h3>
											<pre :class="$style.pre">{{ log.assistantText || '—' }}</pre>
										</section>
									</div>
									<div class="_buttons">
										<MkButton v-if="log.sessionId" small rounded @click="jumpSession(log.sessionId)"><i class="ti ti-arrow-right"></i> 查看会话</MkButton>
										<MkButton small rounded @click="copyText(log.blockCode || log.id)"><i class="ti ti-copy"></i> 复制编码</MkButton>
									</div>
								</div>
							</div>
						</article>

						<div v-if="reviewListHasMore" :class="$style.loadMore">
							<MkButton small rounded :disabled="reviewListLoading" @click="loadMoreReviewUsers"><i class="ti ti-chevron-down"></i> {{ reviewListLoading ? '载入中…' : '加载更多用户' }}</MkButton>
						</div>
					</div>
				</template>

				<template v-else-if="activeView === 'images'">
					<section :class="$style.filterBand">
						<FormSplit :minWidth="220">
							<MkInput v-model="imageFilters.userId" type="text"><template #label>用户名 / acct</template></MkInput>
							<MkInput v-model="imageFilters.sessionId" type="text"><template #label>会话 ID</template></MkInput>
							<MkInput v-model="imageFilters.messageId" type="text"><template #label>消息 ID</template></MkInput>
						</FormSplit>
						<FormSplit :minWidth="220">
							<MkSelect v-model="imageFilters.status" :items="imageStatusItems"><template #label>状态</template></MkSelect>
							<MkSelect v-model="imageFilters.blocked" :items="blockedItems"><template #label>封禁状态</template></MkSelect>
							<MkInput v-model="imageFilters.query" type="text"><template #label>Prompt 关键词</template></MkInput>
						</FormSplit>
						<div class="_buttons">
							<MkButton primary rounded :disabled="imagesLoading" @click="loadImages(true)"><i class="ti ti-search"></i> 查询图片</MkButton>
							<MkButton rounded :disabled="imagesLoading" @click="resetImageFilters"><i class="ti ti-filter-off"></i> 重置</MkButton>
						</div>
					</section>
					<MkLoading v-if="imagesLoading && images.length === 0"/>
					<MkInfo v-else-if="images.length === 0">没有匹配的 AI 生图记录。</MkInfo>
					<div v-else :class="$style.imageGrid">
						<article v-for="row in images" :key="row.id" v-panel :class="$style.imageCard">
							<div :class="$style.imageBox">
								<img v-if="row.url && !row.isBlocked && row.status !== 'auto_cleaned'" :src="row.url" alt="AI生成图片">
								<div v-else :class="$style.imageEmpty">
									<i :class="row.status === 'auto_cleaned' ? 'ti ti-trash' : row.isBlocked ? 'ti ti-ban' : 'ti ti-photo-off'"></i>
									<span>{{ imageStateLabel(row) }}</span>
								</div>
							</div>
							<div :class="$style.imageBody">
								<div :class="$style.cardHead">
									<b>{{ row.provider }} / {{ row.imageModelId }}</b>
									<span :class="row.isBlocked ? $style.warnBadge : $style.typeBadge">{{ imageStateLabel(row) }}</span>
								</div>
								<p>{{ row.tag }}</p>
								<div :class="$style.metaGrid">
									<span>尺寸：{{ row.size }}</span>
									<span>费用：{{ row.cost }}</span>
									<span>用户：<UserAcctInline :user="row.user" :fallback="row.userId" @copy="copyText"/></span>
									<code>{{ row.sessionId }}</code>
								</div>
								<div class="_buttons">
									<MkButton v-if="row.url && !row.isBlocked && row.status !== 'auto_cleaned'" small rounded @click="openUrl(row.url)"><i class="ti ti-external-link"></i> 打开图片</MkButton>
									<MkButton v-if="iAmModerator && row.status !== 'auto_cleaned'" small rounded :danger="!row.isBlocked" @click="toggleImageBlocked(row)"><i class="ti ti-ban"></i> {{ row.isBlocked ? '解封图片' : '封禁图片' }}</MkButton>
									<MkButton small rounded @click="jumpSession(row.sessionId)"><i class="ti ti-arrow-right"></i> 查看会话</MkButton>
								</div>
							</div>
						</article>
						<div v-if="imagesHasMore" :class="$style.loadMore">
							<MkButton v-appear="prefer.s.enableInfiniteScroll ? () => imagesPagination.load(false) : null" small rounded :disabled="imagesLoading" @click="imagesPagination.load(false)"><i class="ti ti-chevron-down"></i> {{ imagesLoading ? '载入中…' : '继续载入' }}</MkButton>
						</div>
					</div>
				</template>

				<template v-else-if="activeView === 'logs'">
					<section :class="$style.filterBand">
						<MkSelect v-model="logType" :items="logTypeItems"><template #label>记录类型</template></MkSelect>
						<div class="_buttons">
							<MkButton primary rounded :disabled="logsLoading" @click="loadLogs(true)"><i class="ti ti-search"></i> 检索日志</MkButton>
						</div>
					</section>
					<MkLoading v-if="logsLoading && logs.length === 0"/>
					<MkInfo v-else-if="logs.length === 0">暂无治理记录。</MkInfo>
					<div v-else :class="$style.evidenceList">
						<article v-for="log in logs" :key="log.id" v-panel :class="$style.logCard">
							<div :class="$style.cardHead">
								<div>
									<b>{{ logTitle(log) }}</b>
									<span :class="$style.logDecision">{{ logDecisionLabel(log) }}</span>
								</div>
								<time>{{ formatTime(log.createdAt) }}</time>
							</div>
							<div :class="$style.rowMeta">
								<span>操作人：<UserAcctInline :user="log.user" :fallback="log.userId" @copy="copyText"/></span>
							</div>
							<div :class="$style.metaGrid">
								<span v-for="row in logRows(log)" :key="row.label">
									{{ row.label }}：
									<UserAcctInline v-if="row.copyAsAcct" :fallback="row.value" @copy="copyText"/>
									<template v-else>{{ row.value }}</template>
								</span>
							</div>
							<div v-if="logNote(log)" :class="$style.decisionBox">
								<p>{{ logNote(log) }}</p>
							</div>
						</article>
						<div v-if="logsHasMore" :class="$style.loadMore">
							<MkButton v-appear="prefer.s.enableInfiniteScroll ? () => logsPagination.load(false) : null" small rounded :disabled="logsLoading" @click="logsPagination.load(false)"><i class="ti ti-chevron-down"></i> {{ logsLoading ? '载入中…' : '继续载入' }}</MkButton>
						</div>
					</div>
				</template>
			</main>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, defineComponent, h, onMounted, reactive, ref, watch } from 'vue';
import MkButton from '@/components/MkButton.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkInput from '@/components/MkInput.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkDriveFileThumbnail from '@/components/MkDriveFileThumbnail.vue';
import FormSplit from '@/components/form/split.vue';
import { misskeyApi, formatApiError } from '@/utility/misskey-api.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import { definePage } from '@/page.js';
import { formatDateTimeString } from '@/utility/format-time-string.js';
import { acct as userAcct } from '@/filters/user.js';
import * as os from '@/os.js';
import MkAgentQuickActionDialog from '@/components/MkAgentQuickActionDialog.vue';
import { useGovernancePagination } from '@/composables/use-governance-pagination.js';
import { prefer } from '@/preferences.js';
import { iAmModerator, $i } from '@/i.js';

type ViewKey = 'overview' | 'queue' | 'library' | 'sessions' | 'externalAudit' | 'review' | 'images' | 'logs';
type Kind = 'character' | 'style';
type ReviewRow = {
	kind: Kind;
	id: string;
	userId: string;
	name: string;
	summary: string | null;
	reviewStatus: string;
	isPublished: boolean;
	publishedVersion: number | null;
	moderationBanned: boolean;
	promptOpenSourced: boolean;
	reviewRejectReason: string | null;
	reviewRejectMessage: string | null;
	reviewInternalNote: string | null;
	createdAt: string;
	updatedAt: string;
	user: any | null;
	avatar: any | null;
	worldbookCount: number;
	riskTags: string[];
};
type ReviewDetailRow = ReviewRow & {
	personality?: string;
	background?: string;
	speakingStyle?: string;
	greeting?: string;
	exampleTurns?: { role: 'user' | 'assistant'; content: string }[];
	forbiddenBehavior?: string;
	worldbook?: WorldbookEntry[];
	body?: string;
	publishedSnapshot: Record<string, unknown> | null;
	diff: { hasChanges: boolean; fields: { key: string; draftPreview: string; publishedPreview: string }[] };
};
type WorldbookEntry = { id: string; title: string; content: string; keywords: string[]; triggerMode: 'keyword' | 'manual' | 'always'; priority: number; enabled: boolean; revision: number };
type SessionRow = { id: string; createdAt: string; updatedAt: string; userId: string; name: string; characterId: string; dialogueStyleId: string | null; sessionKind: 'draft_test' | 'community'; lastMessageAt: string | null; agentReplyPending: boolean; moderationBanned: boolean; characterName: string; user: any | null };
type TimelineMsg = { id: string; role: 'user' | 'assistant' | 'system'; content: string; createdAt: string };
type SessionDetailRow = { session: SessionRow; messages: TimelineMsg[]; hasMoreMessages?: boolean };
type MessageRow = TimelineMsg & { sessionId: string; sessionName: string; sessionKind: 'draft_test' | 'community'; userId: string; user: any | null; characterId: string; characterName: string; dialogueStyleId: string | null; sessionModerationBanned: boolean; characterModerationBanned: boolean };
type ExternalStatus = 'allow' | 'block' | 'failed' | 'all_failed';
type ExternalAuditRow = { id: string; createdAt: string; completedAt: string | null; durationMs: number | null; userId: string | null; user: any | null; sessionId: string | null; sessionName: string | null; sessionModerationBanned?: boolean; characterId: string | null; characterName: string; dialogueStyleId: string | null; modelId: string | null; modelName: string | null; apiModelName: string | null; baseUrl: string | null; priority: number; attemptIndex: number; status: ExternalStatus; blockCode: string | null; category: string | null; reason: string | null; confidence: number | null; userText: string | null; assistantText: string | null; responseText: string | null; errorCode: string | null; errorMessage: string | null; userRecentBlockCount?: number; triggeredRules?: { id: string; timeWindowMinutes: number; blockThreshold: number }[] };
type ImageRow = { id: string; createdAt: string; updatedAt: string; userId: string; user: any | null; sessionId: string; messageId: string | null; placeholderIndex: number; tag: string; size: string; provider: string; imageModelId: string; status: string; fileId: string | null; url: string | null; errorCode: string | null; cost: number; isBlocked: boolean; blockedReason: string | null; autoCleanedAt: string | null; autoCleanedReason: string | null };
type AgentLog = { id: string; createdAt: string; type: string; info: Record<string, unknown>; userId: string; user: any };

const UserAcctInline = defineComponent({
	props: {
		user: { type: Object, required: false, default: null },
		fallback: { type: String, required: false, default: null },
	},
	emits: ['copy'],
	setup(props, { emit }) {
		return () => {
			const acct = props.user ? `@${userAcct(props.user as any)}` : props.fallback;
			const canCopy = typeof acct === 'string' && acct !== '' && acct !== '-';

			return h('span', { class: 'agent-user-acct' }, [
				h('code', acct || '-'),
				h('button', {
					type: 'button',
					class: 'agent-user-acct-copy _button',
					title: 'Copy username / acct',
					disabled: !canCopy,
					onClick: (ev: MouseEvent) => {
						ev.stopPropagation();
						if (canCopy) emit('copy', acct);
					},
				}, [h('i', { class: 'ti ti-copy' })]),
			]);
		};
	},
});
type Summary = { pendingCharacters: number; pendingStyles: number; pendingTotal: number; bannedCharacters: number; bannedSessions: number; blockedExternalAudits: number; blockedImages: number; recentOperations: number };

const api = misskeyApi as unknown as <T>(endpoint: string, data?: Record<string, unknown>) => Promise<T>;
const activeView = ref<ViewKey>((new URLSearchParams(window.location.search).get('view') as ViewKey) || 'overview');
if (!['overview', 'queue', 'library', 'sessions', 'externalAudit', 'review', 'images', 'logs'].includes(activeView.value)) activeView.value = 'overview';

const summaryLoading = ref(false);
const summary = ref<Summary | null>(null);
const REVIEW_PAGE_SIZE = 50;
const selectedReview = ref<ReviewRow | null>(null);
const reviewDetail = ref<ReviewDetailRow | null>(null);
const reviewDetailLoading = ref(false);
const reviewFilters = reactive({ kind: 'all', status: 'pending', query: '', userId: '' });
const reviewFilterOpen = ref(false);
const hasActiveReviewFilters = computed(() => {
	return reviewFilters.kind !== 'all' || reviewFilters.query.trim() !== '' || reviewFilters.userId.trim() !== ''
		|| (activeView.value === 'library' && reviewFilters.status !== 'all');
});

// 审核列表分页
const reviewPagination = useGovernancePagination<ReviewRow>(async (untilId) => {
	const rows = await api<ReviewRow[]>('admin/agents/governance/review/list', {
		kind: reviewFilters.kind,
		status: activeView.value === 'queue' ? 'pending' : reviewFilters.status,
		query: reviewFilters.query.trim() || null,
		userId: reviewFilters.userId.trim() || null,
		limit: REVIEW_PAGE_SIZE + 1,
		untilId,
	});
	return rows;
}, { pageSize: REVIEW_PAGE_SIZE });
const reviewRows = reviewPagination.items;
const reviewLoading = reviewPagination.loading;
const reviewHasMore = reviewPagination.hasMore;

const selectedSession = ref<SessionRow | null>(null);
const sessionDetail = ref<SessionDetailRow | null>(null);
const sessionDetailLoading = ref(false);
const sessionMessagesLoading = ref(false);
const sessionFilters = reactive({ userId: '', sessionId: '' });

// 会话列表分页
const sessionsPagination = useGovernancePagination<SessionRow>(async (untilId) => {
	return await api<SessionRow[]>('admin/agents/governance/sessions/list', {
		userId: sessionFilters.userId.trim() || null,
		sessionId: sessionFilters.sessionId.trim() || null,
		limit: 50,
		untilId,
	});
}, { pageSize: 50 });
const sessions = sessionsPagination.items;
const sessionsLoading = sessionsPagination.loading;
const sessionsHasMore = sessionsPagination.hasMore;

const messagesSearched = ref(false);
const messageFilters = reactive({ userId: '', sessionId: '', characterId: '', role: 'all', query: '' });

// 消息检索分页
const messagesPagination = useGovernancePagination<MessageRow>(async (untilId) => {
	const payload: Record<string, unknown> = { limit: 80, untilId };
	const userId = messageFilters.userId.trim();
	const sessionId = messageFilters.sessionId.trim();
	const characterId = messageFilters.characterId.trim();
	const query = messageFilters.query.trim();
	if (userId) payload.userId = userId;
	if (sessionId) payload.sessionId = sessionId;
	if (characterId) payload.characterId = characterId;
	if (messageFilters.role !== 'all') payload.role = messageFilters.role;
	if (query) payload.query = query;
	return await api<MessageRow[]>('admin/agents/governance/messages/list', payload);
}, { pageSize: 80 });
const messages = messagesPagination.items;
const messagesLoading = messagesPagination.loading;
const messagesHasMore = messagesPagination.hasMore;

const externalFilters = reactive({ status: 'block' as ExternalStatus | 'all', blockCode: '', userId: '', sessionId: '', modelId: '', query: '' });

// 外审列表分页
const externalPagination = useGovernancePagination<ExternalAuditRow>(async (untilId) => {
	return await api<ExternalAuditRow[]>('admin/agents/governance/external-audit/list', {
		status: externalFilters.status === 'all' ? null : externalFilters.status,
		blockCode: externalFilters.blockCode.trim() || null,
		userId: externalFilters.userId.trim() || null,
		sessionId: externalFilters.sessionId.trim() || null,
		modelId: externalFilters.modelId.trim() || null,
		query: externalFilters.query.trim() || null,
		limit: 80,
		untilId,
	});
}, { pageSize: 80 });
const externalAudits = externalPagination.items;
const externalLoading = externalPagination.loading;
const externalHasMore = externalPagination.hasMore;

const imageFilters = reactive({ userId: '', sessionId: '', messageId: '', status: '', blocked: '', query: '' });

// 图片列表分页
const imagesPagination = useGovernancePagination<ImageRow>(async (untilId) => {
	return await api<ImageRow[]>('admin/agents/governance/images/list', {
		userId: imageFilters.userId.trim() || null,
		sessionId: imageFilters.sessionId.trim() || null,
		messageId: imageFilters.messageId.trim() || null,
		status: imageFilters.status || null,
		blocked: imageFilters.blocked === '' ? null : imageFilters.blocked === 'true',
		query: imageFilters.query.trim() || null,
		limit: 80,
		untilId,
	});
}, { pageSize: 80 });
const images = imagesPagination.items;
const imagesLoading = imagesPagination.loading;
const imagesHasMore = imagesPagination.hasMore;

const logType = ref('all');

// 日志列表分页
const logsPagination = useGovernancePagination<AgentLog>(async (untilId) => {
	return await api<AgentLog[]>('admin/agents/governance/logs/list', { type: logType.value, limit: 80, untilId });
}, { pageSize: 80 });
const logs = logsPagination.items;
const logsLoading = logsPagination.loading;
const logsHasMore = logsPagination.hasMore;

// 复审列表 - 以用户为中心
const reviewUserFilter = ref('');
const reviewListLoading = ref(false);
const reviewListHasMore = ref(false);
const reviewUserCards = ref<ReviewUserCard[]>([]);
const expandedReviewUsers = reactive(new Set<string>());
const reviewOffset = ref(0);
const REVIEW_USER_PAGE_SIZE = 20;

type ReviewUserCard = {
	userId: string;
	user: any | null;
	isSuspended: boolean;
	suspendedUntil: string | null;
	moderationNote: string | null;
	blockCount: number;
	latestBlockAt: string | null;
	triggeredRules: { id: string; timeWindowMinutes: number; blockThreshold: number }[];
	logs: ReviewLogEntry[];
};

type ReviewLogEntry = {
	id: string;
	createdAt: string;
	sessionId: string | null;
	sessionName: string | null;
	sessionModerationBanned: boolean;
	characterName: string;
	blockCode: string | null;
	category: string | null;
	reason: string | null;
	userText: string | null;
	assistantText: string | null;
};

async function loadReviewListItems(reset: boolean) {
	if (reviewListLoading.value) return;
	reviewListLoading.value = true;
	if (reset) {
		reviewUserCards.value = [];
		reviewOffset.value = 0;
		reviewListHasMore.value = false;
		expandedReviewUsers.clear();
	}
	try {
		const rows = await api<ReviewUserCard[]>('admin/agents/governance/external-audit/review-list', {
			userId: reviewUserFilter.value.trim() || null,
			limit: REVIEW_USER_PAGE_SIZE + 1,
			offset: reviewOffset.value,
		});
		reviewListHasMore.value = rows.length > REVIEW_USER_PAGE_SIZE;
		const pageRows = rows.slice(0, REVIEW_USER_PAGE_SIZE);
		reviewUserCards.value = reset ? pageRows : [...reviewUserCards.value, ...pageRows];
		reviewOffset.value += pageRows.length;
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	} finally {
		reviewListLoading.value = false;
	}
}

function loadMoreReviewUsers() {
	void loadReviewListItems(false);
}

function resetReviewListFilters() {
	reviewUserFilter.value = '';
	void loadReviewListItems(true);
}

function toggleReviewUserExpand(userId: string) {
	if (expandedReviewUsers.has(userId)) {
		expandedReviewUsers.delete(userId);
	} else {
		expandedReviewUsers.add(userId);
	}
}

async function ignoreReviewUser(card: ReviewUserCard) {
	const userName = card.user ? `@${userAcct(card.user)}` : card.userId;
	const { canceled } = await os.confirm({
		type: 'question',
		title: '忽略复审',
		text: `确定忽略用户 ${userName} 的 ${card.logs.length} 条外审拦截记录？忽略后这批记录将标记为已审阅，该用户后续再次触发复审时仍会出现在列表中。`,
	});
	if (canceled) return;
	try {
		await api('admin/agents/governance/external-audit/review-ignore', {
			ids: card.logs.map(l => l.id),
		});
		os.toast('已忽略');
		await loadReviewListItems(true);
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	}
}

const headerTabs = computed(() => [
	{ key: 'overview', title: '概览', icon: 'ti ti-dashboard' },
	{ key: 'queue', title: '待处理', icon: 'ti ti-inbox' },
	{ key: 'library', title: '内容库', icon: 'ti ti-cards' },
	{ key: 'sessions', title: '会话治理', icon: 'ti ti-messages' },
	{ key: 'externalAudit', title: '外审拦截', icon: 'ti ti-shield-check' },
	{ key: 'review', title: '复审', icon: 'ti ti-shield-exclamation' },
	{ key: 'images', title: 'AI 生图', icon: 'ti ti-photo-shield' },
	{ key: 'logs', title: '操作日志', icon: 'ti ti-history' },
]);
const headerActions = computed(() => [{
	icon: 'ti ti-refresh',
	text: '刷新',
	handler: refreshCurrentView,
}]);
const summaryCards = computed(() => [
	{ key: 'pending', label: '待处理审核', value: summary.value?.pendingTotal ?? '—', icon: 'ti ti-inbox', target: 'queue' as ViewKey },
	{ key: 'characters', label: '待审角色', value: summary.value?.pendingCharacters ?? '—', icon: 'ti ti-user', target: 'queue' as ViewKey },
	{ key: 'styles', label: '待审风格', value: summary.value?.pendingStyles ?? '—', icon: 'ti ti-palette', target: 'queue' as ViewKey },
	{ key: 'sessions', label: '封禁会话', value: summary.value?.bannedSessions ?? '—', icon: 'ti ti-messages', target: 'sessions' as ViewKey },
	{ key: 'external', label: '外审拦截', value: summary.value?.blockedExternalAudits ?? '—', icon: 'ti ti-shield-check', target: 'externalAudit' as ViewKey },
	{ key: 'images', label: '封禁图片', value: summary.value?.blockedImages ?? '—', icon: 'ti ti-photo-shield', target: 'images' as ViewKey },
]);

const kindItems = [{ value: 'all', label: '全部' }, { value: 'character', label: '角色' }, { value: 'style', label: '风格提示词' }];
const reviewStatusItems = computed(() => activeView.value === 'queue'
	? [{ value: 'pending', label: '待审' }]
	: [{ value: 'all', label: '全部' }, { value: 'pending', label: '待审' }, { value: 'published', label: '已发布' }, { value: 'rejected', label: '已拒绝' }, { value: 'draft', label: '草稿' }]);
const roleItems = [{ value: 'all', label: '全部' }, { value: 'user', label: '用户' }, { value: 'assistant', label: '智能体' }, { value: 'system', label: '系统' }];
const externalStatusItems = [{ value: 'block', label: '已拦截' }, { value: 'allow', label: '已放行' }, { value: 'failed', label: '模型失败' }, { value: 'all_failed', label: '全部失败放行' }, { value: 'all', label: '全部' }];
const imageStatusItems = [{ value: '', label: '全部' }, { value: 'generating', label: '生成中' }, { value: 'succeeded', label: '成功' }, { value: 'failed', label: '失败' }, { value: 'blocked', label: '已封禁' }, { value: 'auto_cleaned', label: '图片已被清理' }];
const blockedItems = [{ value: '', label: '全部' }, { value: 'true', label: '已封禁' }, { value: 'false', label: '未封禁' }];
const logTypeItems = [{ value: 'all', label: '全部' }, { value: 'resolveAgentReview', label: '审核处理' }, { value: 'setAgentCharacterModerationBan', label: '角色封禁' }, { value: 'setAgentSessionModerationBan', label: '会话封禁' }];

definePage({ title: '智能体治理', icon: 'ti ti-shield-check' });

// 筛选条件持久化
const FILTER_STORAGE_KEY = 'agents-review-filters';

function saveFilters() {
	try {
		localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({
			review: { kind: reviewFilters.kind, status: reviewFilters.status, query: reviewFilters.query, userId: reviewFilters.userId },
			session: { userId: sessionFilters.userId, sessionId: sessionFilters.sessionId },
			external: { status: externalFilters.status, blockCode: externalFilters.blockCode, userId: externalFilters.userId, sessionId: externalFilters.sessionId, modelId: externalFilters.modelId, query: externalFilters.query },
			image: { userId: imageFilters.userId, sessionId: imageFilters.sessionId, messageId: imageFilters.messageId, status: imageFilters.status, blocked: imageFilters.blocked, query: imageFilters.query },
			logType: logType.value,
		}));
	} catch { /* ignore */ }
}

function restoreFilters() {
	try {
		const saved = localStorage.getItem(FILTER_STORAGE_KEY);
		if (!saved) return;
		const data = JSON.parse(saved);
		if (data.review) Object.assign(reviewFilters, data.review);
		if (data.session) Object.assign(sessionFilters, data.session);
		if (data.external) Object.assign(externalFilters, data.external);
		if (data.image) Object.assign(imageFilters, data.image);
		if (data.logType) logType.value = data.logType;
	} catch { /* ignore */ }
}

// 搜索防抖
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedLoadReview() {
	if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
	searchDebounceTimer = setTimeout(() => { void loadReviewList(true); }, 300);
}

watch(() => reviewFilters.query, () => { debouncedLoadReview(); saveFilters(); });
watch(() => reviewFilters.kind, () => { saveFilters(); });
watch(() => reviewFilters.status, () => { saveFilters(); });
watch(logType, () => { void loadLogs(true); saveFilters(); });

async function loadSummary() {
	summaryLoading.value = true;
	try {
		summary.value = await api<Summary>('admin/agents/governance/summary', {});
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	} finally {
		summaryLoading.value = false;
	}
}

watch(activeView, view => {
	const url = new URL(window.location.href);
	if (view === 'overview') url.searchParams.delete('view');
	else url.searchParams.set('view', view);
	window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
	if (view === 'overview') {
		void loadSummary();
		return;
	} else if (view === 'queue') {
		reviewFilters.status = 'pending';
		void loadReviewList(true);
	} else if (view === 'library') {
		if (reviewFilters.status === 'pending') reviewFilters.status = 'all';
		void loadReviewList(true);
	} else if (view === 'sessions' && sessions.value.length === 0) {
		void loadSessions(true);
	} else if (view === 'externalAudit' && externalAudits.value.length === 0) {
		void loadExternalAudits(true);
	} else if (view === 'review' && reviewUserCards.value.length === 0) {
		void loadReviewListItems(true);
	} else if (view === 'images' && images.value.length === 0) {
		void loadImages(true);
	} else if (view === 'logs' && logs.value.length === 0) {
		void loadLogs(true);
	}
});

async function refreshCurrentView() {
	await loadSummary();
	if (activeView.value === 'overview') return;
	if (activeView.value === 'queue' || activeView.value === 'library') await loadReviewList(true);
	else if (activeView.value === 'sessions') await loadSessions(true);
	else if (activeView.value === 'externalAudit') await loadExternalAudits(true);
	else if (activeView.value === 'review') await loadReviewListItems(true);
	else if (activeView.value === 'images') await loadImages(true);
	else await loadLogs(true);
}

async function loadReviewList(reset: boolean) {
	if (reset) {
		selectedReview.value = null;
		reviewDetail.value = null;
	}
	await reviewPagination.load(reset);
	if (reviewPagination.error.value) {
		os.alert({ type: 'error', text: formatApiError(reviewPagination.error.value) });
	}
}

function loadMoreReviews() {
	void reviewPagination.load(false);
}

function resetReviewFilters() {
	reviewFilters.kind = 'all';
	reviewFilters.status = activeView.value === 'queue' ? 'pending' : 'all';
	reviewFilters.query = '';
	reviewFilters.userId = '';
	void loadReviewList(true);
}

async function selectReview(row: ReviewRow) {
	selectedReview.value = row;
	reviewDetailLoading.value = true;
	try {
		reviewDetail.value = await api<ReviewDetailRow>('admin/agents/governance/review/detail', { kind: row.kind, id: row.id });
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	} finally {
		reviewDetailLoading.value = false;
	}
}

async function approveReview(row: ReviewDetailRow) {
	const { canceled } = await os.confirm({ type: 'info', text: `通过「${row.name}」？` });
	if (canceled) return;
	await resolveReview(row, 'approve', {});
}

async function rejectReview(row: ReviewDetailRow) {
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
	await resolveReview(row, 'reject', result);
}

async function resolveReview(row: ReviewDetailRow, decision: 'approve' | 'reject', extra: Record<string, unknown>) {
	try {
		await api('admin/agents/governance/review/resolve', { kind: row.kind, id: row.id, decision, ...extra });
		os.toast('已处理');
		await Promise.all([loadSummary(), loadReviewList(true)]);
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	}
}

async function toggleCharacterBan(row: ReviewDetailRow) {
	if (row.kind !== 'character') return;
	const next = !row.moderationBanned;
	const { canceled, result } = await os.form(next ? '封禁角色' : '解封角色', {
		reason: { type: 'string', label: '处理原因', required: next, multiline: true },
	});
	if (canceled) return;
	try {
		await api('admin/agents/governance/review/set-character-banned', { characterId: row.id, banned: next, reason: result.reason || null });
		os.toast('已处理');
		await loadSummary();
		await loadReviewList(true);
		const updated = reviewRows.value.find(item => item.kind === row.kind && item.id === row.id);
		if (updated) await selectReview(updated);
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	}
}

async function loadSessions(reset: boolean) {
	if (reset) {
		selectedSession.value = null;
		sessionDetail.value = null;
	}
	await sessionsPagination.load(reset);
	if (sessionsPagination.error.value) {
		os.alert({ type: 'error', text: formatApiError(sessionsPagination.error.value) });
	}
}

function resetSessionFilters() {
	sessionFilters.userId = '';
	sessionFilters.sessionId = '';
	void loadSessions(true);
}

async function selectSession(row: SessionRow) {
	selectedSession.value = row;
	sessionDetailLoading.value = true;
	try {
		const result = await api<SessionDetailRow>('admin/agents/governance/sessions/detail', { sessionId: row.id, limit: 80 });
		result.hasMoreMessages = result.messages.length >= 80;
		sessionDetail.value = result;
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	} finally {
		sessionDetailLoading.value = false;
	}
}

async function loadMoreSessionMessages() {
	if (!sessionDetail.value || sessionMessagesLoading.value) return;
	const oldestMsg = sessionDetail.value.messages[0];
	if (!oldestMsg) return;
	sessionMessagesLoading.value = true;
	try {
		const result = await api<SessionDetailRow>('admin/agents/governance/sessions/detail', {
			sessionId: sessionDetail.value.session.id,
			limit: 80,
			untilId: oldestMsg.id,
		});
		sessionDetail.value.hasMoreMessages = result.messages.length >= 80;
		sessionDetail.value.messages = [...result.messages, ...sessionDetail.value.messages];
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	} finally {
		sessionMessagesLoading.value = false;
	}
}

async function toggleSessionBan(row: SessionRow) {
	const next = !row.moderationBanned;
	const { canceled, result } = await os.form(next ? '封禁会话' : '解封会话', {
		reason: { type: 'string', label: '处理原因', required: next, multiline: true },
	});
	if (canceled) return;
	try {
		await api('admin/agents/governance/sessions/set-banned', { sessionId: row.id, banned: next, reason: result.reason || null });
		const selectedId = selectedSession.value?.id;
		await loadSummary();
		await loadSessions(true);
		const updated = sessions.value.find(item => item.id === row.id);
		if (updated && selectedId === row.id) await selectSession(updated);
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	}
}

async function searchMessages() {
	messagesSearched.value = true;
	await messagesPagination.load(true);
	if (messagesPagination.error.value) {
		os.alert({ type: 'error', text: formatApiError(messagesPagination.error.value) });
	}
}

function resetMessageFilters() {
	messageFilters.userId = '';
	messageFilters.sessionId = '';
	messageFilters.characterId = '';
	messageFilters.role = 'all';
	messageFilters.query = '';
	messagesPagination.reset();
	messagesSearched.value = false;
}

async function loadExternalAudits(reset: boolean) {
	await externalPagination.load(reset);
	if (externalPagination.error.value) {
		os.alert({ type: 'error', text: formatApiError(externalPagination.error.value) });
	}
}

function resetExternalFilters() {
	externalFilters.status = 'block';
	externalFilters.blockCode = '';
	externalFilters.userId = '';
	externalFilters.sessionId = '';
	externalFilters.modelId = '';
	externalFilters.query = '';
	void loadExternalAudits(true);
}

async function loadImages(reset: boolean) {
	await imagesPagination.load(reset);
	if (imagesPagination.error.value) {
		os.alert({ type: 'error', text: formatApiError(imagesPagination.error.value) });
	}
}

function resetImageFilters() {
	imageFilters.userId = '';
	imageFilters.sessionId = '';
	imageFilters.messageId = '';
	imageFilters.status = '';
	imageFilters.blocked = '';
	imageFilters.query = '';
	void loadImages(true);
}

async function toggleImageBlocked(row: ImageRow) {
	let reason: string | null = null;
	if (!row.isBlocked) {
		const result = await os.inputText({ title: '封禁原因', text: '可留空。' });
		if (result.canceled) return;
		reason = result.result || null;
	}
	try {
		await api('admin/agents/governance/images/set-blocked', { id: row.id, blocked: !row.isBlocked, reason });
		await Promise.all([loadSummary(), loadImages(true)]);
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	}
}

async function loadLogs(reset: boolean) {
	await logsPagination.load(reset);
	if (logsPagination.error.value) {
		os.alert({ type: 'error', text: formatApiError(logsPagination.error.value) });
	}
}

function jumpSession(sessionId: string) {
	activeView.value = 'sessions';
	sessionFilters.sessionId = sessionId;
	void loadSessions(true);
}

// 一键违规处理
const quickActionProcessing = ref(false);

async function openQuickActionForUser(card: ReviewUserCard) {
	// 收集该用户所有相关会话（含已封禁）
	const sessionMap = new Map<string, { name: string; banned: boolean }>();
	for (const log of card.logs) {
		if (log.sessionId && !sessionMap.has(log.sessionId)) {
			sessionMap.set(log.sessionId, {
				name: log.sessionName || log.sessionId,
				banned: log.sessionModerationBanned,
			});
		}
	}
	if (sessionMap.size === 0) {
		os.alert({ type: 'info', text: '该用户没有相关会话记录。' });
		return;
	}

	const userName = card.user ? `@${userAcct(card.user)}` : card.userId;
	const sessions = [...sessionMap.entries()].map(([id, s]) => ({ id, name: s.name, banned: s.banned }));
	const defaultCategory = card.logs[0]?.category || '色情内容';
	const defaultSuspendHours = card.blockCount >= 4 ? 0 : card.blockCount >= 3 ? 720 : card.blockCount >= 2 ? 168 : -1;

	const result = await new Promise<{ sessionIds: string[]; sessionBanReason: string | null; suspendDurationHours: number; userSuspendReason: string | null; moderationNote: string | null; violationCategory: string } | null>(resolve => {
		const { dispose } = os.popup(MkAgentQuickActionDialog, {
			userName,
			sessions,
			defaultCategory,
			defaultSuspendHours,
			moderatorName: $i?.username ?? '',
		}, {
			done: (res) => { resolve(res); dispose(); },
			cancel: () => { resolve(null); dispose(); },
			closed: () => { resolve(null); dispose(); },
		});
	});
	if (!result) return;

	quickActionProcessing.value = true;
	try {
		const res = await api<Record<string, unknown>>('admin/agents/governance/quick-action', {
			sessionIds: result.sessionIds,
			sessionBanReason: result.sessionBanReason,
			suspendDurationHours: result.suspendDurationHours,
			userSuspendReason: result.userSuspendReason,
			violationCategory: result.violationCategory,
			moderationNote: result.moderationNote,
		});
		const parts: string[] = [];
		if (res.sessionsBanned) parts.push(`${res.sessionsBanned} 个会话已封禁`);
		if (res.userSuspended) parts.push(`用户已封禁（${res.suspendDurationHours === 0 ? '永久' : `${res.suspendDurationHours}小时`}）`);
		if (res.noteAdded) parts.push('管理笔记已记录');
		os.toast(parts.join('，') || '处理完成');
		await Promise.all([loadSummary(), loadReviewListItems(true)]);
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	} finally {
		quickActionProcessing.value = false;
	}
}

function copyText(text: string) {
	copyToClipboard(text);
	os.toast('已复制');
}

function openUrl(url: string | null) {
	if (url) window.open(url, '_blank', 'noopener');
}

function formatTime(v: string | null | undefined) {
	return v ? formatDateTimeString(new Date(v), 'yyyy-MM-dd HH:mm') : '—';
}

function kindLabel(kind: string) {
	return kind === 'character' ? '角色' : '风格提示词';
}

function statusLabel(status: string) {
	if (status === 'pending') return '待审';
	if (status === 'published') return '已发布';
	if (status === 'rejected') return '已拒绝';
	if (status === 'draft') return '草稿';
	return status;
}

function sessionKindLabel(kind: string) {
	return kind === 'draft_test' ? '草稿测试' : '社区会话';
}

function roleLabel(role: string) {
	if (role === 'user') return '用户';
	if (role === 'assistant') return '智能体';
	return '系统';
}

function externalStatusLabel(status: string) {
	if (status === 'block') return '已拦截';
	if (status === 'allow') return '已放行';
	if (status === 'failed') return '模型失败';
	return '全部失败放行';
}

function imageStateLabel(row: ImageRow) {
	if (row.status === 'auto_cleaned') return '图片已被清理';
	if (row.isBlocked) return '已封禁';
	if (row.status === 'succeeded') return '成功';
	if (row.status === 'failed') return '失败';
	if (row.status === 'generating') return '生成中';
	return row.status;
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
		avatarFileId: '头像',
	};
	return labels[key] ?? key;
}

function logInfoString(log: AgentLog, key: string) {
	const value = log.info[key];
	return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function logInfoBoolean(log: AgentLog, key: string) {
	const value = log.info[key];
	return typeof value === 'boolean' ? value : null;
}

function logTitle(log: AgentLog) {
	if (log.type === 'resolveAgentReview') return '审核处理';
	if (log.type === 'setAgentSessionModerationBan') return '会话封禁处理';
	if (log.type === 'setAgentCharacterModerationBan') return '角色封禁处理';
	return log.type;
}

function logDecisionLabel(log: AgentLog) {
	if (log.type === 'resolveAgentReview') return logInfoString(log, 'decision') === 'approve' ? '通过' : '拒绝';
	if (log.type === 'setAgentSessionModerationBan' || log.type === 'setAgentCharacterModerationBan') return logInfoBoolean(log, 'banned') ? '封禁' : '解封';
	return '记录';
}

function logRows(log: AgentLog) {
	if (log.type === 'resolveAgentReview') {
		return [
			{ label: '对象', value: logInfoString(log, 'name') ?? '—' },
			{ label: '类型', value: kindLabel(logInfoString(log, 'kind') ?? '') },
			{ label: '对象 ID', value: logInfoString(log, 'id') ?? '—' },
			{ label: '作者用户名 / acct', value: logInfoString(log, 'ownerAcct') ?? logInfoString(log, 'ownerUserId') ?? '-', copyAsAcct: true },
			{ label: '状态', value: logInfoString(log, 'reviewStatus') ?? '—' },
		];
	}
	if (log.type === 'setAgentSessionModerationBan') {
		return [
			{ label: '会话', value: logInfoString(log, 'sessionName') ?? '—' },
			{ label: '会话 ID', value: logInfoString(log, 'sessionId') ?? '—' },
			{ label: '用户名 / acct', value: logInfoString(log, 'userAcct') ?? logInfoString(log, 'userId') ?? '-', copyAsAcct: true },
		];
	}
	if (log.type === 'setAgentCharacterModerationBan') {
		return [
			{ label: '角色', value: logInfoString(log, 'characterName') ?? '—' },
			{ label: '角色 ID', value: logInfoString(log, 'characterId') ?? '—' },
			{ label: '作者用户名 / acct', value: logInfoString(log, 'ownerAcct') ?? logInfoString(log, 'ownerUserId') ?? '-', copyAsAcct: true },
		];
	}
	return Object.entries(log.info).map(([label, value]) => ({ label, value: String(value) }));
}

function logNote(log: AgentLog) {
	return logInfoString(log, 'rejectMessage') ?? logInfoString(log, 'rejectReason') ?? logInfoString(log, 'reason') ?? logInfoString(log, 'internalNote');
}

function worldbookText(entries: WorldbookEntry[] | undefined) {
	if (!entries?.length) return '—';
	return entries.map((entry, index) => [
		`${index + 1}. ${entry.title || '未命名'}（${entry.enabled ? '启用' : '停用'} · ${entry.triggerMode} · 优先级 ${entry.priority}）`,
		`关键词：${entry.keywords.join('、') || '—'}`,
		`正文：${entry.content || '—'}`,
	].join('\n')).join('\n\n');
}

const ReviewDetail = defineComponent({
	props: { detail: { type: Object as () => ReviewDetailRow, required: true }, canModerate: { type: Boolean, default: true } },
	emits: ['approve', 'reject', 'ban', 'copy'],
	setup(props, { emit }) {
		return () => h('article', { class: '_gaps_s' }, [
			h('div', { class: 'review-detail-head' }, [
				props.detail.avatar ? h(MkDriveFileThumbnail, { file: props.detail.avatar, fit: 'cover', class: 'review-avatar' }) : null,
				h('div', [
					h('div', { class: 'review-title' }, [h('span', kindLabel(props.detail.kind)), h('h2', props.detail.name)]),
					h('p', props.detail.summary || '—'),
					h('div', { class: 'review-badges' }, [
						h('span', statusLabel(props.detail.reviewStatus)),
						h('span', props.detail.publishedVersion == null ? '首次提交' : `V${props.detail.publishedVersion} 更新`),
						...props.detail.riskTags.map(tag => h('span', tag)),
					]),
				]),
			]),
			props.detail.reviewRejectReason || props.detail.reviewRejectMessage ? h('section', { class: 'review-note' }, [
				h('b', '最近拒绝/备注'),
				h('p', `原因：${props.detail.reviewRejectReason ?? '—'}`),
				h('pre', props.detail.reviewRejectMessage ?? '—'),
			]) : null,
			props.detail.diff.hasChanges ? h('section', { class: 'review-block' }, [
				h('h3', '与当前线上版本的差异'),
				...props.detail.diff.fields.map(field => h('div', { class: 'diff-row' }, [
					h('b', reviewFieldLabel(field.key)),
					h('pre', `当前：${field.draftPreview || '—'}\n\n线上：${field.publishedPreview || '—'}`),
				])),
			]) : h('section', { class: 'review-block' }, [h('h3', '版本差异'), h('p', '首次提交或当前内容与线上版本无差异。')]),
			props.detail.kind === 'character' ? h('section', { class: 'review-block' }, [
				h('h3', '角色内容'),
				h('pre', [
					`人设：${props.detail.personality || '—'}`,
					`背景：${props.detail.background || '—'}`,
					`说话风格：${props.detail.speakingStyle || '—'}`,
					`开场白：${props.detail.greeting || '—'}`,
					`示例对话：${props.detail.exampleTurns?.map(turn => `${turn.role}: ${turn.content}`).join('\n') || '—'}`,
					`禁止行为：${props.detail.forbiddenBehavior || '—'}`,
				].join('\n\n')),
				h('h3', '世界书'),
				h('pre', worldbookText(props.detail.worldbook)),
			]) : h('section', { class: 'review-block' }, [
				h('h3', '风格提示词正文'),
				h('pre', props.detail.body || '—'),
			]),
			h('div', { class: 'review-actions' }, [
				props.canModerate && props.detail.reviewStatus === 'pending' ? h(MkButton, { primary: true, rounded: true, onClick: () => emit('approve', props.detail) }, () => [h('i', { class: 'ti ti-check' }), ' 通过']) : null,
				props.canModerate && props.detail.reviewStatus === 'pending' ? h(MkButton, { danger: true, rounded: true, onClick: () => emit('reject', props.detail) }, () => [h('i', { class: 'ti ti-x' }), ' 拒绝']) : null,
				props.canModerate && props.detail.kind === 'character' ? h(MkButton, { rounded: true, danger: !props.detail.moderationBanned, onClick: () => emit('ban', props.detail) }, () => [h('i', { class: 'ti ti-ban' }), props.detail.moderationBanned ? ' 解封角色' : ' 封禁角色']) : null,
				h(MkButton, { rounded: true, onClick: () => emit('copy', props.detail.id) }, () => [h('i', { class: 'ti ti-copy' }), ' 复制 ID']),
			]),
		]);
	},
});

const SessionDetail = defineComponent({
	props: { detail: { type: Object as () => SessionDetailRow, required: true }, canModerate: { type: Boolean, default: true }, messagesLoading: { type: Boolean, default: false } },
	emits: ['toggleBan', 'copy', 'loadMoreMessages'],
	setup(props, { emit }) {
		const messagesAsc = computed(() => [...props.detail.messages].reverse());
		return () => h('article', { class: '_gaps_s' }, [
			h('div', { class: 'session-detail-head' }, [
				h('div', [h('h2', props.detail.session.name), h('p', `${props.detail.session.characterName || '—'} · ${sessionKindLabel(props.detail.session.sessionKind)}`)]),
				h('span', { class: props.detail.session.moderationBanned ? 'state-warn' : 'state-ok' }, props.detail.session.moderationBanned ? '已封禁' : '可用'),
			]),
			h('div', { class: 'review-actions' }, [
				props.canModerate ? h(MkButton, { rounded: true, danger: !props.detail.session.moderationBanned, onClick: () => emit('toggleBan', props.detail.session) }, () => [h('i', { class: 'ti ti-ban' }), props.detail.session.moderationBanned ? ' 解封会话' : ' 封禁会话']) : null,
				h(MkButton, { rounded: true, onClick: () => emit('copy', props.detail.session.id) }, () => [h('i', { class: 'ti ti-copy' }), ' 复制会话 ID']),
			]),
			h('section', { class: 'review-block' }, [
				h('h3', `最近消息（已加载 ${props.detail.messages.length} 条）`),
				props.detail.hasMoreMessages ? h('div', { style: 'display: flex; justify-content: center; margin-bottom: 10px;' }, [
					h(MkButton, { small: true, rounded: true, disabled: props.messagesLoading, onClick: () => emit('loadMoreMessages') }, () => [
						h('i', { class: 'ti ti-chevron-up' }),
						props.messagesLoading ? ' 载入中…' : ' 加载更早的消息',
					]),
				]) : null,
				...messagesAsc.value.map(msg => h('div', { class: `timeline-message role-${msg.role}` }, [
					h('div', [h('b', roleLabel(msg.role)), h('time', formatTime(msg.createdAt))]),
					h('pre', msg.content),
				])),
			]),
		]);
	},
});

onMounted(() => {
	restoreFilters();
	void loadSummary();
	if (activeView.value === 'overview') return;
	if (activeView.value === 'queue') void loadReviewList(true);
	else if (activeView.value === 'library') void loadReviewList(true);
	else if (activeView.value === 'sessions') void loadSessions(true);
	else if (activeView.value === 'externalAudit') void loadExternalAudits(true);
	else if (activeView.value === 'review') void loadReviewListItems(true);
	else if (activeView.value === 'images') void loadImages(true);
	else void loadLogs(true);
});
</script>

<style lang="scss" module>
.hero {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 16px;
}
.hero > div:first-child {
	min-width: 0;
}
.hero h1 {
	margin: 0;
	font-size: 1.35em;
	overflow-wrap: anywhere;
}
.hero p {
	margin: 6px 0 0;
	color: var(--MI_THEME-fgTransparentWeak);
	line-height: 1.5;
	overflow-wrap: anywhere;
}
.heroStats {
	display: flex;
	gap: 16px;
	flex-shrink: 0;
}
.heroStat {
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 8px 14px;
	border-radius: 8px;
	background: var(--MI_THEME-panel);
	border: 1px solid var(--MI_THEME-divider);
	font-size: 0.9em;
	color: var(--MI_THEME-fgTransparentWeak);
}
.heroStat b {
	color: var(--MI_THEME-accent);
	font-size: 1.2em;
}
.mainPane,
.overview {
	min-width: 0;
}
.summaryGrid {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 12px;
}
.summaryCard {
	display: flex;
	min-width: 0;
	min-height: 96px;
	flex-direction: column;
	justify-content: space-between;
	gap: 10px;
	padding: 16px;
	border-radius: 8px;
	background: var(--MI_THEME-panel);
	border: 1px solid var(--MI_THEME-divider);
	cursor: pointer;
	transition: border-color 0.15s, box-shadow 0.15s;
	text-align: left;
}
.summaryCard:hover {
	border-color: var(--MI_THEME-accent);
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}
.summaryLabel {
	display: flex;
	align-items: center;
	gap: 6px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.88em;
	line-height: 1.4;
	overflow-wrap: anywhere;
}
.summaryLabel i {
	font-size: 1.1em;
}
.summaryValue {
	display: block;
	color: var(--MI_THEME-accent);
	font-size: 1.8em;
	line-height: 1;
}
.filterBand,
.searchSection {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 14px;
	border-radius: 8px;
	background: var(--MI_THEME-panel);
	border: 1px solid var(--MI_THEME-divider);
}
.filterToggle {
	display: flex;
	align-items: center;
	gap: 8px;
	cursor: pointer;
	padding: 4px 0;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.92em;
	user-select: none;
}
.filterToggle:hover {
	color: var(--MI_THEME-fg);
}
.filterActiveDot {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background: var(--MI_THEME-accent);
}
.filterBand > :global(._buttons),
.searchSection > :global(._buttons) {
	margin-top: 2px;
}
.splitPane {
	display: grid;
	grid-template-columns: minmax(320px, 0.9fr) minmax(380px, 1.1fr);
	gap: 14px;
	margin-top: 14px;
	align-items: start;
}
.listPane,
.detailPane {
	min-width: 0;
}
.detailPane {
	position: sticky;
	top: 12px;
	padding: 14px;
	border-radius: 8px;
	background: var(--MI_THEME-panel);
	border: 1px solid var(--MI_THEME-divider);
	max-height: calc(100vh - 32px);
	overflow: auto;
}
.sectionHead {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 12px;
	margin-bottom: 10px;
}
.sectionHead > div {
	min-width: 0;
}
.sectionHead h2 {
	margin: 0;
	font-size: 1.06em;
	overflow-wrap: anywhere;
}
.sectionHead p {
	margin: 4px 0 0;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.9em;
	line-height: 1.45;
	overflow-wrap: anywhere;
}
.list {
	display: grid;
	gap: 8px;
}
.reviewRow,
.sessionRow {
	width: 100%;
	padding: 12px;
	border-radius: 8px;
	background: var(--MI_THEME-panel);
	border: 1px solid var(--MI_THEME-divider);
	text-align: left;
}
.rowActive {
	border-color: var(--MI_THEME-accent);
	background: var(--MI_THEME-accentedBg);
}
.rowHead,
.cardHead {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	min-width: 0;
}
.rowHead b {
	min-width: 0;
	overflow: hidden;
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	overflow-wrap: anywhere;
}
.cardHead {
	flex-wrap: wrap;
}
.cardHead > div,
.cardHead > b {
	min-width: 0;
	overflow-wrap: anywhere;
}
.reviewRow p,
.sessionRow p {
	margin: 8px 0;
	color: var(--MI_THEME-fgTransparentWeak);
	line-height: 1.4;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
}
.typeBadge,
.warnBadge,
.badges span,
.badges code,
.logDecision {
	display: inline-flex;
	align-items: center;
	min-height: 22px;
	padding: 1px 8px;
	border-radius: 999px;
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
	font-size: 0.82em;
}
.warnBadge {
	background: var(--MI_THEME-errorBg);
	color: var(--MI_THEME-error);
}
.badges {
	display: flex;
	gap: 6px;
	flex-wrap: wrap;
}
.rowMeta {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 10px;
	margin-top: 8px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.86em;
}
.rowMeta > *,
.metaGrid > *,
.imageBody code {
	min-width: 0;
	overflow-wrap: anywhere;
	word-break: break-word;
}
.loadMore {
	display: flex;
	justify-content: center;
	margin-top: 10px;
}
.emptyDetail {
	display: grid;
	place-items: center;
	min-height: 220px;
	color: var(--MI_THEME-fgTransparentWeak);
	text-align: center;
}
.emptyDetail i {
	font-size: 2em;
}
.searchSection {
	margin-top: 14px;
}
.messageResults,
.evidenceList {
	display: grid;
	gap: 10px;
	margin-top: 12px;
}
.messageCard,
.evidenceCard,
.logCard {
	padding: 12px 14px;
	border-radius: 8px;
}
.evidenceCardReview {
	border-color: var(--MI_THEME-warn) !important;
	background: color-mix(in srgb, var(--MI_THEME-panel) 92%, var(--MI_THEME-warn) 8%) !important;
}
.reviewBadge {
	display: inline-flex;
	align-items: center;
	min-height: 22px;
	padding: 1px 8px;
	border-radius: 999px;
	background: var(--MI_THEME-warn);
	color: var(--MI_THEME-fgOnWarn, #fff);
	font-size: 0.82em;
	font-weight: 600;
}
.reviewTriggerInfo {
	display: flex;
	align-items: center;
	gap: 6px;
	margin: 8px 0;
	padding: 8px 10px;
	border-radius: 6px;
	background: var(--MI_THEME-warn);
	color: var(--MI_THEME-fgOnWarn, #fff);
	font-size: 0.85em;
}

/* 复审用户卡片 */
.reviewUserList {
	display: grid;
	gap: 12px;
	margin-top: 12px;
}
.reviewUserCard {
	border-radius: 12px;
	overflow: hidden;
	transition: border-color 0.15s, box-shadow 0.15s;
}
.reviewUserCard:hover {
	border-color: var(--MI_THEME-accent);
	box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}
.reviewUserCardSuspended {
	opacity: 0.7;
	border-color: var(--MI_THEME-error);
}
.reviewUserHead {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 12px;
	padding: 14px 16px;
}
.reviewUserInfo {
	min-width: 0;
	flex: 1;
}
.reviewUserName {
	display: flex;
	align-items: center;
	gap: 8px;
	flex-wrap: wrap;
	font-size: 1.05em;
	font-weight: 600;
}
.reviewUserMeta {
	display: flex;
	gap: 16px;
	margin-top: 6px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.85em;
	flex-wrap: wrap;
}
.reviewUserActions {
	display: flex;
	gap: 8px;
	flex-shrink: 0;
}
.reviewNotePreview {
	display: flex;
	gap: 8px;
	margin: 0 16px 12px;
	padding: 10px 12px;
	border-radius: 8px;
	background: var(--MI_THEME-infoBg);
	border: 1px solid var(--MI_THEME-divider);
	font-size: 0.85em;
}
.reviewNotePreview i {
	flex-shrink: 0;
	margin-top: 2px;
}
.reviewNotePreview pre {
	margin: 4px 0 0;
	white-space: pre-wrap;
	word-break: break-word;
	line-height: 1.4;
}
.reviewNoteLabel {
	font-size: 0.82em;
	color: var(--MI_THEME-fgTransparentWeak);
}
.reviewLogList {
	display: grid;
	gap: 8px;
	padding: 0 16px 14px;
}
.reviewLogItem {
	padding: 12px;
	border-radius: 8px;
	background: var(--MI_THEME-bg);
	border: 1px solid var(--MI_THEME-divider);
}
.reviewLogItemBanned {
	opacity: 0.6;
}
.reviewLogHead {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	flex-wrap: wrap;
}
.reviewLogMeta {
	display: flex;
	gap: 16px;
	margin-top: 6px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.85em;
	flex-wrap: wrap;
}
.reviewLogReason {
	margin-top: 8px;
	padding: 8px 10px;
	border-radius: 6px;
	background: var(--MI_THEME-infoBg);
	font-size: 0.88em;
	line-height: 1.4;
}
.metaGrid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
	gap: 8px;
	margin: 10px 0;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.9em;
}
.pre {
	margin: 0;
	padding: 10px 12px;
	border-radius: 8px;
	background: var(--MI_THEME-bg);
	border: 1px solid var(--MI_THEME-divider);
	white-space: pre-wrap;
	word-break: break-word;
	overflow-wrap: anywhere;
	max-height: 280px;
	overflow: auto;
	line-height: 1.45;
}
.decisionBox {
	margin: 10px 0;
	padding: 10px 12px;
	border-radius: 8px;
	background: var(--MI_THEME-infoBg);
	border: 1px solid var(--MI_THEME-divider);
}
.decisionBox p {
	margin: 4px 0 0;
	line-height: 1.45;
}
.twoCol {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
	margin: 10px 0;
}
.twoCol h3 {
	margin: 0 0 6px;
	font-size: 0.9em;
	color: var(--MI_THEME-fgTransparentWeak);
}
.imageGrid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
	gap: 12px;
	margin-top: 12px;
}
.imageCard {
	overflow: hidden;
	border-radius: 8px;
}
.imageBox {
	display: grid;
	place-items: center;
	aspect-ratio: 4 / 3;
	background: color-mix(in srgb, var(--MI_THEME-panel) 90%, var(--MI_THEME-bg));
	border-bottom: 1px solid var(--MI_THEME-divider);
}
.imageBox img {
	width: 100%;
	height: 100%;
	object-fit: contain;
}
.imageEmpty {
	display: grid;
	place-items: center;
	gap: 8px;
	color: var(--MI_THEME-fgTransparentWeak);
}
.imageEmpty i {
	font-size: 2em;
}
.imageBody {
	padding: 12px;
}
.imageBody p {
	line-height: 1.45;
	word-break: break-word;
	overflow-wrap: anywhere;
}
@media (max-width: 900px) {
	.splitPane,
	.twoCol {
		grid-template-columns: 1fr;
	}
	.detailPane {
		position: static;
		max-height: none;
	}
	.summaryGrid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
	.heroStats {
		display: none;
	}
}
@media (max-width: 600px) {
	.hero {
		align-items: flex-start;
		flex-wrap: wrap;
	}
	.hero > div:last-child {
		flex: 0 0 auto;
	}
	.filterBand,
	.searchSection,
	.detailPane {
		padding: 12px;
	}
	.imageGrid {
		grid-template-columns: minmax(0, 1fr);
	}
	.sectionHead,
	.rowMeta {
		align-items: flex-start;
	}
	.summaryGrid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
	}
	.summaryCard {
		min-height: 72px;
		padding: 12px;
	}
	.summaryValue {
		font-size: 1.4em;
	}

	/* 复审用户卡片：头部纵向堆叠，操作按钮组换行，避免挤压信息区 */
	.reviewUserHead {
		flex-direction: column;
		align-items: stretch;
		gap: 10px;
	}
	.reviewUserActions {
		width: 100%;
		flex-wrap: wrap;
	}
	.reviewUserActions :global(._button) {
		flex: 1 1 auto;
		min-width: 0;
	}
	.reviewLogHead {
		align-items: flex-start;
	}
}

@media (max-width: 380px) {
	.summaryGrid {
		grid-template-columns: 1fr;
	}
}
</style>

<style lang="scss">
.review-detail-head,
.session-detail-head {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 12px;
}
.review-detail-head > div,
.session-detail-head > div {
	min-width: 0;
}
.review-avatar {
	width: 56px;
	height: 56px;
	border-radius: 8px;
	overflow: hidden;
	flex: 0 0 auto;
}
.review-title {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 8px;
	min-width: 0;
}
.review-title h2,
.session-detail-head h2 {
	margin: 0;
	font-size: 1.1em;
	overflow-wrap: anywhere;
}
.review-detail-head p,
.session-detail-head p {
	margin: 6px 0 0;
	color: var(--MI_THEME-fgTransparentWeak);
}
.review-badges {
	display: flex;
	gap: 6px;
	flex-wrap: wrap;
	margin-top: 8px;
}
.review-badges span,
.state-ok,
.state-warn {
	display: inline-flex;
	align-items: center;
	min-height: 22px;
	padding: 1px 8px;
	border-radius: 999px;
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
	font-size: 0.82em;
}
.state-warn {
	background: var(--MI_THEME-errorBg);
	color: var(--MI_THEME-error);
}
.review-note,
.review-block {
	padding: 10px 12px;
	border-radius: 8px;
	background: var(--MI_THEME-bg);
	border: 1px solid var(--MI_THEME-divider);
}
.review-block h3 {
	margin: 0 0 8px;
	font-size: 0.95em;
	color: var(--MI_THEME-fgTransparentWeak);
}
.review-block pre,
.review-note pre,
.diff-row pre,
.timeline-message pre {
	margin: 0;
	white-space: pre-wrap;
	word-break: break-word;
	overflow-wrap: anywhere;
	line-height: 1.45;
}
.agent-user-acct {
	display: inline-flex;
	align-items: center;
	max-width: 100%;
	gap: 4px;
	vertical-align: middle;
}
.agent-user-acct code {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.agent-user-acct-copy {
	display: inline-grid;
	place-items: center;
	flex: 0 0 auto;
	width: 24px;
	height: 24px;
	border-radius: 6px;
	color: var(--MI_THEME-fgTransparentWeak);
}
.agent-user-acct-copy:hover {
	color: var(--MI_THEME-accent);
	background: var(--MI_THEME-accentedBg);
}
.agent-user-acct-copy:disabled {
	opacity: 0.45;
	cursor: default;
}
.diff-row {
	display: grid;
	gap: 6px;
	padding: 8px 0;
	border-top: 1px solid var(--MI_THEME-divider);
}
.review-actions {
	position: sticky;
	bottom: 0;
	display: flex;
	gap: 8px;
	flex-wrap: wrap;
	padding-top: 10px;
	background: var(--MI_THEME-panel);
}
.timeline-message {
	display: grid;
	gap: 6px;
	padding: 10px 12px;
	border-radius: 8px;
	border: 1px solid var(--MI_THEME-divider);
	background: var(--MI_THEME-panel);
}
.timeline-message > div {
	display: flex;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 10px;
	color: var(--MI_THEME-fgTransparentWeak);
}
.role-user {
	border-color: var(--MI_THEME-accent);
}
.role-assistant {
	border-color: var(--MI_THEME-success);
}
@media (max-width: 600px) {
	.review-detail-head,
	.session-detail-head {
		flex-wrap: wrap;
	}
}
</style>
