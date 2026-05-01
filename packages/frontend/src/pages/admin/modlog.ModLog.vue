<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder>
	<template #label>
		<b
			:class="{
				[$style.logGreen]: [
					'createRole',
					'addCustomEmoji',
					'createGlobalAnnouncement',
					'createUserAnnouncement',
					'createAd',
					'createInvitation',
					'createAvatarDecoration',
					'createSystemWebhook',
					'createAbuseReportNotificationRecipient',
				].includes(log.type),
				[$style.logYellow]: [
					'markSensitiveDriveFile',
					'resetPassword',
					'suspendRemoteInstance',
				].includes(log.type),
				[$style.logRed]: [
					'suspend',
					'deleteRole',
					'deleteGlobalAnnouncement',
					'deleteUserAnnouncement',
					'deleteCustomEmoji',
					'deleteNote',
					'deleteDriveFile',
					'deleteAd',
					'deleteAvatarDecoration',
					'deleteSystemWebhook',
					'deleteAbuseReportNotificationRecipient',
					'deleteAccount',
					'deletePage',
					'deleteFlash',
					'deleteGalleryPost',
					'deleteChatRoom',
					'setAgentSessionModerationBan',
					'setAgentCharacterModerationBan',
				].includes(log.type)
			}"
		>{{ i18n.ts._moderationLogTypes[log.type] }}</b>
		<span v-if="log.type === 'updateUserNote'">: @{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }}</span>
		<span v-else-if="log.type === 'suspend'">: @{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }}</span>
		<span v-else-if="log.type === 'unsuspend'">: @{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }}</span>
		<span v-else-if="log.type === 'resetPassword'">: @{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }}</span>
		<span v-else-if="log.type === 'assignRole'">: @{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }} <i class="ti ti-arrow-right"></i> {{ log.info.roleName }}</span>
		<span v-else-if="log.type === 'unassignRole'">: @{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }} <i class="ti ti-equal-not"></i> {{ log.info.roleName }}</span>
		<span v-else-if="log.type === 'createRole'">: {{ log.info.role.name }}</span>
		<span v-else-if="log.type === 'updateRole'">: {{ log.info.before.name }}</span>
		<span v-else-if="log.type === 'deleteRole'">: {{ log.info.role.name }}</span>
		<span v-else-if="log.type === 'addCustomEmoji'">: {{ log.info.emoji.name }}</span>
		<span v-else-if="log.type === 'updateCustomEmoji'">: {{ log.info.before.name }}</span>
		<span v-else-if="log.type === 'deleteCustomEmoji'">: {{ log.info.emoji.name }}</span>
		<span v-else-if="log.type === 'markSensitiveDriveFile'">: @{{ log.info.fileUserUsername }}{{ log.info.fileUserHost ? '@' + log.info.fileUserHost : '' }}</span>
		<span v-else-if="log.type === 'unmarkSensitiveDriveFile'">: @{{ log.info.fileUserUsername }}{{ log.info.fileUserHost ? '@' + log.info.fileUserHost : '' }}</span>
		<span v-else-if="log.type === 'suspendRemoteInstance'">: {{ log.info.host }}</span>
		<span v-else-if="log.type === 'unsuspendRemoteInstance'">: {{ log.info.host }}</span>
		<span v-else-if="log.type === 'createGlobalAnnouncement'">: {{ log.info.announcement.title }}</span>
		<span v-else-if="log.type === 'updateGlobalAnnouncement'">: {{ log.info.before.title }}</span>
		<span v-else-if="log.type === 'deleteGlobalAnnouncement'">: {{ log.info.announcement.title }}</span>
		<span v-else-if="log.type === 'createUserAnnouncement'">: @{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }}</span>
		<span v-else-if="log.type === 'updateUserAnnouncement'">: @{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }}</span>
		<span v-else-if="log.type === 'deleteUserAnnouncement'">: @{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }}</span>
		<span v-else-if="log.type === 'deleteNote'">: @{{ log.info.noteUserUsername }}{{ log.info.noteUserHost ? '@' + log.info.noteUserHost : '' }}</span>
		<span v-else-if="log.type === 'deleteDriveFile'">: @{{ log.info.fileUserUsername }}{{ log.info.fileUserHost ? '@' + log.info.fileUserHost : '' }}</span>
		<span v-else-if="log.type === 'createAvatarDecoration'">: {{ log.info.avatarDecoration.name }}</span>
		<span v-else-if="log.type === 'updateAvatarDecoration'">: {{ log.info.before.name }}</span>
		<span v-else-if="log.type === 'deleteAvatarDecoration'">: {{ log.info.avatarDecoration.name }}</span>
		<span v-else-if="log.type === 'createSystemWebhook'">: {{ log.info.webhook.name }}</span>
		<span v-else-if="log.type === 'updateSystemWebhook'">: {{ log.info.before.name }}</span>
		<span v-else-if="log.type === 'deleteSystemWebhook'">: {{ log.info.webhook.name }}</span>
		<span v-else-if="log.type === 'createAbuseReportNotificationRecipient'">: {{ log.info.recipient.name }}</span>
		<span v-else-if="log.type === 'updateAbuseReportNotificationRecipient'">: {{ log.info.before.name }}</span>
		<span v-else-if="log.type === 'deleteAbuseReportNotificationRecipient'">: {{ log.info.recipient.name }}</span>
		<span v-else-if="log.type === 'deleteAccount'">: @{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }}</span>
		<span v-else-if="log.type === 'deletePage'">: @{{ log.info.pageUserUsername }}</span>
		<span v-else-if="log.type === 'deleteFlash'">: @{{ log.info.flashUserUsername }}</span>
		<span v-else-if="log.type === 'deleteGalleryPost'">: @{{ log.info.postUserUsername }}</span>
		<span v-else-if="log.type === 'deleteChatRoom'">: @{{ log.info.room.name }}</span>
		<span v-else-if="log.type === 'resolveAgentReview'">: {{ log.info.kind === 'character' ? i18n.ts._agents.reviewKindCharacter : i18n.ts._agents.reviewKindStyle }} · {{ log.info.name }}</span>
		<span v-else-if="log.type === 'setAgentSessionModerationBan'">: {{ log.info.sessionName }} <span class="_text">({{ log.info.sessionId }})</span> · {{ log.info.banned ? i18n.ts._agents.modlogAgentBanOn : i18n.ts._agents.modlogAgentBanOff }}</span>
		<span v-else-if="log.type === 'setAgentCharacterModerationBan'">: {{ log.info.characterName }} <span class="_text">({{ log.info.characterId }})</span> · {{ log.info.banned ? i18n.ts._agents.modlogAgentBanOn : i18n.ts._agents.modlogAgentBanOff }}</span>
	</template>
	<template #icon>
		<i v-if="log.type === 'updateServerSettings'" class="ti ti-settings"></i>
		<i v-else-if="log.type === 'updateUserNote'" class="ti ti-pencil"></i>
		<i v-else-if="log.type === 'suspend'" class="ti ti-user-x"></i>
		<i v-else-if="log.type === 'unsuspend'" class="ti ti-user-check"></i>
		<i v-else-if="log.type === 'resetPassword'" class="ti ti-key"></i>
		<i v-else-if="log.type === 'assignRole'" class="ti ti-user-plus"></i>
		<i v-else-if="log.type === 'unassignRole'" class="ti ti-user-minus"></i>
		<i v-else-if="log.type === 'createRole'" class="ti ti-plus"></i>
		<i v-else-if="log.type === 'updateRole'" class="ti ti-pencil"></i>
		<i v-else-if="log.type === 'deleteRole'" class="ti ti-trash"></i>
		<i v-else-if="log.type === 'addCustomEmoji'" class="ti ti-plus"></i>
		<i v-else-if="log.type === 'updateCustomEmoji'" class="ti ti-pencil"></i>
		<i v-else-if="log.type === 'deleteCustomEmoji'" class="ti ti-trash"></i>
		<i v-else-if="log.type === 'markSensitiveDriveFile'" class="ti ti-eye-exclamation"></i>
		<i v-else-if="log.type === 'unmarkSensitiveDriveFile'" class="ti ti-eye"></i>
		<i v-else-if="log.type === 'suspendRemoteInstance'" class="ti ti-x"></i>
		<i v-else-if="log.type === 'unsuspendRemoteInstance'" class="ti ti-check"></i>
		<i v-else-if="log.type === 'createGlobalAnnouncement'" class="ti ti-plus"></i>
		<i v-else-if="log.type === 'updateGlobalAnnouncement'" class="ti ti-pencil"></i>
		<i v-else-if="log.type === 'deleteGlobalAnnouncement'" class="ti ti-trash"></i>
		<i v-else-if="log.type === 'createUserAnnouncement'" class="ti ti-plus"></i>
		<i v-else-if="log.type === 'updateUserAnnouncement'" class="ti ti-pencil"></i>
		<i v-else-if="log.type === 'deleteUserAnnouncement'" class="ti ti-trash"></i>
		<i v-else-if="log.type === 'deleteNote'" class="ti ti-trash"></i>
		<i v-else-if="log.type === 'deleteDriveFile'" class="ti ti-trash"></i>
		<i v-else-if="log.type === 'createAd'" class="ti ti-plus"></i>
		<i v-else-if="log.type === 'updateAd'" class="ti ti-pencil"></i>
		<i v-else-if="log.type === 'deleteAd'" class="ti ti-trash"></i>
		<i v-else-if="log.type === 'createAvatarDecoration'" class="ti ti-plus"></i>
		<i v-else-if="log.type === 'updateAvatarDecoration'" class="ti ti-pencil"></i>
		<i v-else-if="log.type === 'deleteAvatarDecoration'" class="ti ti-trash"></i>
		<i v-else-if="log.type === 'createSystemWebhook'" class="ti ti-plus"></i>
		<i v-else-if="log.type === 'updateSystemWebhook'" class="ti ti-pencil"></i>
		<i v-else-if="log.type === 'deleteSystemWebhook'" class="ti ti-trash"></i>
		<i v-else-if="log.type === 'createAbuseReportNotificationRecipient'" class="ti ti-plus"></i>
		<i v-else-if="log.type === 'updateAbuseReportNotificationRecipient'" class="ti ti-pencil"></i>
		<i v-else-if="log.type === 'deleteAbuseReportNotificationRecipient'" class="ti ti-trash"></i>
		<i v-else-if="log.type === 'deleteAccount'" class="ti ti-trash"></i>
		<i v-else-if="log.type === 'deletePage'" class="ti ti-trash"></i>
		<i v-else-if="log.type === 'deleteFlash'" class="ti ti-trash"></i>
		<i v-else-if="log.type === 'deleteGalleryPost'" class="ti ti-trash"></i>
		<i v-else-if="log.type === 'deleteChatRoom'" class="ti ti-trash"></i>
		<i v-else-if="log.type === 'resolveAgentReview'" class="ti ti-checkbox"></i>
		<i v-else-if="log.type === 'setAgentSessionModerationBan'" class="ti ti-message-off"></i>
		<i v-else-if="log.type === 'setAgentCharacterModerationBan'" class="ti ti-user-off"></i>
	</template>
	<template #suffix>
		<MkTime :time="log.createdAt"/>
	</template>

	<div>
		<div style="display: flex; gap: var(--MI-margin); flex-wrap: wrap;">
			<div style="flex: 1;">{{ i18n.ts.moderator }}: <MkA :to="`/admin/user/${log.userId}`" class="_link">@{{ log.user?.username }}</MkA></div>
			<div style="flex: 1;">{{ i18n.ts.dateAndTime }}: <MkTime :time="log.createdAt" mode="detail"/></div>
		</div>

		<template v-if="log.type === 'updateServerSettings'">
			<div :class="$style.diff">
				<CodeDiff :context="5" :hideHeader="true" :oldString="JSON5.stringify(log.info.before, null, '\t')" :newString="JSON5.stringify(log.info.after, null, '\t')" language="javascript" maxHeight="300px"/>
			</div>
		</template>
		<template v-else-if="log.type === 'updateUserNote'">
			<div>{{ i18n.ts.user }}: {{ log.info.userId }}</div>
			<div :class="$style.diff">
				<CodeDiff :context="5" :hideHeader="true" :oldString="log.info.before ?? ''" :newString="log.info.after ?? ''" maxHeight="300px"/>
			</div>
		</template>
		<template v-else-if="log.type === 'suspend'">
			<div>{{ i18n.ts.user }}: <MkA :to="`/admin/user/${log.info.userId}`" class="_link">@{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }}</MkA></div>
		</template>
		<template v-else-if="log.type === 'unsuspend'">
			<div>{{ i18n.ts.user }}: <MkA :to="`/admin/user/${log.info.userId}`" class="_link">@{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }}</MkA></div>
		</template>
		<template v-else-if="log.type === 'updateRole'">
			<div :class="$style.diff">
				<CodeDiff :context="5" :hideHeader="true" :oldString="JSON5.stringify(log.info.before, null, '\t')" :newString="JSON5.stringify(log.info.after, null, '\t')" language="javascript" maxHeight="300px"/>
			</div>
		</template>
		<template v-else-if="log.type === 'assignRole'">
			<div>{{ i18n.ts.user }}: {{ log.info.userId }}</div>
			<div>{{ i18n.ts.role }}: {{ log.info.roleName }} [{{ log.info.roleId }}]</div>
		</template>
		<template v-else-if="log.type === 'unassignRole'">
			<div>{{ i18n.ts.user }}: {{ log.info.userId }}</div>
			<div>{{ i18n.ts.role }}: {{ log.info.roleName }} [{{ log.info.roleId }}]</div>
		</template>
		<template v-else-if="log.type === 'updateCustomEmoji'">
			<div>{{ i18n.ts.emoji }}: {{ log.info.emojiId }}</div>
			<div :class="$style.diff">
				<CodeDiff :context="5" :hideHeader="true" :oldString="JSON5.stringify(log.info.before, null, '\t')" :newString="JSON5.stringify(log.info.after, null, '\t')" language="javascript" maxHeight="300px"/>
			</div>
		</template>
		<template v-else-if="log.type === 'updateAd'">
			<div :class="$style.diff">
				<CodeDiff :context="5" :hideHeader="true" :oldString="JSON5.stringify(log.info.before, null, '\t')" :newString="JSON5.stringify(log.info.after, null, '\t')" language="javascript" maxHeight="300px"/>
			</div>
		</template>
		<template v-else-if="log.type === 'updateGlobalAnnouncement'">
			<div :class="$style.diff">
				<CodeDiff :context="5" :hideHeader="true" :oldString="JSON5.stringify(log.info.before, null, '\t')" :newString="JSON5.stringify(log.info.after, null, '\t')" language="javascript" maxHeight="300px"/>
			</div>
		</template>
		<template v-else-if="log.type === 'updateUserAnnouncement'">
			<div :class="$style.diff">
				<CodeDiff :context="5" :hideHeader="true" :oldString="JSON5.stringify(log.info.before, null, '\t')" :newString="JSON5.stringify(log.info.after, null, '\t')" language="javascript" maxHeight="300px"/>
			</div>
		</template>
		<template v-else-if="log.type === 'updateAvatarDecoration'">
			<div :class="$style.diff">
				<CodeDiff :context="5" :hideHeader="true" :oldString="JSON5.stringify(log.info.before, null, '\t')" :newString="JSON5.stringify(log.info.after, null, '\t')" language="javascript" maxHeight="300px"/>
			</div>
		</template>
		<template v-else-if="log.type === 'updateRemoteInstanceNote'">
			<div :class="$style.diff">
				<CodeDiff :context="5" :hideHeader="true" :oldString="log.info.before ?? ''" :newString="log.info.after ?? ''" maxHeight="300px"/>
			</div>
		</template>
		<template v-else-if="log.type === 'updateSystemWebhook'">
			<div :class="$style.diff">
				<CodeDiff :context="5" :hideHeader="true" :oldString="JSON5.stringify(log.info.before, null, '\t')" :newString="JSON5.stringify(log.info.after, null, '\t')" language="javascript" maxHeight="300px"/>
			</div>
		</template>
		<template v-else-if="log.type === 'updateAbuseReportNotificationRecipient'">
			<div :class="$style.diff">
				<CodeDiff :context="5" :hideHeader="true" :oldString="JSON5.stringify(log.info.before, null, '\t')" :newString="JSON5.stringify(log.info.after, null, '\t')" language="javascript" maxHeight="300px"/>
			</div>
		</template>
		<template v-else-if="log.type === 'updateAbuseReportNote'">
			<div :class="$style.diff">
				<CodeDiff :context="5" :hideHeader="true" :oldString="log.info.before ?? ''" :newString="log.info.after ?? ''" maxHeight="300px"/>
			</div>
		</template>
		<template v-else-if="log.type === 'updateProxyAccountDescription'">
			<div :class="$style.diff">
				<CodeDiff :context="5" :hideHeader="true" :oldString="log.info.before ?? ''" :newString="log.info.after ?? ''" maxHeight="300px"/>
			</div>
		</template>
		<template v-else-if="log.type === 'resolveAgentReview'">
			<div>{{ log.info.kind === 'character' ? i18n.ts._agents.reviewKindCharacter : i18n.ts._agents.reviewKindStyle }} · {{ log.info.name }} <span class="_text">({{ log.info.id }})</span></div>
			<div>{{ i18n.ts.user }}: <MkA :to="`/admin/user/${log.info.ownerUserId}`" class="_link">{{ log.info.ownerUserId }}</MkA></div>
			<div>{{ log.info.decision === 'approve' ? i18n.ts._agents.approveReview : i18n.ts._agents.rejectReview }}</div>
			<div class="_text">{{ log.info.reviewStatus }} · v{{ log.info.publishedVersion ?? '—' }} · isPublished: {{ log.info.isPublished }}</div>
		</template>
		<template v-else-if="log.type === 'setAgentSessionModerationBan'">
			<div>{{ i18n.ts._agents.modlogAgentSessionBanTitle }}: {{ log.info.sessionName }} <span class="_text">[{{ log.info.sessionId }}]</span></div>
			<div>{{ i18n.ts._agents.adminAgentChatAuditIndexUser }}: <MkA :to="`/admin/user/${log.info.userId}`" class="_link">{{ log.info.userId }}</MkA></div>
			<div>{{ i18n.ts._agents.modlogAgentBanState }}: {{ log.info.banned ? i18n.ts._agents.modlogAgentBanOn : i18n.ts._agents.modlogAgentBanOff }} (before: {{ log.info.before ? i18n.ts._agents.modlogAgentBanOn : i18n.ts._agents.modlogAgentBanOff }})</div>
		</template>
		<template v-else-if="log.type === 'setAgentCharacterModerationBan'">
			<div>{{ i18n.ts._agents.modlogAgentCharacterBanTitle }}: {{ log.info.characterName }} <span class="_text">[{{ log.info.characterId }}]</span></div>
			<div>{{ i18n.ts.user }}: <MkA :to="`/admin/user/${log.info.ownerUserId}`" class="_link">{{ log.info.ownerUserId }}</MkA></div>
			<div>{{ i18n.ts._agents.modlogAgentBanState }}: {{ log.info.banned ? i18n.ts._agents.modlogAgentBanOn : i18n.ts._agents.modlogAgentBanOff }} (before: {{ log.info.before ? i18n.ts._agents.modlogAgentBanOn : i18n.ts._agents.modlogAgentBanOff }})</div>
		</template>

		<div :class="$style.auditSummary">
			<div :class="$style.auditTitle">{{ i18n.ts.details }}</div>
			<div :class="$style.auditRows">
				<div v-for="row in auditRows" :key="row.label" :class="$style.auditRow">
					<div class="_text">{{ row.label }}</div>
					<div :class="$style.auditRowValue">
						<MkA v-if="row.href" :to="row.href" class="_link">{{ row.value }}</MkA>
						<span v-else>{{ row.value }}</span>
					</div>
				</div>
			</div>
		</div>

		<div v-if="parsedInfoEntries.length > 0" :class="$style.parsedInfo">
			<div :class="$style.auditTitle">Parsed raw</div>
			<div v-for="entry in parsedInfoEntries" :key="entry.key" :class="$style.parsedItem">
				<div class="_text">{{ entry.label }}</div>
				<div v-if="entry.kind === 'primitive'">{{ entry.value }}</div>
				<div v-else :class="$style.objectViewWrap">
					<MkObjectView :value="entry.value"/>
				</div>
			</div>
		</div>

		<details :class="$style.rawBlock">
			<summary>Raw object</summary>
			<div :class="$style.objectViewWrap">
				<MkObjectView :value="log as unknown as Record<string, unknown>"/>
			</div>
		</details>
	</div>
