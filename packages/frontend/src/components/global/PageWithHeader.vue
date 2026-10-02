<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="rootEl" :class="[reversed ? '_pageScrollableReversed' : '_pageScrollable', fitContent && $style.fitContent]">
		<MkStickyContainer>
			<template v-if="!hideHeader" #header>
				<!-- チャット等 narrowMergedRow かつ狭い幅では頂部にタブを出す（底タブと二重にならないようにする） -->
				<MkPageHeader v-if="useBottomTabsInFooter" v-bind="pageHeaderPropsWithoutTabs"/>
				<MkPageHeader v-else v-model:tab="tab" v-bind="pageHeaderProps"/>
			</template>
			<div :class="$style.body">
				<MkSwiper v-if="prefer.s.enableHorizontalSwipe && swipable && (props.tabs?.length ?? 1) > 1" v-model:tab="tab" :class="$style.swiper" :tabs="props.tabs ?? []">
					<slot></slot>
				</MkSwiper>
				<slot v-else></slot>
			</div>
			<template #footer>
				<slot name="footer"></slot>
				<div v-if="!hideHeader && useBottomTabsInFooter" :class="$style.footerTabs">
					<MkTabs v-model:tab="tab" :tabs="props.tabs" :centered="true" :tabHighlightUpper="true"/>
				</div>
			</template>
	</MkStickyContainer>
</div>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref, useTemplateRef } from 'vue';
import { scrollInContainer } from '@@/js/scroll.js';
import type { PageHeaderProps } from './MkPageHeader.vue';
import { useScrollPositionKeeper } from '@/composables/use-scroll-position-keeper.js';
import MkSwiper from '@/components/MkSwiper.vue';
import { useRouter } from '@/router.js';
import { prefer } from '@/preferences.js';
import MkTabs from '@/components/MkTabs.vue';

const props = withDefaults(defineProps<PageHeaderProps & {
	reversed?: boolean;
	swipable?: boolean;
	hideHeader?: boolean;
	fitContent?: boolean;
}>(), {
	reversed: false,
	swipable: true,
	hideHeader: false,
	fitContent: false,
	showBack: undefined,
});

/** MkPageHeader.narrow と同じ閾値：狭い画面ではチャット頂部タブを優先 */
const isNarrowViewport = ref(typeof window !== 'undefined' && window.innerWidth < 500);
const isMobileSection = ref(typeof window !== 'undefined' && window.innerWidth < 600);

function updateNarrowViewport() {
	isNarrowViewport.value = window.innerWidth < 500;
	isMobileSection.value = window.innerWidth < 600;
}

onMounted(() => {
	window.addEventListener('resize', updateNarrowViewport);
});

onUnmounted(() => {
	window.removeEventListener('resize', updateNarrowViewport);
});

/** 設定「ページタブを下」かつ、チャット窄屏で頂部にタブを出すときは false */
const useBottomTabsInFooter = computed(() =>
	prefer.s.showPageTabBarBottom &&
	(props.tabs?.length ?? 0) > 0 &&
	!(props.narrowMergedRow && isNarrowViewport.value),
);

const router = useRouter();
const sectionBackPath = computed(() => {
	const path = router.currentRef.value.route.path;
	if (path.startsWith('/admin')) return '/admin';
	if (path === '/settings' && router.currentRef.value.child?.route.name != null) return '/settings';
	return undefined;
});

const pageHeaderProps = computed(() => {
	const { reversed, tab, swipable, hideHeader, fitContent, ...rest } = props;
	return {
		...rest,
		showBack: props.showBack ?? (isMobileSection.value && sectionBackPath.value != null),
		backPath: props.backPath ?? sectionBackPath.value,
	};
});

const pageHeaderPropsWithoutTabs = computed(() => {
	const { tabs, ...rest } = pageHeaderProps.value;
	return rest;
});

const tab = defineModel<string>('tab');
const rootEl = useTemplateRef('rootEl');

useScrollPositionKeeper(rootEl);

router.useListener('same', () => {
	if (rootEl.value?.isConnected) scrollToTop();
});

function scrollToTop() {
	if (rootEl.value) scrollInContainer(rootEl.value, { top: 0, behavior: 'smooth' });
}

defineExpose({
	scrollToTop,
});
</script>

<style lang="scss" module>
.fitContent {
	height: auto;
	min-height: 0;
	overflow: visible;
}

.fitContent .body,
.fitContent .swiper {
	min-height: 0;
}

.body, .swiper {
	min-height: calc(100cqh - (var(--MI-stickyTop, 0px) + var(--MI-stickyBottom, 0px)));
}

.footerTabs {
	background: color(from var(--MI_THEME-pageHeaderBg) srgb r g b / 0.75);
	-webkit-backdrop-filter: var(--MI-blur, blur(15px));
	backdrop-filter: var(--MI-blur, blur(15px));
	border-top: solid 0.5px var(--MI_THEME-divider);
}
</style>
