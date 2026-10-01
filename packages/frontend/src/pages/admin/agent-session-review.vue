<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<!--
会话审查独立页：复用用户侧聊天页组件（agent-session.vue）以只读模式查看任意用户的智能体会话。
路由 /admin/agent-session/:sessionId（moderator 守卫在 router.definition.ts），
query 参数 messageId 深链定位单条消息。页面标题/横幅由 agent-session.vue 审查模式自身提供。
-->
<template>
<XAgentSession :sessionId="sessionId" :messageId="messageId" review/>
</template>

<script lang="ts" setup>
import XAgentSession from '@/pages/chat/agent-session.vue';

const props = defineProps<{
	sessionId: string;
	messageId?: string;
}>();

// 仅为模板提供类型收窄；props 不做额外加工
const { sessionId, messageId } = props;
</script>