</MkFolder>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import * as Misskey from 'misskey-js';
import { CodeDiff } from 'v-code-diff';
import JSON5 from 'json5';
import { i18n } from '@/i18n.js';
import MkFolder from '@/components/MkFolder.vue';
import MkObjectView from '@/components/MkObjectView.vue';

const props = defineProps<{
	log: Misskey.entities.ModerationLog;
}>();

type ParsedInfoEntry = {
	key: string;
	label: string;
	kind: 'primitive' | 'object';
	value: unknown;
};

const keyLabelMap: Record<string, string> = {
	userId: i18n.ts.user,
	ownerUserId: i18n.ts.user,
	roleId: i18n.ts.role,
	roleName: i18n.ts.role,
	sessionId: i18n.ts._agents.adminAgentChatAuditIndexSessionId,
	sessionName: i18n.ts._agents.adminAgentChatAuditIndexSessionName,
	characterId: i18n.ts._agents.adminAgentChatAuditCharacterId,
	characterName: i18n.ts._agents.adminAgentChatAuditCharacterName,
	decision: i18n.ts.action,
	kind: i18n.ts.type,
	reviewStatus: i18n.ts.status,
	host: i18n.ts.instance,
};

function formatFieldLabel(key: string): string {
	return keyLabelMap[key] ?? key;
}

