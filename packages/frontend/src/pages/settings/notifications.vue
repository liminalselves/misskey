<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<SearchMarker path="/settings/notifications" :label="i18n.ts.notifications" :keywords="['notifications']" icon="ti ti-bell">
	<div class="_gaps_m">
		<MkFeatureBanner icon="/fluent-emoji/1f514.png" color="#ffff00">
			<SearchText>{{ i18n.ts._settings.notificationsBanner }}</SearchText>
		</MkFeatureBanner>

		<FormSection first>
			<template #label>{{ i18n.ts.notificationRecieveConfig }}</template>
			<div class="_gaps_s">
				<!-- App 壳内：私信通知单独控制项（newChatMessage 为 stream 事件，不在 notificationTypes 中） -->
				<MkFolder v-if="isEmbeddedAppShell()">
					<template #label>{{ (i18n.ts._notification._types as Record<string, string>)['newChatMessage'] }}</template>
					<template #suffix>
						{{ chatMessageNotifyConfig?.type === 'never' ? i18n.ts.none : i18n.ts.all }}
					</template>
					<XNotificationConfig
						:userLists="userLists"
						:value="chatMessageNotifyConfig ?? { type: 'all' }"
						:configurableTypes="['all', 'never']"
						@update="(res) => updateReceiveConfig('newChatMessage' as any, res)"
					/>
				</MkFolder>
				<!-- App 壳内：智能体消息通知控制项（newAgentMessage 为 stream 事件，与私信渠道对等） -->
				<MkFolder v-if="isEmbeddedAppShell()">
					<template #label>{{ (i18n.ts._notification._types as Record<string, string>)['newAgentMessage'] }}</template>
					<template #suffix>
						{{ agentMessageNotifyConfig?.type === 'never' ? i18n.ts.none : i18n.ts.all }}
					</template>
					<XNotificationConfig
						:userLists="userLists"
						:value="agentMessageNotifyConfig ?? { type: 'all' }"
						:configurableTypes="['all', 'never']"
						@update="(res) => updateReceiveConfig('newAgentMessage' as any, res)"
					/>
				</MkFolder>
				<MkFolder v-for="type in configurableNotificationTypes" :key="type">
					<template #label>{{ i18n.ts._notification._types[type] }}</template>
					<template #suffix>
						{{
							notificationReceiveFor(type)?.type === 'never' ? i18n.ts.none :
							notificationReceiveFor(type)?.type === 'following' ? i18n.ts.following :
							notificationReceiveFor(type)?.type === 'follower' ? i18n.ts.followers :
							notificationReceiveFor(type)?.type === 'mutualFollow' ? i18n.ts.mutualFollow :
							notificationReceiveFor(type)?.type === 'followingOrFollower' ? i18n.ts.followingOrFollower :
							notificationReceiveFor(type)?.type === 'list' ? i18n.ts.userList :
							i18n.ts.all
						}}
					</template>

					<XNotificationConfig
						:userLists="userLists"
						:value="notificationReceiveFor(type) ?? { type: 'all' }"
						:configurableTypes="(onlyOnOrOffNotificationTypes as string[]).includes(type) ? ['all', 'never'] : undefined"
						@update="(res) => updateReceiveConfig(type, res)"
					/>
				</MkFolder>
			</div>
		</FormSection>

		<FormSection>
			<SearchMarker
				:keywords="['notify', 'hide', 'user']"
			>
				<MkFolder>
					<template #label><SearchLabel>{{ i18n.ts.notifyUsers }}</SearchLabel></template>
					<MkPagination v-slot="{items}" :paginator="notifyUserPaginator" withControl>
						<div class="_gaps_s">
							<div v-for="item in items" :key="item.id">
								<div :class="$style.userItemMain">
									<MkA :class="$style.userItemMainBody" :to="userPage(item.followee!)">
										<MkUserCardMini :user="item.followee!"/>
									</MkA>
									<button class="_button" :class="$style.notifyMenu" @click="showNotifyMenu(item.followee!, $event)"><i class="ti ti-dots"></i></button>
								</div>
							</div>
						</div>
					</MkPagination>
				</MkFolder>
			</SearchMarker>
		</FormSection>
		<FormSection>
			<div class="_gaps_m">
				<FormLink to="/settings/sounds">{{ i18n.ts.notificationSoundSettings }}</FormLink>
			</div>
		</FormSection>
		<FormSection>
			<div class="_gaps_s">
				<MkButton @click="readAllNotifications">{{ i18n.ts.markAsReadAllNotifications }}</MkButton>
				<MkButton @click="testNotification">{{ i18n.ts._notification.sendTestNotification }}</MkButton>
				<MkButton @click="flushNotification">{{ i18n.ts._notification.flushNotification }}</MkButton>
			</div>
		</FormSection>

		<FormSection>
			<template #label>{{ i18n.ts.pushNotification }}</template>

			<div class="_gaps_m">
					<MkPushNotificationAllowButton ref="allowButton"/>

				<MkSwitch
					v-if="!isEmbeddedAppShell()"
					:disabled="!pushRegistrationInServer"
					:modelValue="sendReadMessage"
					@update:modelValue="onChangeSendReadMessage"
				>
					<template #label>{{ i18n.ts.sendPushNotificationReadMessage }}</template>
					<template #caption>{{ i18n.ts.sendPushNotificationReadMessageCaption }}</template>
				</MkSwitch>
			</div>
		</FormSection>
	</div>
