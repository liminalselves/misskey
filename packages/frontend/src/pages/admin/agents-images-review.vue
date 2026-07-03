<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkLoading/>
</template>

<script lang="ts" setup>
import { onMounted } from 'vue';
import MkLoading from '@/components/global/MkLoading.vue';
import { definePage } from '@/page.js';
import { useRouter } from '@/router.js';

const router = useRouter();

onMounted(() => {
	router.replace('/admin/agents-review?tab=images' as any);
});

definePage({
	title: 'AI 生图审核',
	icon: 'ti ti-photo-shield',
});
</script>