function formatFieldValue(value: unknown): string {
	if (value == null) return '—';
	if (typeof value === 'boolean') return value ? 'true' : 'false';
	if (typeof value === 'number') return String(value);
	if (typeof value === 'string') return value;
	return JSON5.stringify(value);
}

const auditRows = computed(() => {
	const rows: Array<{ label: string; value: string; href?: string }> = [
		{
			label: i18n.ts.type,
			value: i18n.ts._moderationLogTypes[props.log.type] ?? props.log.type,
		},
		{
			label: i18n.ts.moderator,
			value: props.log.user?.username ? `@${props.log.user.username}` : props.log.userId,
			href: `/admin/user/${props.log.userId}`,
		},
		{
			label: i18n.ts.dateAndTime,
			value: new Date(props.log.createdAt).toLocaleString(),
		},
	];

	const info = props.log.info as Record<string, unknown>;
	const importantKeys = ['userId', 'ownerUserId', 'host', 'sessionId', 'characterId', 'roleId', 'reviewStatus', 'decision', 'kind', 'banned'];
	for (const key of importantKeys) {
		if (!(key in info)) continue;
		const value = info[key];
		rows.push({
			label: formatFieldLabel(key),
			value: formatFieldValue(value),
			href: key === 'userId' || key === 'ownerUserId' ? `/admin/user/${String(value)}` : undefined,
		});
	}

	return rows;
});

