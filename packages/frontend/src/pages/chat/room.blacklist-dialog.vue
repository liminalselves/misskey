<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow
	ref="dialogEl"
	:width="420"
	:height="520"
	@close="dialogEl?.close()"
	@closed="emit('closed')"
>
	<template #header>黑名单</template>
	<div class="_spacer" style="--MI_SPACER-min: 16px; --MI_SPACER-max: 20px;">
		<div :class="$style.hint">黑名单中的用户无法被邀请，也不能主动加入本群组。</div>
		<MkLoading v-if="loading"/>
		<MkResult v-else-if="loadError" type="error">
			<MkButton primary rounded @click="load()">重试</MkButton>
		</MkResult>
		<MkResult v-else-if="bans.length === 0" type="empty" text="黑名单为空"/>
		<div v-else class="_gaps_s">
			<div v-for="ban in bans" :key="ban.id" :class="$style.row">
				<template v-if="ban.user">
					<MkAvatar :class="$style.avatar" :user="ban.user"/>
					<div :class="$style.info">
						<MkUserName :user="ban.user" :class="$style.name"/>
						<MkAcct :user="ban.user" :class="$style.acct"/>
					</div>
				</template>
				<div v-else :class="$style.info">{{ ban.userId }}</div>
				<MkButton rounded small :wait="removingId === ban.id" @click="remove(ban)">移出</MkButton>
			</div>
			<MkButton v-if="hasMore" rounded :wait="loadingMore" style="margin: 4px auto 0;" @click="loadMore">加载更多</MkButton>
		</div>
	</div>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { onMounted, ref, useTemplateRef } from 'vue';
import * as Misskey from 'misskey-js';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkButton from '@/components/MkButton.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { chatApiWithDialog, formatChatError } from '@/utility/chat-error.js';
import * as os from '@/os.js';

const LIMIT = 30;

const props = defineProps<{
	roomId: string;
}>();

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

const dialogEl = useTemplateRef('dialogEl');
const bans = ref<Misskey.entities.ChatRoomBan[]>([]);
const loading = ref(false);
const loadError = ref(false);
const loadingMore = ref(false);
const hasMore = ref(false);
const removingId = ref<string | null>(null);

function fetchBans(untilId?: string) {
	return (misskeyApi as unknown as (ep: string, data: Record<string, unknown>) => Promise<Misskey.entities.ChatRoomBan[]>)(
		'chat/rooms/bans',
		{ roomId: props.roomId, limit: LIMIT, untilId },
	);
}

async function load() {
	loading.value = true;
	loadError.value = false;
	try {
		const res = await fetchBans();
		bans.value = res;
		hasMore.value = res.length === LIMIT;
	} catch {
		loadError.value = true;
	} finally {
		loading.value = false;
	}
}

async function loadMore() {
	if (loadingMore.value || bans.value.length === 0) return;
	loadingMore.value = true;
	try {
		const res = await fetchBans(bans.value[bans.value.length - 1].id);
		const existing = new Set(bans.value.map(b => b.id));
		bans.value.push(...res.filter(b => !existing.has(b.id)));
		hasMore.value = res.length === LIMIT;
	} catch (err) {
		os.alert({ type: 'error', text: formatChatError(err) });
	} finally {
		loadingMore.value = false;
	}
}

async function remove(ban: Misskey.entities.ChatRoomBan) {
	const name = ban.user?.name || ban.user?.username || ban.userId;
	const { canceled } = await os.confirm({
		type: 'question',
		text: `确定将 ${name} 移出黑名单吗？移出后可再次邀请或加入本群组。`,
	});
	if (canceled) return;

	removingId.value = ban.id;
	try {
		await chatApiWithDialog('chat/rooms/unban', { roomId: props.roomId, userId: ban.userId });
		bans.value = bans.value.filter(b => b.id !== ban.id);
	} catch {
		// chatApiWithDialog 已显示错误提示
	} finally {
		removingId.value = null;
	}
}

onMounted(() => {
	void load();
});
</script>

<style lang="scss" module>
.hint {
	margin-bottom: 12px;
	font-size: 0.85em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.row {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 6px 4px;
}

.avatar {
	width: 36px;
	height: 36px;
	flex-shrink: 0;
}

.info {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
}

.name,
.acct {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.acct {
	font-size: 0.85em;
	opacity: 0.7;
}
</style>
