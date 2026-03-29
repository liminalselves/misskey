/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import RPCClient from '@alicloud/pop-core';
import { DI } from '@/di-symbols.js';
import type { MiMeta } from '@/models/Meta.js';
import type { Packed } from '@/misc/json-schema.js';
import { getNoteSummary } from '@/misc/get-note-summary.js';
import type { MobilePushDevicesRepository } from '@/models/_.js';
import { bindThis } from '@/decorators.js';
import { LoggerService } from '@/core/LoggerService.js';
import type Logger from '@/logger.js';

/** 与 PushNotificationService / sw 侧类型对齐 */
type PushNotificationsTypes = {
	'notification': Packed<'Notification'>;
	'unreadAntennaNote': {
		antenna: { id: string, name: string };
		note: Packed<'Note'>;
	};
	'readAllNotifications': undefined;
	newChatMessage: Packed<'ChatMessage'>;
};

@Injectable()
export class AliyunMobilePushService {
	private readonly logger: Logger;

	constructor(
		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.mobilePushDevicesRepository)
		private mobilePushDevicesRepository: MobilePushDevicesRepository,

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

		const msg = this.composeMessage(type, body);
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
				await client.request('Push', {
					AppKey: appKey,
					Target: 'DEVICE',
					TargetValue: d.deviceId,
					DeviceType: deviceType,
					PushType: 'NOTICE',
					Title: msg.title.slice(0, 128),
					Body: msg.body.slice(0, 500),
				}, { method: 'POST' });
				this.logger.succ(`Push OK (Aliyun accepted): deviceId=${d.deviceId}`);
			} catch (err) {
				this.logger.error('Push failed (Aliyun API error)', {
					deviceId: d.deviceId,
					e: err instanceof Error ? err : new Error(String(err)),
				});
			}
		}
	}

	private composeMessage<T extends keyof PushNotificationsTypes>(type: T, body: PushNotificationsTypes[T]): { title: string; body: string } | null {
		switch (type) {
			case 'notification': {
				const n = body as Packed<'Notification'>;
				let text = n.type;
				if ('note' in n && n.note) {
					text = getNoteSummary(('type' in n && n.type === 'renote') ? n.note.renote as Packed<'Note'> : n.note);
				} else if ('user' in n && n.user) {
					text = `${n.user.name ?? n.user.username}`;
				}
				return { title: 'Misskey', body: text };
			}
			case 'newChatMessage': {
				const m = body as Packed<'ChatMessage'>;
				return {
					title: m.fromUser?.name ?? m.fromUser?.username ?? 'Chat',
					body: m.text ?? '',
				};
			}
			case 'unreadAntennaNote': {
				const u = body as PushNotificationsTypes['unreadAntennaNote'];
				const bodyText = u.note ? getNoteSummary(u.note) : '';
				return {
					title: `Antenna: ${u.antenna.name}`,
					body: bodyText,
				};
			}
			default:
				return null;
		}
	}
}
