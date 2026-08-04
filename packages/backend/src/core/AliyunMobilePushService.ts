/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import RPCClient from '@alicloud/pop-core';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import type { MiMeta } from '@/models/Meta.js';
import type { Packed } from '@/misc/json-schema.js';
import type { MobilePushDevicesRepository } from '@/models/_.js';
import { bindThis } from '@/decorators.js';
import { LoggerService } from '@/core/LoggerService.js';
import type Logger from '@/logger.js';
import { CacheService } from '@/core/CacheService.js';
import {
	buildNativePushFromAntennaNote,
	buildNativePushFromAgentMessage,
	buildNativePushFromChatMessage,
	buildNativePushFromNotification,
	joinInstanceUrl,
} from '@/misc/native-push-bridge-content.js';
import type { MainEventTypes } from '@/core/GlobalEventService.js';

/** 与 PushNotificationService / sw 侧类型对齐 */
type PushNotificationsTypes = {
	'notification': Packed<'Notification'>;
	'unreadAntennaNote': {
		antenna: { id: string, name: string };
		note: Packed<'Note'>;
	};
	'readAllNotifications': undefined;
	newChatMessage: Packed<'ChatMessage'>;
	newAgentMessage: MainEventTypes['newAgentMessage'];
};

@Injectable()
export class AliyunMobilePushService {
	private readonly logger: Logger;

	constructor(
		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.config)
		private config: Config,

		@Inject(DI.mobilePushDevicesRepository)
		private mobilePushDevicesRepository: MobilePushDevicesRepository,

		private cacheService: CacheService,

		loggerService: LoggerService,
	) {
		this.logger = loggerService.getLogger('AliyunMobilePush');
	}

	private createClient(): InstanceType<typeof RPCClient> | null {
		const id = this.meta.aliyunMobilePushAccessKeyId;
		const secret = this.meta.aliyunMobilePushAccessKeySecret;
		const appKey = this.meta.aliyunMobilePushAppKey;
		if (!id || !secret || !appKey) return null;
		return new RPCClient({
			accessKeyId: id,
			accessKeySecret: secret,
			endpoint: 'https://cloudpush.aliyuncs.com',
			apiVersion: '2016-08-01',
		});
	}

	@bindThis
	public async deliver<T extends keyof PushNotificationsTypes>(userId: string, type: T, body: PushNotificationsTypes[T]): Promise<void> {
		if (this.meta.enableAliyunMobilePush === false) {
			this.logger.debug(`deliver skipped: enableAliyunMobilePush is off (userId=${userId} type=${String(type)})`);
			return;
		}
		const client = this.createClient();
		if (!client) {
			const id = this.meta.aliyunMobilePushAccessKeyId;
			const secret = this.meta.aliyunMobilePushAccessKeySecret;
			const appKey = this.meta.aliyunMobilePushAppKey;
			this.logger.info(
				`deliver skipped: admin meta incomplete (hasAccessKeyId=${!!id} hasAccessKeySecret=${!!secret} hasAppKey=${!!appKey}) — fill 控制面板 → 阿里云移动推送`,
			);
			return;
		}
		if (type === 'readAllNotifications') {
			this.logger.debug(`deliver skipped: type=${type}`);
			return;
		}

		const msg = await this.composeMessage(userId, type, body);
		if (msg == null) {
			this.logger.info(`deliver skipped: no composed message for type=${String(type)} userId=${userId}`);
			return;
		}

		const devices = await this.mobilePushDevicesRepository.findBy({ userId });
		if (devices.length === 0) {
			this.logger.info(`deliver skipped: no mobile_push_device for userId=${userId}`);
			return;
		}

		const appKey = this.meta.aliyunMobilePushAppKey!;

		for (const d of devices) {
			const deviceType = d.platform === 'ios' ? 'iOS' : 'ANDROID';
			this.logger.info(
				`Push -> Aliyun API: userId=${userId} type=${String(type)} platform=${d.platform} deviceId=${d.deviceId} titleLen=${msg.title.length}`,
			);
			try {
				const ext = JSON.stringify({ openUrl: msg.openUrl });
				const common: Record<string, unknown> = {
					AppKey: appKey,
					Target: 'DEVICE',
					TargetValue: d.deviceId,
					DeviceType: deviceType,
					PushType: 'NOTICE',
					Title: msg.title.slice(0, 128),
					Body: msg.body.slice(0, 500),
				};
				if (deviceType === 'ANDROID') {
					Object.assign(common, {
						AndroidOpenType: 'ACTIVITY',
						AndroidActivity: 'top.liminalselves.app.NativeWebViewActivity',
						AndroidExtParameters: ext,
						AndroidNotificationChannel: 'misskey_push',
					});
				} else {
					Object.assign(common, {
						iOSExtParameters: ext,
					});
				}
				await client.request('Push', common, { method: 'POST' });
				this.logger.succ(`Push OK (Aliyun accepted): deviceId=${d.deviceId}`);
			} catch (err) {
				this.logger.error('Push failed (Aliyun API error)', {
					deviceId: d.deviceId,
					e: err instanceof Error ? err : new Error(String(err)),
				});
			}
		}
	}

	private async composeMessage<T extends keyof PushNotificationsTypes>(userId: string, type: T, body: PushNotificationsTypes[T]): Promise<{ title: string; body: string; openUrl: string } | null> {
		let lang: string | null | undefined;
		try {
			const profile = await this.cacheService.userProfileCache.fetch(userId);
			lang = profile.lang;
		} catch {
			lang = null;
		}
		const origin = this.config.url;

		switch (type) {
			case 'notification': {
				const p = buildNativePushFromNotification(body as Packed<'Notification'>, lang);
				return { title: p.title, body: p.body, openUrl: joinInstanceUrl(origin, p.openPath) };
			}
			case 'newChatMessage': {
				const p = buildNativePushFromChatMessage(body as Packed<'ChatMessage'>, lang);
				return { title: p.title, body: p.body, openUrl: joinInstanceUrl(origin, p.openPath) };
			}
			case 'newAgentMessage': {
				const p = buildNativePushFromAgentMessage(body as PushNotificationsTypes['newAgentMessage'], lang);
				return { title: p.title, body: p.body, openUrl: joinInstanceUrl(origin, p.openPath) };
			}
			case 'unreadAntennaNote': {
				const u = body as PushNotificationsTypes['unreadAntennaNote'];
				const p = buildNativePushFromAntennaNote(u, lang);
				return { title: p.title, body: p.body, openUrl: joinInstanceUrl(origin, p.openPath) };
			}
			default:
				return null;
		}
	}
}
