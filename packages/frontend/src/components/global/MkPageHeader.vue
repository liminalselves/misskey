<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div v-if="show" ref="el" :class="[$style.root]">
	<!-- 聊天页・狭い幅：左＝戻る＋名前、中央＝左右の間の余白内でタブを相対センター、右＝メニュー -->
	<div v-if="narrowMergedRow && narrow" :class="[$style.upper, $style.chatMobileUpper, { [$style.slim]: narrow, [$style.thin]: thin_ }]">
		<div :class="$style.chatMobileLeft">
			<button
				v-if="!thin_ && showBack"
				v-tooltip.noDelay="i18n.ts.goBack"
				type="button"
				class="_button"
				:class="$style.leadingBack"
				@click="goBack"
			>
				<i class="ti ti-chevron-left ti-fw"></i>
			</button>
			<template v-if="pageMetadata">
				<div v-if="!hideTitle" :class="[$style.titleContainer, $style.chatMobileTitle]" @click="top">
					<div v-if="pageMetadata.avatar" :class="$style.titleAvatarContainer">
						<MkAvatar :class="$style.titleAvatar" :user="pageMetadata.avatar" indicator/>
					</div>
					<i v-else-if="pageMetadata.icon" :class="[$style.titleIcon, pageMetadata.icon]"></i>

					<div class="_nowrap" :class="$style.title">
						<div :class="$style.chatMobileTitleMain">
							<MkUserName v-if="pageMetadata.userName" :user="pageMetadata.userName" :nowrap="true"/>
							<div v-else-if="pageMetadata.title" class="_nowrap">{{ pageMetadata.title }}</div>
						</div>
						<div v-if="pageMetadata.subtitle" :class="$style.subtitle">
							{{ pageMetadata.subtitle }}
						</div>
					</div>
				</div>
			</template>
		</div>
		<div :class="$style.chatMobileTabsMid">
			<XTabs v-if="hasTabs" :class="[$style.tabs, $style.chatMobileTabs]" :tab="tab" :tabs="tabs" :rootEl="el" @update:tab="key => emit('update:tab', key)" @tabClick="onTabClick"/>
		</div>
		<div v-if="actions && actions.length > 0" :class="$style.buttons">
			<template v-for="action in actions">
				<button v-tooltip.noDelay="action.text" class="_button" :class="[$style.button, { [$style.highlighted]: action.highlighted }, { [$style.danger]: action.danger }]" @click.stop="action.handler" @touchstart="preventDrag"><i :class="action.icon"></i></button>
			</template>
		</div>
	</div>

	<!-- デスクトップおよび通常のモバイルヘッダー -->
	<div v-else :class="[$style.upper, { [$style.slim]: narrow, [$style.thin]: thin_ }]">
		<button
			v-if="!thin_ && showBack"
			v-tooltip.noDelay="i18n.ts.goBack"
			type="button"
			class="_button"
			:class="$style.leadingBack"
			@click="goBack"
		>
			<i class="ti ti-chevron-left ti-fw"></i>
		</button>
		<div v-if="!thin_ && narrow && props.displayMyAvatar && $i" class="_button" @click="openAccountMenu">
			<MkAvatar :class="$style.avatar" :user="$i"/>
		</div>
		<div v-else-if="!thin_ && narrow && !hideTitle" :class="$style.buttons"></div>

		<template v-if="pageMetadata">
			<div v-if="!hideTitle" :class="$style.titleContainer" @click="top">
				<div v-if="pageMetadata.avatar" :class="$style.titleAvatarContainer">
					<MkAvatar :class="$style.titleAvatar" :user="pageMetadata.avatar" indicator/>
				</div>
				<i v-else-if="pageMetadata.icon" :class="[$style.titleIcon, pageMetadata.icon]"></i>

				<div class="_nowrap" :class="$style.title">
					<MkUserName v-if="pageMetadata.userName" :user="pageMetadata.userName" :nowrap="true"/>
					<div v-else-if="pageMetadata.title" class="_nowrap">{{ pageMetadata.title }}</div>
					<div v-if="pageMetadata.subtitle" :class="$style.subtitle">
						{{ pageMetadata.subtitle }}
					</div>
				</div>
			</div>
			<XTabs v-if="(!narrow || hideTitle) && hasTabs" :class="$style.tabs" :tab="tab" :tabs="tabs" :rootEl="el" @update:tab="key => emit('update:tab', key)" @tabClick="onTabClick"/>
		</template>
		<div v-if="(!thin_ && narrow && !hideTitle) || (actions && actions.length > 0)" :class="$style.buttons">
			<template v-for="action in actions">
				<button v-tooltip.noDelay="action.text" class="_button" :class="[$style.button, { [$style.highlighted]: action.highlighted }, { [$style.danger]: action.danger }]" @click.stop="action.handler" @touchstart="preventDrag"><i :class="action.icon"></i></button>
			</template>
		</div>
	</div>
	<div v-if="showLowerTabs" :class="[$style.lower, { [$style.slim]: narrow, [$style.thin]: thin_ }]">
		<XTabs :class="$style.tabs" :tab="tab" :tabs="tabs" :rootEl="el" @update:tab="key => emit('update:tab', key)" @tabClick="onTabClick"/>
	</div>
