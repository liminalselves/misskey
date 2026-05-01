<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 900px;">
		<div class="_gaps">
			<div :class="$style.inputs">
				<MkButton style="margin-left: auto" @click="resetQuery">{{ i18n.ts.reset }}</MkButton>
			</div>
			<div :class="$style.inputs">
				<MkSelect v-model="sort" :items="sortDef" style="flex: 1;">
					<template #label>{{ i18n.ts.sort }}</template>
				</MkSelect>
				<MkSelect v-model="state" :items="stateDef" style="flex: 1;">
					<template #label>{{ i18n.ts.state }}</template>
				</MkSelect>
				<MkSelect v-model="origin" :items="originDef" style="flex: 1;">
					<template #label>{{ i18n.ts.instance }}</template>
				</MkSelect>
			</div>
			<div :class="$style.inputs">
				<MkInput v-model="searchUsername" style="flex: 1;" type="text" :spellcheck="false">
					<template #prefix>@</template>
					<template #label>{{ i18n.ts.username }}</template>
				</MkInput>
				<MkInput v-model="searchHost" style="flex: 1;" type="text" :spellcheck="false" :disabled="paginator.computedParams?.value?.origin === 'local'">
					<template #prefix>@</template>
					<template #label>{{ i18n.ts.host }}</template>
				</MkInput>
			</div>

			<MkPagination v-slot="{items}" :paginator="paginator">
				<div :class="$style.users">
					<div v-for="user in items" :key="user.id" :class="$style.userWrap">
						<MkA v-tooltip.mfm="`Last posted: ${user.updatedAt ? dateString(user.updatedAt) : 'Unknown'}`" :class="$style.user" :to="`/admin/user/${user.id}`">
							<MkUserCardMini :user="user"/>
						</MkA>
						<div v-if="agentSuccessRateMap.get(user.id) && agentSuccessRateMap.get(user.id)!.total > 0" :class="[$style.agentRate, agentRateClass(agentSuccessRateMap.get(user.id)!)]">
							<i class="ti ti-robot" style="font-size: 0.85em;"></i>
							{{ agentRatePct(agentSuccessRateMap.get(user.id)!) }}% ({{ agentSuccessRateMap.get(user.id)!.success }}/{{ agentSuccessRateMap.get(user.id)!.total }})
						</div>
					</div>
				</div>
			</MkPagination>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, markRaw, ref, useCssModule, watch, watchEffect } from 'vue';
import * as Misskey from 'misskey-js';
import { defaultMemoryStorage } from '@/memory-storage';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkPagination from '@/components/MkPagination.vue';
import * as os from '@/os.js';
import { lookupUser } from '@/utility/admin-lookup.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { useMkSelect } from '@/composables/use-mkselect.js';
import MkUserCardMini from '@/components/MkUserCardMini.vue';
import { dateString } from '@/filters/date.js';
import { Paginator } from '@/utility/paginator.js';
import { misskeyApi } from '@/utility/misskey-api.js';

type SearchQuery = {
	sort?: '-createdAt' | '+createdAt' | '-updatedAt' | '+updatedAt';
	state?: 'all' | 'available' | 'admin' | 'moderator' | 'suspended';
	origin?: 'combined' | 'local' | 'remote';
	username?: string;
	hostname?: string;
};

const storedQuery = JSON.parse(defaultMemoryStorage.getItem('admin-users-query') ?? '{}') as SearchQuery;

const {
	model: sort,
	def: sortDef,
} = useMkSelect({
	items: [
		{ label: `${i18n.ts.registeredDate} (${i18n.ts.ascendingOrder})`, value: '-createdAt' },
		{ label: `${i18n.ts.registeredDate} (${i18n.ts.descendingOrder})`, value: '+createdAt' },
		{ label: `${i18n.ts.lastUsed} (${i18n.ts.ascendingOrder})`, value: '-updatedAt' },
		{ label: `${i18n.ts.lastUsed} (${i18n.ts.descendingOrder})`, value: '+updatedAt' },
	],
	initialValue: storedQuery.sort ?? '+createdAt',
});
const {
	model: state,
	def: stateDef,
} = useMkSelect({
	items: [
		{ label: i18n.ts.all, value: 'all' },
		{ label: i18n.ts.normal, value: 'available' },
		{ label: i18n.ts.administrator, value: 'admin' },
		{ label: i18n.ts.moderator, value: 'moderator' },
		{ label: i18n.ts.suspend, value: 'suspended' },
	],
	initialValue: storedQuery.state ?? 'all',
});
const {
	model: origin,
	def: originDef,
} = useMkSelect({
	items: [
		{ label: i18n.ts.all, value: 'combined' },
		{ label: i18n.ts.local, value: 'local' },
		{ label: i18n.ts.remote, value: 'remote' },
	],
	initialValue: storedQuery.origin ?? 'local',
});
const searchUsername = ref(storedQuery.username ?? '');
const searchHost = ref(storedQuery.hostname ?? '');
const paginator = markRaw(new Paginator('admin/show-users', {
	limit: 10,
	computedParams: computed(() => ({
		sort: sort.value,
		state: state.value,
		origin: origin.value,
		username: searchUsername.value,
		hostname: searchHost.value,
	})),
	offsetMode: true,
}));

