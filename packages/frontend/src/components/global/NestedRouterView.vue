<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<KeepAlive :max="prefer.s.numberOfPageCache">
	<Suspense v-if="currentPageCached" :timeout="0">
		<component :is="currentPageComponent" :key="key" v-bind="Object.fromEntries(currentPageProps)"/>
		<template #fallback><MkLoading/></template>
	</Suspense>
</KeepAlive>
<Suspense v-if="!currentPageCached" :timeout="0">
	<component :is="currentPageComponent" :key="key" v-bind="Object.fromEntries(currentPageProps)"/>
	<template #fallback><MkLoading/></template>
</Suspense>
</template>

<script lang="ts" setup>
import { inject, provide, ref, shallowRef } from 'vue';
import type { Router } from '@/router.js';
import type { PathResolvedResult } from '@/lib/nirax.js';
import MkLoadingPage from '@/pages/_loading_.vue';
import { DI } from '@/di.js';
import { prefer } from '@/preferences.js';
import { deepEqual } from '@/utility/deep-equal.js';

const props = defineProps<{
	router?: Router;
}>();

const router = props.router ?? inject(DI.router);

if (router == null) {
	throw new Error('no router provided');
}

const currentDepth = inject(DI.routerCurrentDepth, 0);
provide(DI.routerCurrentDepth, currentDepth + 1);

function resolveNested(current: PathResolvedResult, d = 0): PathResolvedResult | null {
	if (d === currentDepth) {
		return current;
	} else {
		if (current.child) {
			return resolveNested(current.child, d + 1);
		} else {
			return null;
		}
	}
}

const parentRoutePath = router.current.route.path;
const current = resolveNested(router.current)!;
const currentPageComponent = shallowRef('component' in current.route ? current.route.component : MkLoadingPage);
const currentPageProps = ref(current.props);
const currentPageCached = ref(current.route.cache === true);
let currentRoutePath = current.route.path;
// Query-driven tabs share one instance; parameterized routes still use the full path.
const key = ref(current.route.reuseComponent ? current.route.path : router.getCurrentFullPath());

router.useListener('change', ({ resolved }) => {
	if (resolved.route.path !== parentRoutePath) return;
	const current = resolveNested(resolved);
	if (current == null || 'redirect' in current.route) return;
	if (current.route.path === currentRoutePath && deepEqual(current.props, currentPageProps.value)) return;
	if (current.route.path === currentRoutePath && current.route.reuseComponent) {
		currentPageProps.value = current.props;
		return;
	}
	currentPageComponent.value = current.route.component;
	currentPageProps.value = current.props;
	currentPageCached.value = current.route.cache === true;
	key.value = current.route.reuseComponent ? current.route.path : router.getCurrentFullPath();
	currentRoutePath = current.route.path;
});
</script>