</div>
</template>

<script lang="ts">
import type { PageHeaderItem } from '@/types/page-header.js';
import type { PageMetadata } from '@/page.js';
import type { Tab } from './MkPageHeader.tabs.vue';

export type PageHeaderProps = {
	overridePageMetadata?: PageMetadata;
	tabs?: Tab[];
	tab?: string;
	actions?: PageHeaderItem[] | null;
	thin?: boolean;
	hideTitle?: boolean;
	canOmitTitle?: boolean;
	displayMyAvatar?: boolean;
	/** チャットルーム等：狭い幅では1行に戻る・タイトル・タブ・操作。デスクトップは通常ヘッダー */
	narrowMergedRow?: boolean;
	/** 先頭に戻る操作を表示する */
	showBack?: boolean;
	/** 戻る履歴がない場合の遷移先 */
	backPath?: string;
};
</script>

<script lang="ts" setup>
import { onMounted, onUnmounted, ref, inject, useTemplateRef, computed } from 'vue';
import { scrollToTop } from '@@/js/scroll.js';
import XTabs from './MkPageHeader.tabs.vue';
import { getAccountMenu } from '@/accounts.js';
import { $i } from '@/i.js';
import { DI } from '@/di.js';
import * as os from '@/os.js';
import { useRouter } from '@/router.js';
import { i18n } from '@/i18n.js';

const props = withDefaults(defineProps<PageHeaderProps>(), {
	tabs: () => ([] as Tab[]),
	narrowMergedRow: false,
	showBack: false,
	backPath: '/chat',
});

const emit = defineEmits<{
	(ev: 'update:tab', key: string): void;
}>();

//const viewId = inject(DI.viewId);
const injectedPageMetadata = inject(DI.pageMetadata, ref(null));
const pageMetadata = computed(() => props.overridePageMetadata ?? injectedPageMetadata.value);

const hideTitle = computed(() => inject('shouldOmitHeaderTitle', false) || props.hideTitle || (props.canOmitTitle && props.tabs.length > 0));
const thin_ = props.thin || inject('shouldHeaderThin', false);

const el = useTemplateRef('el');
const narrow = ref(false);
const hasTabs = computed(() => props.tabs.length > 0);
const hasActions = computed(() => props.actions && props.actions.length > 0);
const showLowerTabs = computed(() =>
	narrow.value && !hideTitle.value && hasTabs.value && !(props.narrowMergedRow && narrow.value),
);

const router = useRouter();

function goBack() {
	// Nirax の Router に .back() は無い。アプリ内遷移では pushState により state が設定されるため、
	// アドレスバー等から直接開いたページでブラウザ外へ戻ることを避ける。
	if (window.history.state != null && window.history.length > 1) {
		window.history.back();
	} else {
		router.pushByPath(props.backPath, 'forcePage');
	}
}

const show = computed(() => {
	return !hideTitle.value || hasTabs.value || hasActions.value;
});

const preventDrag = (ev: TouchEvent) => {
	ev.stopPropagation();
};

const top = () => {
	if (el.value) {
		scrollToTop(el.value as HTMLElement, { behavior: 'smooth' });
	}
};

async function openAccountMenu(ev: PointerEvent) {
	const menuItems = await getAccountMenu({
		withExtraOperation: true,
	});

	os.popupMenu(menuItems, ev.currentTarget ?? ev.target);
}

function onTabClick(): void {
	top();
}

let ro: ResizeObserver | null;

onMounted(() => {
	if (el.value && el.value.parentElement) {
		narrow.value = el.value.parentElement.offsetWidth < 500;
		ro = new ResizeObserver((entries, observer) => {
			if (el.value && el.value.parentElement && window.document.body.contains(el.value as HTMLElement)) {
				narrow.value = el.value.parentElement.offsetWidth < 500;
			}
		});
		ro.observe(el.value.parentElement as HTMLElement);
	}
});

onUnmounted(() => {
	if (ro) ro.disconnect();
});
</script>

<style lang="scss" module>
.root {
	background: color(from var(--MI_THEME-pageHeaderBg) srgb r g b / 0.75);
	-webkit-backdrop-filter: var(--MI-blur, blur(15px));
	backdrop-filter: var(--MI-blur, blur(15px));
	border-bottom: solid 0.5px transparent;
	width: 100%;
	color: var(--MI_THEME-pageHeaderFg);
}

