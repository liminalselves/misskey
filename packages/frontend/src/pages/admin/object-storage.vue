<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="activeView" :tabs="headerTabs">
	<div v-if="activeView === 'missing'" class="_spacer" style="--MI_SPACER-w: 1100px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<MkDriveMissingReportsForAdmin/>
	</div>
	<div v-else class="_spacer" style="--MI_SPACER-w: 700px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<SearchMarker path="/admin/object-storage" :label="i18n.ts.objectStorage" :keywords="['objectStorage']" icon="ti ti-cloud">
			<div class="_gaps_m">
				<SearchMarker>
					<MkSwitch v-model="useObjectStorage"><SearchLabel>{{ i18n.ts.useObjectStorage }}</SearchLabel></MkSwitch>
				</SearchMarker>

				<template v-if="useObjectStorage">
					<SearchMarker>
						<MkInput v-model="objectStorageBaseUrl" :placeholder="'https://example.com'" type="url">
							<template #label><SearchLabel>{{ i18n.ts.objectStorageBaseUrl }}</SearchLabel></template>
							<template #caption><SearchText>{{ i18n.ts.objectStorageBaseUrlDesc }}</SearchText></template>
						</MkInput>
					</SearchMarker>

					<SearchMarker>
						<MkInput v-model="objectStorageBucket">
							<template #label><SearchLabel>{{ i18n.ts.objectStorageBucket }}</SearchLabel></template>
							<template #caption><SearchText>{{ i18n.ts.objectStorageBucketDesc }}</SearchText></template>
						</MkInput>
					</SearchMarker>

					<SearchMarker>
						<MkInput v-model="objectStoragePrefix">
							<template #label><SearchLabel>{{ i18n.ts.objectStoragePrefix }}</SearchLabel></template>
							<template #caption><SearchText>{{ i18n.ts.objectStoragePrefixDesc }}</SearchText></template>
						</MkInput>
					</SearchMarker>

					<SearchMarker>
						<MkInput v-model="objectStorageEndpoint" :placeholder="'example.com'">
							<template #label><SearchLabel>{{ i18n.ts.objectStorageEndpoint }}</SearchLabel></template>
							<template #prefix>https://</template>
							<template #caption><SearchText>{{ i18n.ts.objectStorageEndpointDesc }}</SearchText></template>
						</MkInput>
					</SearchMarker>

					<SearchMarker>
						<MkInput v-model="objectStorageRegion">
							<template #label><SearchLabel>{{ i18n.ts.objectStorageRegion }}</SearchLabel></template>
							<template #caption><SearchText>{{ i18n.ts.objectStorageRegionDesc }}</SearchText></template>
						</MkInput>
					</SearchMarker>

					<FormSplit :minWidth="280">
						<SearchMarker>
							<MkInput v-model="objectStorageAccessKey">
								<template #prefix><i class="ti ti-key"></i></template>
								<template #label><SearchLabel>Access key</SearchLabel></template>
							</MkInput>
						</SearchMarker>

						<SearchMarker>
							<MkInput v-model="objectStorageSecretKey" type="password" autocomplete="new-password">
								<template #prefix><i class="ti ti-key"></i></template>
								<template #label><SearchLabel>Secret key</SearchLabel></template>
							</MkInput>
						</SearchMarker>
					</FormSplit>

					<SearchMarker>
						<MkSwitch v-model="objectStorageUseSSL">
							<template #label><SearchLabel>{{ i18n.ts.objectStorageUseSSL }}</SearchLabel></template>
							<template #caption><SearchText>{{ i18n.ts.objectStorageUseSSLDesc }}</SearchText></template>
						</MkSwitch>
					</SearchMarker>

					<SearchMarker>
						<MkSwitch v-model="objectStorageForceHttps">
							<template #label><SearchLabel>{{ i18n.ts.objectStorageForceHttps }}</SearchLabel></template>
							<template #caption><SearchText>{{ i18n.ts.objectStorageForceHttpsDesc }}</SearchText></template>
						</MkSwitch>
					</SearchMarker>

					<SearchMarker>
						<MkSwitch v-model="objectStorageUseProxy">
							<template #label><SearchLabel>{{ i18n.ts.objectStorageUseProxy }}</SearchLabel></template>
							<template #caption><SearchText>{{ i18n.ts.objectStorageUseProxyDesc }}</SearchText></template>
						</MkSwitch>
					</SearchMarker>

					<SearchMarker>
						<MkSwitch v-model="objectStorageSetPublicRead">
							<template #label><SearchLabel>{{ i18n.ts.objectStorageSetPublicRead }}</SearchLabel></template>
						</MkSwitch>
					</SearchMarker>

					<SearchMarker>
						<MkSwitch v-model="objectStorageS3ForcePathStyle">
							<template #label><SearchLabel>s3ForcePathStyle</SearchLabel></template>
							<template #caption><SearchText>{{ i18n.ts.s3ForcePathStyleDesc }}</SearchText></template>
						</MkSwitch>
					</SearchMarker>
				</template>
			</div>
		</SearchMarker>
	</div>
	<template v-if="activeView === 'settings'" #footer>
		<div :class="$style.footer">
			<div class="_spacer" style="--MI_SPACER-w: 700px; --MI_SPACER-min: 16px; --MI_SPACER-max: 16px;">
				<MkButton primary rounded @click="save"><i class="ti ti-check"></i> {{ i18n.ts.save }}</MkButton>
			</div>
		</div>
	</template>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref, computed, watch } from 'vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkInput from '@/components/MkInput.vue';