const parsedInfoEntries = computed<ParsedInfoEntry[]>(() => {
	const info = (props.log.info ?? {}) as Record<string, unknown>;

	return Object.entries(info)
		.filter(([key]) => key !== 'before' && key !== 'after')
		.map(([key, value]) => {
			const isObjectValue = typeof value === 'object' && value !== null;
			return {
				key,
				label: formatFieldLabel(key),
				kind: isObjectValue ? 'object' : 'primitive',
				value: isObjectValue ? value : formatFieldValue(value),
			};
		});
});
</script>

<style lang="scss" module>
.diff {
	background: #fff;
	color: #000;
	border-radius: 6px;
	overflow: clip;
}

.logYellow {
	color: var(--MI_THEME-warn);
}

.logRed {
	color: var(--MI_THEME-error);
}

.logGreen {
	color: var(--MI_THEME-success);
}

.auditSummary {
	margin-top: 12px;
	padding: 12px;
	border-radius: 8px;
	background: color-mix(in srgb, var(--MI_THEME-panel) 85%, var(--MI_THEME-accentedBg) 15%);
}

.auditTitle {
	font-weight: 700;
	margin-bottom: 8px;
}

.auditRows {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
	gap: 8px 12px;
}

.auditRow {
	padding: 8px 10px;
	border-radius: 6px;
	background: color-mix(in srgb, var(--MI_THEME-panel) 92%, var(--MI_THEME-fg) 8%);
}

.auditRowValue {
	margin-top: 2px;
	word-break: break-all;
}

.parsedInfo {
	margin-top: 12px;
}

.parsedItem {
	margin-top: 8px;
	padding: 10px;
	border-radius: 8px;
	background: color-mix(in srgb, var(--MI_THEME-panel) 92%, var(--MI_THEME-fg) 8%);
}

.rawBlock {
	margin-top: 12px;
}

.objectViewWrap {
	margin-top: 6px;
	padding: 8px;
	border-radius: 6px;
	background: color-mix(in srgb, var(--MI_THEME-panel) 85%, var(--MI_THEME-fg) 15%);
	overflow: auto;
}
</style>