@container style(--MI_THEME-pageHeaderBg: var(--MI_THEME-bg)) {
	.root {
		border-bottom: solid 0.5px var(--MI_THEME-divider);
	}
}

.upper,
.lower {
	width: 100%;
	background: transparent;
}

.upper {
	--height: 50px;
	--margin: var(--MI-margin);
	display: flex;
	gap: var(--margin);
	align-items: center;
	height: var(--height);

	.tabs:first-child {
		margin-left: auto;
		padding: 0 12px;
	}
	.tabs {
		margin-right: auto;
	}

	&.thin {
		--height: 40px;
		--margin: 8px;

		> .buttons {
			> .button {
				font-size: 0.9em;
			}
		}
	}

	&.slim {
		text-align: center;

		.titleContainer {
			margin: 0 auto;
			max-width: 100%;
		}
	}

}

/* flex 中央列が左右の固定幅の間の余白を埋め、その中でタブだけ justify-content:center（画面絶対中央ではない） */
.chatMobileUpper {
	display: flex;
	align-items: center;
	gap: 4px;
	min-width: 0;
	width: 100%;
}

.chatMobileLeft {
	display: flex;
	align-items: center;
	gap: 4px;
	flex: 0 1 auto;
	min-width: 0;
	max-width: 50%;
	overflow: hidden;
}

.chatMobileTabsMid {
	flex: 1 1 0;
	min-width: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	overflow: hidden;

	:deep(.tabsInner) {
		width: auto;
		margin-left: 0;
		margin-right: 0;
	}
}

.chatMobileUpper > .buttons {
	flex: 0 0 auto;
}

.chatMobileTitle {
	margin-left: 0 !important;
	flex: 1 1 auto;
	min-width: 0;
	max-width: calc(100% - (var(--height) - 8px));
}

.chatMobileTitle :global(._nowrap) {
	display: block;
	min-width: 0;
	overflow: visible;
	text-overflow: clip;
}

.chatMobileTabs {
	font-size: 0.72em;
}

.chatMobileTitleMain {
	display: block;
	min-width: 0;
	max-width: 100%;
	overflow-x: auto;
	overflow-y: hidden;
	white-space: nowrap;
	-webkit-overflow-scrolling: touch;
	scrollbar-width: none;

	&::-webkit-scrollbar {
		display: none;
	}
}

.leadingBack {
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	width: calc(var(--height) - 8px);
	height: var(--height);
	border-radius: 5px;

	&:hover {
		background: rgba(0, 0, 0, 0.05);
	}
}

.lower {
	--height: 40px;
	height: var(--height);
}

.buttons {
	flex-shrink: 0;
	display: flex;
	align-items: center;
	margin-left: auto;
	min-width: var(--height);
	height: var(--height);
	&:empty {
		width: var(--height);
	}
}

.avatar {
	$size: 32px;
	display: inline-block;
	width: $size;
	height: $size;
	vertical-align: bottom;
	margin: 0 8px;
}

.button {
	display: flex;
	align-items: center;
	justify-content: center;
	height: var(--height);
	width: calc(var(--height) - 8px);
	box-sizing: border-box;
	position: relative;
	border-radius: 5px;

	&:hover {
		background: rgba(0, 0, 0, 0.05);
	}

	&.highlighted {
		color: var(--MI_THEME-accent);
	}

	&.danger {
		color: var(--MI_THEME-error);

		&:hover {
			background: color-mix(in srgb, var(--MI_THEME-error) 14%, transparent);
		}
	}
}

.fullButton {
	& + .fullButton {
		margin-left: 12px;
	}
}

.titleContainer {
	display: flex;
	align-items: center;
	min-width: 0;
	max-width: min(30vw, 400px);
	overflow: clip;
	white-space: nowrap;
	text-align: left;
	font-weight: bold;
	flex-shrink: 1;
	margin-left: 24px;
}

.titleAvatarContainer {
	$size: 32px;
	contain: strict;
	overflow: clip;
	width: $size;
	height: $size;
	padding: 8px;
	flex-shrink: 0;
}

.titleAvatar {
	width: 100%;
	height: 100%;
	pointer-events: none;
}

.titleIcon {
	margin-right: 8px;
	width: 16px;
	text-align: center;
}

.title {
	min-width: 0;
	line-height: 1.1;
}

.subtitle {
	opacity: 0.6;
	font-size: 0.8em;
	font-weight: normal;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;

	&.activeTab {
		text-align: center;

		> .chevron {
			display: inline-block;
			margin-left: 6px;
		}
	}
}
</style>