</SearchMarker>
</template>

<script lang="ts" setup>
import { useTemplateRef, computed, ref, markRaw } from 'vue';
import { notificationTypes } from 'misskey-js';
import * as Misskey from 'misskey-js';
import XNotificationConfig from './notifications.notification-config.vue';
import type { NotificationConfig } from './notifications.notification-config.vue';
import { isEmbeddedAppShell } from '@/utility/is-embedded-app-shell.js';
import FormLink from '@/components/form/link.vue';
import FormSection from '@/components/form/section.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkButton from '@/components/MkButton.vue';
import * as os from '@/os.js';
import { ensureSignin } from '@/i.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import MkPushNotificationAllowButton from '@/components/MkPushNotificationAllowButton.vue';
import MkFeatureBanner from '@/components/MkFeatureBanner.vue';
import { Paginator } from '@/utility/paginator.js';
import MkPagination from '@/components/MkPagination.vue';
import { userPage } from '@/filters/user.js';
import MkUserCardMini from '@/components/MkUserCardMini.vue';

const $i = ensureSignin();

function notificationReceiveFor(type: typeof notificationTypes[number]): NotificationConfig | undefined {
	return ($i.notificationRecieveConfig as Record<string, NotificationConfig | undefined>)[type];
}

const chatMessageNotifyConfig = computed(() =>
	($i.notificationRecieveConfig as Record<string, NotificationConfig | undefined> | undefined)?.['newChatMessage'],
);

const agentMessageNotifyConfig = computed(() =>
	($i.notificationRecieveConfig as Record<string, NotificationConfig | undefined> | undefined)?.['newAgentMessage'],
);

// agentProactiveMessage 已废弃（智能体消息改走 newAgentMessage 消息渠道），保留类型仅为历史通知兼容渲染，不再可配置
const nonConfigurableNotificationTypes = ['note', 'roleAssigned', 'followRequestAccepted', 'test', 'exportCompleted', 'agentProactiveMessage'] as const satisfies (typeof notificationTypes[number])[];

async function showNotifyMenu(user: Misskey.entities.UserDetailed, ev: PointerEvent) {
	os.popupMenu([{
		text: (user.notify === 'normal') ? i18n.ts.unnotifyNotes : i18n.ts.notifyNotes,
		icon: (user.notify === 'normal') ? 'ti ti-x' : 'ti ti-plus',
		action: async () => {
			await os.apiWithDialog('following/update', {
				userId: user.id,
				notify: user.notify === 'normal' ? 'none' : 'normal',
			}).then(() => {
				user.notify = user.notify === 'normal' ? 'none' : 'normal';
			});
		},
	}], ev.currentTarget ?? ev.target);
}

const notifyUserPaginator = markRaw(new Paginator('following/list', {
	limit: 10,
	params: {
		notification: true,
	},
}));

const configurableNotificationTypes = notificationTypes.filter(type => !nonConfigurableNotificationTypes.includes(type as any)) as Exclude<typeof notificationTypes[number], typeof nonConfigurableNotificationTypes[number]>[];

const onlyOnOrOffNotificationTypes = ['app', 'achievementEarned', 'login', 'createToken', 'scheduledNotePosted', 'scheduledNotePostFailed'] as const satisfies (typeof notificationTypes[number])[];

const allowButton = useTemplateRef('allowButton');
const pushRegistrationInServer = computed(() => allowButton.value?.pushRegistrationInServer);
const sendReadMessage = computed(() => pushRegistrationInServer.value?.sendReadMessage || false);
const userLists = await misskeyApi('users/lists/list');

async function readAllNotifications() {
	await os.apiWithDialog('notifications/mark-all-as-read', {});
}

async function updateReceiveConfig(type: typeof notificationTypes[number], value: NotificationConfig) {
	await os.apiWithDialog('i/update', {
		notificationRecieveConfig: {
			...$i.notificationRecieveConfig,
			[type]: value,
		},
	}).then(i => {
		const updated = i as { notificationRecieveConfig?: typeof $i.notificationRecieveConfig } | null | undefined;
		if (updated?.notificationRecieveConfig) {
			$i.notificationRecieveConfig = updated.notificationRecieveConfig;
		}
	});
}

function onChangeSendReadMessage(v: boolean) {
	if (!pushRegistrationInServer.value) return;

	os.apiWithDialog('sw/update-registration', {
		endpoint: pushRegistrationInServer.value.endpoint,
		sendReadMessage: v,
	}).then(res => {
		if (!allowButton.value)	return;
		const updated = res as { state?: string; key?: string; userId: string; endpoint: string; sendReadMessage: boolean } | null | undefined;
		if (updated) {
			allowButton.value.pushRegistrationInServer = updated;
		}
	});
}

function testNotification(): void {
	misskeyApi('notifications/test-notification');
}

async function flushNotification() {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.ts.resetAreYouSure,
	});

	if (canceled) return;

	os.apiWithDialog('notifications/flush', {});
}

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.notifications,
	icon: 'ti ti-bell',
}));
</script>

<style lang="scss" module>
.userItemMain {
	display: flex;
}

.userItemMainBody {
	flex: 1;
	min-width: 0;
	margin-right: 8px;

	&:hover {
		text-decoration: none;
	}
}

.notifyMenu {
	width: 32px;
	height: 32px;
	align-self: center;
}
</style>
