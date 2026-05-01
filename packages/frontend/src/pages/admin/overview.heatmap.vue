<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_panel" :class="$style.root">
	<MkSelect v-model="src" :items="srcDef" style="margin: 0 0 12px 0;" small>
	</MkSelect>
	<MkHeatmap :src="src"/>
</div>
</template>

<script lang="ts" setup>
import MkHeatmap from '@/components/MkHeatmap.vue';
import MkSelect from '@/components/MkSelect.vue';
import { useMkSelect } from '@/composables/use-mkselect.js';
import { i18n } from '@/i18n.js';

const {
	model: src,
	def: srcDef,
} = useMkSelect({
	items: [
		{ label: i18n.ts.adminOverviewActiveUsers, value: 'active-users' },
		{ label: i18n.ts.adminOverviewNotes, value: 'notes' },
		{ label: i18n.ts.adminOverviewApRequestsInboxReceived, value: 'ap-requests-inbox-received' },
		{ label: i18n.ts.adminOverviewApRequestsDeliverSucceeded, value: 'ap-requests-deliver-succeeded' },
		{ label: i18n.ts.adminOverviewApRequestsDeliverFailed, value: 'ap-requests-deliver-failed' },
	],
	initialValue: 'active-users',
});
</script>

<style lang="scss" module>
.root {
	padding: 20px;
}
</style>
