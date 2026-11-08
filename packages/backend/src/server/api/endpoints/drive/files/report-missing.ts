/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DriveMissingObjectService } from '@/core/DriveMissingObjectService.js';

export const meta = {
	tags: ['drive'],

	// 头像、帖子图片也会被访客看到，所以不要求登录；
	// 这里只负责触发核查，是否修复完全由服务端独立验证对象存储，不信任调用方
	requireCredential: false,

	description: 'Report that a media URL failed to load. The server verifies it against the object storage on its own.',

	limit: {
		duration: ms('1minute'),
		max: 30,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		url: { type: 'string', maxLength: 2048 },
	},
	required: ['url'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private driveMissingObjectService: DriveMissingObjectService,
	) {
		super(meta, paramDef, async (ps) => {
			// 不等待核查结果，也不向调用方透露判定细节
			void this.driveMissingObjectService.checkByReportedUrl(ps.url);
		});
	}
}