type AgentSuccessRateEntry = { userId: string; success: number; total: number };
const agentSuccessRateMap = ref<Map<string, AgentSuccessRateEntry>>(new Map());
const $style = useCssModule();

async function fetchSuccessRates(userIds: string[]) {
	if (userIds.length === 0) return;
	try {
		const result = await misskeyApi('admin/users/agent-success-rate' as any, { userIds }) as AgentSuccessRateEntry[];
		const next = new Map(agentSuccessRateMap.value);
		for (const entry of result) {
			next.set(entry.userId, entry);
		}
		agentSuccessRateMap.value = next;
	} catch {
		// 接口不可用时静默失败
	}
}

watch(
	() => paginator.items.value.map((u: any) => u.id as string),
	(ids) => {
		const missing = ids.filter(id => !agentSuccessRateMap.value.has(id));
		if (missing.length > 0) fetchSuccessRates(missing);
	},
	{ deep: false },
);

function agentRatePct(entry: AgentSuccessRateEntry): string {
	return ((entry.success / entry.total) * 100).toFixed(0);
}

function agentRateClass(entry: AgentSuccessRateEntry): string {
	const pct = (entry.success / entry.total) * 100;
	if (pct >= 90) return $style.rateGood;
	if (pct >= 60) return $style.rateWarn;
	return $style.rateMuted;
}

function searchUser() {
	os.selectUser({ includeSelf: true }).then(user => {
		show(user);
	});
}

async function addUser() {
	const { canceled: canceled1, result: username } = await os.inputText({
		title: i18n.ts.username,
	});
	if (canceled1 || username == null) return;

	const { canceled: canceled2, result: password } = await os.inputText({
		title: i18n.ts.password,
		type: 'password',
	});
	if (canceled2 || password == null) return;

	os.apiWithDialog('admin/accounts/create', {
		username: username,
		password: password,
	}).then(res => {
		paginator.reload();
	});
}

function show(user: Misskey.entities.UserDetailed) {
	os.pageWindow(`/admin/user/${user.id}`);
}

function resetQuery() {
	sort.value = '+createdAt';
	state.value = 'all';
	origin.value = 'local';
	searchUsername.value = '';
	searchHost.value = '';
}

const headerActions = computed(() => [{
	icon: 'ti ti-search',
	text: i18n.ts.search,
	handler: searchUser,
}, {
	asFullButton: true,
	icon: 'ti ti-plus',
	text: i18n.ts.addUser,
	handler: addUser,
}, {
	asFullButton: true,
	icon: 'ti ti-search',
	text: i18n.ts.lookup,
	handler: lookupUser,
}]);

const headerTabs = computed(() => []);

watchEffect(() => {
	defaultMemoryStorage.setItem('admin-users-query', JSON.stringify({
		sort: sort.value,
		state: state.value,
		origin: origin.value,
		username: searchUsername.value,
		hostname: searchHost.value,
	}));
});

definePage(() => ({
	title: i18n.ts.users,
	icon: 'ti ti-users',
}));
</script>

<style lang="scss" module>
.inputs {
	display: flex;
	gap: 8px;
	flex-wrap: wrap;
}

.users {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
	grid-gap: 12px;
}

.userWrap {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.user {
	display: block;

	&:hover {
		text-decoration: none;
	}
}

.agentRate {
	font-size: 0.78em;
	font-weight: 600;
	padding: 2px 8px;
	border-radius: 6px;
	display: inline-flex;
	align-items: center;
	gap: 4px;
	width: fit-content;
	margin-left: 4px;
}

.rateGood {
	color: var(--MI_THEME-success);
	background: color-mix(in srgb, var(--MI_THEME-success) 12%, transparent);
}

.rateWarn {
	color: var(--MI_THEME-warn);
	background: color-mix(in srgb, var(--MI_THEME-warn) 12%, transparent);
}

.rateMuted {
	color: var(--MI_THEME-fg);
	opacity: 0.45;
	background: color-mix(in srgb, var(--MI_THEME-fg) 8%, transparent);
}
</style>
