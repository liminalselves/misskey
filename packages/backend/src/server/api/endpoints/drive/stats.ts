/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
import { RoleService } from '@/core/RoleService.js';

export const meta = {
	tags: ['drive'],

	requireCredential: true,

	kind: 'read:drive',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			usage: { type: 'number' },
			capacity: { type: 'number' },
			usagePercent: { type: 'number' },
			agentImageUsage: { type: 'number' },
			agentImageCapacity: { type: 'number' },
			agentImageUsagePercent: { type: 'number' },
			agentImageCleanupThreshold: { type: 'number' },
			agentImageCleanupTarget: { type: 'number' },
		},
		required: ['usage', 'capacity', 'usagePercent', 'agentImageUsage', 'agentImageCapacity', 'agentImageUsagePercent', 'agentImageCleanupThreshold', 'agentImageCleanupTarget'],
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private driveFileEntityService: DriveFileEntityService,
		private roleService: RoleService,
	) {
		super(meta, paramDef, async (_ps, me) => {
			const [usage, policies] = await Promise.all([
				this.driveFileEntityService.calcDriveUsageOf(me.id),
				this.roleService.getUserPolicies(me.id),
			]);
			const agentImageUsage = await this.driveFileEntityService.calcAgentImageDriveUsageOf(me.id);
			const capacity = Math.max(0, policies.driveCapacityMb * 1024 * 1024);
			const agentImageCapacity = Math.max(0, policies.agentImageDriveCapacityMb * 1024 * 1024);

			return {
				usage,
				capacity,
				usagePercent: capacity > 0 ? Math.min(100, Math.round((usage / capacity) * 1000) / 10) : 0,
				agentImageUsage,
				agentImageCapacity,
				agentImageUsagePercent: agentImageCapacity > 0 ? Math.min(100, Math.round((agentImageUsage / agentImageCapacity) * 1000) / 10) : 0,
				agentImageCleanupThreshold: Math.max(0, policies.agentImageDriveCleanupThresholdMb * 1024 * 1024),
				agentImageCleanupTarget: Math.max(0, policies.agentImageDriveCleanupTargetMb * 1024 * 1024),
			};
		});
	}
}
