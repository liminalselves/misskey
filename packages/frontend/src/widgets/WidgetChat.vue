<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkContainer :showHeader="widgetProps.showHeader" class="mkw-chat">
	<template #icon><i class="ti ti-messages"></i></template>
	<template #header>{{ i18n.ts._widgets.chat }}</template>
	<template #func="{ buttonStyleClass }">
		<MkA v-if="$i && $i.policies.chatAvailability !== 'unavailable'" to="/chat" :class="[buttonStyleClass, $style.headerLink]" :title="i18n.ts._chat.home" :aria-label="i18n.ts._chat.home">
			<i class="ti ti-external-link"></i>
		</MkA>
		<button class="_button" :class="buttonStyleClass" :aria-label="i18n.ts.settings" @click="configure()"><i class="ti ti-settings"></i></button>
	</template>

	<div :class="$style.body" class="_gaps_s">
		<MkInfo v-if="$i == null">{{ i18n.ts.signinRequired }}</MkInfo>
		<MkInfo v-else-if="$i.policies.chatAvailability === 'unavailable'" warn>{{ i18n.ts._chat.chatNotAvailableForThisAccountOrServer }}</MkInfo>
		<template v-else>
			<MkInfo v-if="$i.policies.chatAvailability === 'readonly'">{{ i18n.ts._chat.chatIsReadOnlyForThisAccountOrServer }}</MkInfo>
			<div :class="$style.toolbar">
				<div :class="$style.filters">
					<button
						type="button"
						class="_button"
						:class="[$style.filterButton, { [$style.active]: filter === 'all' }]"
						@click="filter = 'all'"
					>{{ i18n.ts._chat.filterAll }}</button>
					<button
						type="button"
						class="_button"
						:class="[$style.filterButton, { [$style.active]: filter === 'direct' }]"
						@click="filter = 'direct'"
					>{{ i18n.ts._chat.filterDirect }}</button>
					<button
						type="button"
						class="_button"
						:class="[$style.filterButton, { [$style.active]: filter === 'rooms' }]"
						@click="filter = 'rooms'"
					>{{ i18n.ts._chat.filterRooms }}</button>
				</div>
				<MkA to="/chat" :class="$style.quickLink">
					<i class="ti ti-messages"></i> {{ i18n.ts._chat.home }}
				</MkA>
			</div>
			<MkChatHistories :filter="filter"/>
		</template>
	</div>
</MkContainer>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import { useWidgetPropsManager } from './widget.js';
import type { WidgetComponentEmits, WidgetComponentExpose, WidgetComponentProps } from './widget.js';
import type { FormWithDefault, GetFormResultType } from '@/utility/form.js';
import MkContainer from '@/components/MkContainer.vue';
import MkInfo from '@/components/MkInfo.vue';
import { i18n } from '@/i18n.js';
import { $i } from '@/i.js';
import MkChatHistories from '@/components/MkChatHistories.vue';

const name = 'chat';

const filter = ref<'all' | 'direct' | 'rooms'>('all');

const widgetPropsDef = {
	showHeader: {
		type: 'boolean',
		label: i18n.ts._widgetOptions.showHeader,
		default: true,
	},
} satisfies FormWithDefault;

type WidgetProps = GetFormResultType<typeof widgetPropsDef>;

const props = defineProps<WidgetComponentProps<WidgetProps>>();
const emit = defineEmits<WidgetComponentEmits<WidgetProps>>();

const { widgetProps, configure, save } = useWidgetPropsManager(name,
	widgetPropsDef,
	props,
	emit,
);

defineExpose<WidgetComponentExpose>({
	name,
	configure,
	id: props.widget ? props.widget.id : null,
});
</script>

<style lang="scss" module>
.headerLink {
	display: inline-flex;
	align-items: center;
	justify-content: center;
}

.body {
	padding: 10px;
}

.toolbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 8px;
}

.filters {
	display: flex;
	align-items: center;
	gap: 4px;
}

.filterButton {
	padding: 4px 10px;
	font-size: 0.85em;
	border-radius: 999px;
	background: var(--MI_THEME-panelHighlight);
	color: var(--MI_THEME-fg);

	&.active {
		background: var(--MI_THEME-accent);
		color: var(--MI_THEME-fgOnAccent);
	}
}

.quickLink {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	font-size: 0.85em;
	color: var(--MI_THEME-accent);
}
</style>
