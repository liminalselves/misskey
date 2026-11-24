/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { AppReleaseService } from '@/core/AppReleaseService.js';
import { MetaService } from '@/core/MetaService.js';

const releaseAssetSchema = {
	type: 'object',
	optional: false, nullable: false,
	properties: {
		name: {
			type: 'string',
			optional: false, nullable: false,
		},
		size: {
			type: 'number',
			optional: false, nullable: false,
		},
		sha256: {
			type: 'string',
			optional: false, nullable: true,
		},
		downloadUrl: {
			type: 'string',
			optional: false, nullable: true,
		},
		rawDownloadUrl: {
			type: 'string',
			optional: false, nullable: true,
		},
		downloadCount: {
			type: 'number',
			optional: false, nullable: false,
		},
	},
} as const;

const latestPlatformSchema = {
	type: 'object',
	optional: false, nullable: true,
	properties: {
		version: {
			type: 'string',
			optional: false, nullable: false,
		},
		tagName: {
			type: 'string',
			optional: false, nullable: false,
		},
		name: {
			type: 'string',
			optional: false, nullable: false,
		},
		publishedAt: {
			type: 'string',
			optional: false, nullable: true,
		},
		releaseUrl: {
			type: 'string',
			optional: false, nullable: false,
		},
		minVersion: {
			type: 'string',
			optional: false, nullable: true,
		},
		notes: {
			type: 'string',
			optional: false, nullable: false,
		},
		assetName: {
			type: 'string',
			optional: false, nullable: false,
		},
		size: {
			type: 'number',
			optional: false, nullable: false,
		},
		sha256: {
			type: 'string',
			optional: false, nullable: true,
		},
		downloadUrl: {
			type: 'string',
			optional: false, nullable: true,
		},
		rawDownloadUrl: {
			type: 'string',
			optional: false, nullable: true,
		},
		downloadCount: {
			type: 'number',
			optional: false, nullable: false,
		},
	},
} as const;

export const meta = {
	tags: ['meta'],

	requireCredential: false,

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			repo: {
				type: 'string',
				optional: false, nullable: false,
			},
			autoFetchGithub: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			syncedAt: {
				type: 'string',
				optional: false, nullable: true,
			},
			syncError: {
				type: 'string',
				optional: false, nullable: true,
			},
			announcement: {
				type: 'string',
				optional: false, nullable: true,
			},
			minRequiredAppVersion: {
				type: 'string',
				optional: false, nullable: true,
			},
			latest: {
				type: 'object',
				optional: false, nullable: false,
				properties: {
					android: latestPlatformSchema,
					ios: latestPlatformSchema,
				},
			},
			releases: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						version: {
							type: 'string',
							optional: false, nullable: false,
						},
						tagName: {
							type: 'string',
							optional: false, nullable: false,
						},
						name: {
							type: 'string',
							optional: false, nullable: false,
						},
						publishedAt: {
							type: 'string',
							optional: false, nullable: true,
						},
						releaseUrl: {
							type: 'string',
							optional: false, nullable: false,
						},
						minVersion: {
							type: 'string',
							optional: false, nullable: true,
						},
						notes: {
							type: 'string',
							optional: false, nullable: false,
						},
						isLatest: {
							type: 'boolean',
							optional: false, nullable: false,
						},
						assets: {
							type: 'object',
							optional: false, nullable: false,
							properties: {
								android: { ...releaseAssetSchema, optional: true },
								ios: { ...releaseAssetSchema, optional: true },
							},
						},
					},
				},
			},
		},
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
		private metaService: MetaService,
		private appReleaseService: AppReleaseService,
	) {
		super(meta, paramDef, async () => {
			const instance = await this.metaService.fetch();
			return await this.appReleaseService.getPublicReleasesView(instance.nativeClientAppInfo);
		});
	}
}