import FormSplit from '@/components/form/split.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import MkButton from '@/components/MkButton.vue';
import MkDriveMissingReportsForAdmin from '@/components/MkDriveMissingReportsForAdmin.vue';
import { useRouter } from '@/router.js';

const props = defineProps<{ view?: string }>();
const router = useRouter();

// tab 由路由 ?view 决定；默认「设置」不写入地址
const viewKeys = ['settings', 'missing'] as const;
type ViewKey = typeof viewKeys[number];

function resolveView(value: string | undefined): ViewKey {
	return (viewKeys as readonly string[]).includes(value ?? '') ? value as ViewKey : 'settings';
}

const activeView = ref<ViewKey>(resolveView(props.view));

watch(() => props.view, v => {
	activeView.value = resolveView(v);
});

watch(activeView, view => {
	const url = new URL(router.getCurrentFullPath(), window.location.origin);
	if (view === 'settings') url.searchParams.delete('view');
	else url.searchParams.set('view', view);
	const path = `${url.pathname}${url.search}${url.hash}`;
	if (path !== router.getCurrentFullPath()) router.replaceByPath(path);
});

const meta = await misskeyApi('admin/meta');

const useObjectStorage = ref(meta.useObjectStorage);
const objectStorageBaseUrl = ref(meta.objectStorageBaseUrl);
const objectStorageBucket = ref(meta.objectStorageBucket);
const objectStoragePrefix = ref(meta.objectStoragePrefix);
const objectStorageEndpoint = ref(meta.objectStorageEndpoint);
const objectStorageRegion = ref(meta.objectStorageRegion);
const objectStoragePort = ref(meta.objectStoragePort);
const objectStorageAccessKey = ref(meta.objectStorageAccessKey);
const objectStorageSecretKey = ref(meta.objectStorageSecretKey);
const objectStorageUseSSL = ref(meta.objectStorageUseSSL);
const objectStorageForceHttps = ref(meta.objectStorageForceHttps ?? false);
const objectStorageUseProxy = ref(meta.objectStorageUseProxy);
const objectStorageSetPublicRead = ref(meta.objectStorageSetPublicRead);
const objectStorageS3ForcePathStyle = ref(meta.objectStorageS3ForcePathStyle);

function save() {
	os.apiWithDialog('admin/update-meta', {
		useObjectStorage: useObjectStorage.value,
		objectStorageBaseUrl: objectStorageBaseUrl.value,
		objectStorageBucket: objectStorageBucket.value,
		objectStoragePrefix: objectStoragePrefix.value,
		objectStorageEndpoint: objectStorageEndpoint.value,
		objectStorageRegion: objectStorageRegion.value,
		objectStoragePort: objectStoragePort.value,
		objectStorageAccessKey: objectStorageAccessKey.value,
		objectStorageSecretKey: objectStorageSecretKey.value,
		objectStorageUseSSL: objectStorageUseSSL.value,
		objectStorageForceHttps: objectStorageForceHttps.value,
		objectStorageUseProxy: objectStorageUseProxy.value,
		objectStorageSetPublicRead: objectStorageSetPublicRead.value,
		objectStorageS3ForcePathStyle: objectStorageS3ForcePathStyle.value,
	}).then(() => {
		fetchInstance(true);
	});
}

const headerTabs = computed(() => [
	{ key: 'settings', title: '对象存储设置', icon: 'ti ti-settings' },
	{ key: 'missing', title: '丢失文件', icon: 'ti ti-file-alert' },
]);

definePage(() => ({
	title: i18n.ts.objectStorage,
	icon: 'ti ti-cloud',
}));
</script>

<style lang="scss" module>
.footer {
	-webkit-backdrop-filter: var(--MI-blur, blur(15px));
	backdrop-filter: var(--MI-blur, blur(15px));
}
</style>
