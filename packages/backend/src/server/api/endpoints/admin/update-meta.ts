/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable, Inject } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { MiMeta, MiNativeClientAppInfo } from '@/models/Meta.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { MetaService } from '@/core/MetaService.js';
import { ApiError } from '@/server/api/error.js';
import { assertSafeLlmHttpsUrl, describeUnsafeLlmUrlReason, hrefForStoredLlmBaseUrl, UnsafeLlmUrlError } from '@/misc/validate-llm-endpoint-url.js';
import { getActiveLlmModels, normalizeAgentLlmModelGroupsParam, normalizeAgentLlmModelsParam } from '@/misc/agent-llm-models.js';
import { normalizeAgentByokProvidersParam } from '@/core/AgentUserModelService.js';
import { AgentCompressionMemoryService } from '@/core/AgentCompressionMemoryService.js';

function normalizeObjectStorageConfigValue(value: string | null | undefined): string | null {
	const trimmed = value?.trim();
	return trimmed == null || trimmed === '' ? null : trimmed;
}

function coerceHttpObjectStorageUrlToHttps(url: string | null | undefined, force: boolean): string | null {
	url = normalizeObjectStorageConfigValue(url);
	if (url == null) return null;
	if (!force) return url;
	if (url.startsWith('http://')) return `https://${url.slice(7)}`;
	return url;
}

/** Avoid non-JSON-safe / relation fields when persisting meta snapshots to moderation_log. */
function metaEntityForModerationLog(meta: MiMeta): Record<string, unknown> {
	const plain = { ...meta } as Record<string, unknown>;
	delete plain.rootUser;
	return JSON.parse(JSON.stringify(plain)) as Record<string, unknown>;
}

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireAdmin: true,
	kind: 'write:admin:meta',
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		disableRegistration: { type: 'boolean', nullable: true },
		pinnedUsers: {
			type: 'array', nullable: true, items: {
				type: 'string',
			},
		},
		hiddenTags: {
			type: 'array', nullable: true, items: {
				type: 'string',
			},
		},
		blockedHosts: {
			type: 'array', nullable: true, items: {
				type: 'string',
			},
		},
		sensitiveWords: {
			type: 'array', nullable: true, items: {
				type: 'string',
			},
		},
		prohibitedWords: {
			type: 'array', nullable: true, items: {
				type: 'string',
			},
		},
		prohibitedWordsForNameOfUser: {
			type: 'array', nullable: true, items: {
				type: 'string',
			},
		},
		themeColor: { type: 'string', nullable: true, pattern: '^#[0-9a-fA-F]{6}$' },
		mascotImageUrl: { type: 'string', nullable: true },
		bannerUrl: { type: 'string', nullable: true },
		serverErrorImageUrl: { type: 'string', nullable: true },
		infoImageUrl: { type: 'string', nullable: true },
		notFoundImageUrl: { type: 'string', nullable: true },
		iconUrl: { type: 'string', nullable: true },
		app192IconUrl: { type: 'string', nullable: true },
		app512IconUrl: { type: 'string', nullable: true },
		backgroundImageUrl: { type: 'string', nullable: true },
		logoImageUrl: { type: 'string', nullable: true },
		name: { type: 'string', nullable: true },
		shortName: { type: 'string', nullable: true },
		description: { type: 'string', nullable: true },
		defaultLightTheme: { type: 'string', nullable: true },
		defaultDarkTheme: { type: 'string', nullable: true },
		clientOptions: {
			type: 'object', nullable: false,
			properties: {
				entrancePageStyle: { type: 'string', nullable: false, enum: ['classic', 'simple'] },
				showTimelineForVisitor: { type: 'boolean', nullable: false },
				showActivitiesForVisitor: { type: 'boolean', nullable: false },
			},
		},
		cacheRemoteFiles: { type: 'boolean' },
		cacheRemoteSensitiveFiles: { type: 'boolean' },
		emailRequiredForSignup: { type: 'boolean' },
		enableHcaptcha: { type: 'boolean' },
		hcaptchaSiteKey: { type: 'string', nullable: true },
		hcaptchaSecretKey: { type: 'string', nullable: true },
		enableMcaptcha: { type: 'boolean' },
		mcaptchaSiteKey: { type: 'string', nullable: true },
		mcaptchaInstanceUrl: { type: 'string', nullable: true },
		mcaptchaSecretKey: { type: 'string', nullable: true },
		enableRecaptcha: { type: 'boolean' },
		recaptchaSiteKey: { type: 'string', nullable: true },
		recaptchaSecretKey: { type: 'string', nullable: true },
		enableTurnstile: { type: 'boolean' },
		turnstileSiteKey: { type: 'string', nullable: true },
		turnstileSecretKey: { type: 'string', nullable: true },
		enableAliyunCaptcha: { type: 'boolean' },
		aliyunCaptchaPrefix: { type: 'string', nullable: true },
		aliyunCaptchaSceneId: { type: 'string', nullable: true },
		aliyunCaptchaRegion: { type: 'string', nullable: true },
		aliyunCaptchaAccessKeyId: { type: 'string', nullable: true },
		aliyunCaptchaAccessKeySecret: { type: 'string', nullable: true },
		enableTestcaptcha: { type: 'boolean' },
		googleAnalyticsMeasurementId: { type: 'string', nullable: true },
		sensitiveMediaDetection: { type: 'string', enum: ['none', 'all', 'local', 'remote'] },
		sensitiveMediaDetectionSensitivity: { type: 'string', enum: ['medium', 'low', 'high', 'veryLow', 'veryHigh'] },
		setSensitiveFlagAutomatically: { type: 'boolean' },
		enableSensitiveMediaDetectionForVideos: { type: 'boolean' },
		maintainerName: { type: 'string', nullable: true },
		maintainerEmail: { type: 'string', nullable: true },
		langs: {
			type: 'array', items: {
				type: 'string',
			},
		},
		deeplAuthKey: { type: 'string', nullable: true },
		deeplIsPro: { type: 'boolean' },
		enableEmail: { type: 'boolean' },
		email: { type: 'string', nullable: true },
		smtpSecure: { type: 'boolean' },
		smtpHost: { type: 'string', nullable: true },
		smtpPort: { type: 'integer', nullable: true },
		smtpUser: { type: 'string', nullable: true },
		smtpPass: { type: 'string', nullable: true },
		enableServiceWorker: { type: 'boolean' },
		swPublicKey: { type: 'string', nullable: true },
		swPrivateKey: { type: 'string', nullable: true },
		aliyunMobilePushAccessKeyId: { type: 'string', nullable: true },
		aliyunMobilePushAccessKeySecret: { type: 'string', nullable: true },
		aliyunMobilePushAppKey: { type: 'string', nullable: true },
		enableAliyunMobilePush: { type: 'boolean' },
		agentFeatureEnabled: { type: 'boolean' },
		agentGlobalSystemPrompt: { type: 'string', nullable: true },
		agentOpenaiCompatibleBaseUrl: { type: 'string', nullable: true },
		agentOpenaiCompatibleApiKey: { type: 'string', nullable: true },
		agentModelDisplayName: { type: 'string', nullable: true },
		agentModelDescription: { type: 'string', nullable: true },
		agentModelApiName: { type: 'string', nullable: true },
		agentLlmModels: {
			type: 'array',
			nullable: true,
			items: {
				type: 'object',
				properties: {
					id: { type: 'string', minLength: 1, maxLength: 64 },
					name: { type: 'string', minLength: 1, maxLength: 256 },
					description: { type: 'string', nullable: true, maxLength: 2048 },
					apiModelName: { type: 'string', minLength: 1, maxLength: 256 },
					baseUrl: { type: 'string', minLength: 1, maxLength: 512 },
					apiKey: { type: 'string', minLength: 1, maxLength: 8192 },
					maxContextTokens: { type: 'integer', minimum: 256, maximum: 2000000 },
					maxOutputTokensPerCall: { type: 'integer', minimum: 1, maximum: 128000 },
					unlisted: { type: 'boolean' },
					groupId: { type: 'string', nullable: true, maxLength: 64 },
					costPerCall: { type: 'number', minimum: 0, maximum: 1000000 },
				},
				required: ['id', 'name', 'apiModelName', 'baseUrl', 'apiKey', 'maxContextTokens', 'maxOutputTokensPerCall'],
			},
		},
		agentLlmModelGroups: {
			type: 'array',
			nullable: true,
			items: {
				type: 'object',
				properties: {
					id: { type: 'string', minLength: 1, maxLength: 64 },
					name: { type: 'string', minLength: 1, maxLength: 64 },
				},
				required: ['id', 'name'],
			},
		},
		agentDefaultModelId: { type: 'string', nullable: true, maxLength: 64 },
		agentByokEnabled: { type: 'boolean' },
		agentByokProviders: {
			type: 'array',
			nullable: true,
			items: {
				type: 'object',
				properties: {
					id: { type: 'string', maxLength: 64 },
					name: { type: 'string', minLength: 1, maxLength: 256 },
					description: { type: 'string', nullable: true, maxLength: 2048 },
					baseUrl: { type: 'string', minLength: 1, maxLength: 512 },
					apiModelName: { type: 'string', nullable: true, maxLength: 256 },
					maxContextTokens: { type: 'integer', minimum: 256, maximum: 2000000 },
					maxOutputTokensPerCall: { type: 'integer', minimum: 1, maximum: 128000 },
					tokenizerEncoding: { type: 'string', nullable: true, maxLength: 64 },
					charsPerToken: { type: 'integer', minimum: 1, maximum: 10 },
				},
			},
		},
		agentByokMaxUserModels: { type: 'integer', minimum: 1, maximum: 500 },
		agentMaxContextTokens: { type: 'integer', minimum: 256, maximum: 2000000 },
		agentMaxOutputTokensPerCall: { type: 'integer', minimum: 1, maximum: 128000 },
		agentMem0Enabled: { type: 'boolean' },
		agentMem0ApiKey: { type: 'string', nullable: true },
		agentMem0ApiBaseUrl: { type: 'string', nullable: true, maxLength: 512 },
		agentMem0OrgId: { type: 'string', nullable: true, maxLength: 128 },
		agentMem0ProjectId: { type: 'string', nullable: true, maxLength: 128 },
		agentMem0TopK: { type: 'integer', minimum: 1, maximum: 100 },
		agentMem0InjectMaxChars: { type: 'integer', minimum: 200, maximum: 50000 },
		agentMem0AddMemoryMaxRounds: { type: 'integer', minimum: 1, maximum: 24 },
		agentMem0AddMemoryEveryNRounds: { type: 'integer', minimum: 1, maximum: 48 },
		agentCompressionSystemPrompt: { type: 'string', nullable: true, maxLength: 20000 },
		agentCompressionMaxInputChars: { type: 'integer', minimum: 500, maximum: 200000 },
		agentCompressionMaxOutputTokens: { type: 'integer', minimum: 1, maximum: 32000 },
		/** 0.01–0.99 或 null 清空回默认 0.8/0.9 */
		agentCompressionBandT1Ratio: { type: 'number', nullable: true, minimum: 0.01, maximum: 0.99 },
		agentCompressionBandT2Ratio: { type: 'number', nullable: true, minimum: 0.01, maximum: 0.99 },
		agentCompressionDefaultModelId: { type: 'string', nullable: true, maxLength: 64 },
		agentImageGenerationEnabled: { type: 'boolean' },
		agentImageBaseUrl: { type: 'string', maxLength: 512 },
		agentImageTokens: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					id: { type: 'string', maxLength: 64 },
					token: { type: 'string', minLength: 1, maxLength: 8192 },
					name: { type: 'string', nullable: true, maxLength: 256 },
					enabled: { type: 'boolean' },
					sortOrder: { type: 'integer' },
					points: { type: 'number', nullable: true },
					lastUsedAt: { type: 'string', nullable: true },
					lastCheckedAt: { type: 'string', nullable: true },
					lastError: { type: 'string', nullable: true },
				},
				required: ['token'],
			},
		},
		agentImageModels: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					id: { type: 'string', minLength: 1, maxLength: 128 },
					name: { type: 'string', minLength: 1, maxLength: 256 },
					description: { type: 'string', nullable: true, maxLength: 2048 },
					provider: { type: 'string', enum: ['aurora', 'openai', 'qwen'] },
					enabled: { type: 'boolean' },
					apiModelName: { type: 'string', nullable: true, maxLength: 128 },
					apiUrl: { type: 'string', nullable: true, maxLength: 2048 },
					apiKey: { type: 'string', nullable: true, maxLength: 8192 },
					supportsReferenceImage: { type: 'boolean' },
					costPerCall: { type: 'number', nullable: true, minimum: 0, maximum: 1000000 },
					dailyFreeQuota: { type: 'number', nullable: true, minimum: 0, maximum: 100000 },
					defaultParams: { type: 'object', nullable: true, additionalProperties: true },
					defaultArtistPresetId: { type: 'string', nullable: true, maxLength: 128 },
				},
				required: ['id', 'name', 'provider'],
			},
		},
		agentVisionModels: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					id: { type: 'string', minLength: 1, maxLength: 128 },
					name: { type: 'string', minLength: 1, maxLength: 256 },
					enabled: { type: 'boolean' },
					apiUrl: { type: 'string', minLength: 1, maxLength: 2048 },
					apiKey: { type: 'string', minLength: 1, maxLength: 8192 },
					apiModelName: { type: 'string', minLength: 1, maxLength: 256 },
					costPerCall: { type: 'number', nullable: true, minimum: 0, maximum: 1000000 },
				},
				required: ['id', 'name', 'apiUrl', 'apiKey', 'apiModelName'],
			},
		},
		agentVisionDefaultModelId: { type: 'string', nullable: true, maxLength: 128 },
		agentImageArtistPresets: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					id: { type: 'string', minLength: 1, maxLength: 128 },
					name: { type: 'string', minLength: 1, maxLength: 256 },
					promptPrefix: { type: 'string', nullable: true, maxLength: 20000 },
					promptSuffix: { type: 'string', nullable: true, maxLength: 20000 },
					negativePrompt: { type: 'string', nullable: true, maxLength: 20000 },
					thumbnailUrl: { type: 'string', nullable: true, maxLength: 2048 },
				},
				required: ['id', 'name'],
			},
		},
		agentImageDefaultModel: { type: 'string', maxLength: 128 },
		agentImageDefaultParams: {
			type: 'object',
			nullable: false,
			additionalProperties: true,
		},
		agentImageDefaultNegativePrompt: { type: 'string', nullable: true, maxLength: 20000 },
		agentImageMaxPerReply: { type: 'integer', minimum: 0, maximum: 12 },
		agentImageCostPerCall: { type: 'number', minimum: 0, maximum: 1000000 },
		agentImageDefaultArtistPresetId: { type: 'string', nullable: true, maxLength: 128 },
		agentImageTokenMinPoints: { type: 'integer', minimum: 0, maximum: 1000000 },
		agentImageTokenBalanceTtlSeconds: { type: 'integer', minimum: 0, maximum: 86400 },
		agentExternalAuditEnabled: { type: 'boolean' },
		agentExternalAuditModels: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					id: { type: 'string', minLength: 1, maxLength: 64 },
					name: { type: 'string', minLength: 1, maxLength: 256 },
					apiModelName: { type: 'string', minLength: 1, maxLength: 256 },
					baseUrl: { type: 'string', minLength: 1, maxLength: 512 },
					apiKey: { type: 'string', minLength: 1, maxLength: 8192 },
					priority: { type: 'integer', minimum: -1000000, maximum: 1000000 },
					enabled: { type: 'boolean' },
					autoDisabledAt: { type: 'string', nullable: true, maxLength: 64 },
					autoDisabledReason: { type: 'string', nullable: true, maxLength: 1024 },
					lastError: { type: 'string', nullable: true, maxLength: 1024 },
				},
				required: ['id', 'name', 'apiModelName', 'baseUrl', 'apiKey', 'priority'],
			},
		},
		agentExternalAuditTimeoutMs: { type: 'integer', minimum: 1000, maximum: 120000 },
		agentExternalAuditFailureThresholdPercent: { type: 'integer', minimum: 1, maximum: 100 },
		agentExternalAuditFailureMinRequests: { type: 'integer', minimum: 1, maximum: 100000 },
		agentExternalAuditNotifyEmails: { type: 'string', nullable: true, maxLength: 4000 },
		agentExternalAuditSystemPrompt: { type: 'string', nullable: true, maxLength: 20000 },
		agentReviewTriggerRules: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					id: { type: 'string', minLength: 1, maxLength: 64 },
					timeWindowMinutes: { type: 'integer', minimum: 1, maximum: 10080 },
					blockThreshold: { type: 'integer', minimum: 1, maximum: 1000 },
					enabled: { type: 'boolean' },
				},
				required: ['id', 'timeWindowMinutes', 'blockThreshold', 'enabled'],
			},
		},
		agentCheckinSettings: { type: 'object', nullable: true, additionalProperties: true },
		agentRedeemPurchaseUrl: { type: 'string', nullable: true, maxLength: 1024 },
		agentAliyaCharacterId: { type: 'string', nullable: true, maxLength: 256 },
		agentAliyaWebUrl: { type: 'string', nullable: true, maxLength: 1024 },
		agentProactiveRandomDefaultEnabled: { type: 'boolean' },
		agentProactiveScheduledDefaultEnabled: { type: 'boolean' },
		agentProactiveMinSilenceMinutes: { type: 'integer', minimum: 5, maximum: 1440 },
		agentProactiveMaxWindowMinutes: { type: 'integer', minimum: 30, maximum: 10080 },
		agentProactiveDaytimeWeight: { type: 'integer', minimum: 1, maximum: 10 },
		agentProactiveRecencyBias: { type: 'integer', minimum: 1, maximum: 10 },
		nativeClientAppInfo: {
			type: 'object', nullable: false,
			properties: {
				latestAndroidVersion: { type: 'string', nullable: true },
				latestIosVersion: { type: 'string', nullable: true },
				minRequiredAppVersion: { type: 'string', nullable: true },
				androidDownloadUrl: { type: 'string', nullable: true },
				iosDownloadUrl: { type: 'string', nullable: true },
				changelog: {
					type: 'array',
					nullable: true,
					items: {
						type: 'object',
						properties: {
							version: { type: 'string' },
							content: { type: 'string' },
						},
						required: ['version', 'content'],
					},
				},
				announcement: { type: 'string', nullable: true },
			},
		},
		tosUrl: { type: 'string', nullable: true },
		repositoryUrl: { type: 'string', nullable: true },
		feedbackUrl: { type: 'string', nullable: true },
		impressumUrl: { type: 'string', nullable: true },
		privacyPolicyUrl: { type: 'string', nullable: true },
		inquiryUrl: { type: 'string', nullable: true },
		useObjectStorage: { type: 'boolean' },
		objectStorageBaseUrl: { type: 'string', nullable: true },
		objectStorageBucket: { type: 'string', nullable: true },
		objectStoragePrefix: { type: 'string', pattern: /^[a-zA-Z0-9-._]*$/.source, nullable: true },
		objectStorageEndpoint: { type: 'string', nullable: true },
		objectStorageRegion: { type: 'string', nullable: true },
		objectStoragePort: { type: 'integer', nullable: true },
		objectStorageAccessKey: { type: 'string', nullable: true },
		objectStorageSecretKey: { type: 'string', nullable: true },
		objectStorageUseSSL: { type: 'boolean' },
		objectStorageUseProxy: { type: 'boolean' },
		objectStorageSetPublicRead: { type: 'boolean' },
		objectStorageS3ForcePathStyle: { type: 'boolean' },
		objectStorageForceHttps: { type: 'boolean' },
		enableIpLogging: { type: 'boolean' },
		enableActiveEmailValidation: { type: 'boolean' },
		enableVerifymailApi: { type: 'boolean' },
		verifymailAuthKey: { type: 'string', nullable: true },
		enableTruemailApi: { type: 'boolean' },
		truemailInstance: { type: 'string', nullable: true },
		truemailAuthKey: { type: 'string', nullable: true },
		enableChartsForRemoteUser: { type: 'boolean' },
		enableChartsForFederatedInstances: { type: 'boolean' },
		enableStatsForFederatedInstances: { type: 'boolean' },
		enableServerMachineStats: { type: 'boolean' },
		enableIdenticonGeneration: { type: 'boolean' },
		serverRules: { type: 'array', items: { type: 'string' } },
		bannedEmailDomains: { type: 'array', items: { type: 'string' } },
		preservedUsernames: { type: 'array', items: { type: 'string' } },
		manifestJsonOverride: { type: 'string' },
		enableFanoutTimeline: { type: 'boolean' },
		enableFanoutTimelineDbFallback: { type: 'boolean' },
		perLocalUserUserTimelineCacheMax: { type: 'integer' },
		perRemoteUserUserTimelineCacheMax: { type: 'integer' },
		perUserHomeTimelineCacheMax: { type: 'integer' },
		perUserListTimelineCacheMax: { type: 'integer' },
		enableReactionsBuffering: { type: 'boolean' },
		notesPerOneAd: { type: 'integer' },
		silencedHosts: {
			type: 'array',
			nullable: true,
			items: {
				type: 'string',
			},
		},
		mediaSilencedHosts: {
			type: 'array',
			nullable: true,
			items: {
				type: 'string',
			},
		},
		summalyProxy: {
			type: 'string', nullable: true,
			description: '[Deprecated] Use "urlPreviewSummaryProxyUrl" instead.',
		},
		urlPreviewEnabled: { type: 'boolean' },
		urlPreviewAllowRedirect: { type: 'boolean' },
		urlPreviewTimeout: { type: 'integer' },
		urlPreviewMaximumContentLength: { type: 'integer' },
		urlPreviewRequireContentLength: { type: 'boolean' },
		urlPreviewUserAgent: { type: 'string', nullable: true },
		urlPreviewSummaryProxyUrl: { type: 'string', nullable: true },
		federation: {
			type: 'string',
			enum: ['all', 'none', 'specified'],
		},
		federationHosts: {
			type: 'array',
			items: {
				type: 'string',
			},
		},
		deliverSuspendedSoftware: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					software: { type: 'string' },
					versionRange: { type: 'string' },
				},
				required: ['software', 'versionRange'],
			},
		},
		singleUserMode: { type: 'boolean' },
		ugcVisibilityForVisitor: {
			type: 'string',
			enum: ['all', 'local', 'none'],
		},
		proxyRemoteFiles: { type: 'boolean' },
		signToActivityPubGet: { type: 'boolean' },
		allowExternalApRedirect: { type: 'boolean' },
		enableRemoteNotesCleaning: { type: 'boolean' },
		remoteNotesCleaningExpiryDaysForEachNotes: { type: 'number' },
		remoteNotesCleaningMaxProcessingDurationInMinutes: { type: 'number' },
		showRoleBadgesOfRemoteUsers: { type: 'boolean' },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.meta)
		private serverSettings: MiMeta,

		private metaService: MetaService,
		private moderationLogService: ModerationLogService,
		private agentCompressionMemoryService: AgentCompressionMemoryService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const set = {} as Partial<MiMeta>;

			if (typeof ps.disableRegistration === 'boolean') {
				set.disableRegistration = ps.disableRegistration;
			}

			if (Array.isArray(ps.pinnedUsers)) {
				set.pinnedUsers = ps.pinnedUsers.filter(Boolean);
			}

			if (Array.isArray(ps.hiddenTags)) {
				set.hiddenTags = ps.hiddenTags.filter(Boolean);
			}

			if (Array.isArray(ps.blockedHosts)) {
				set.blockedHosts = ps.blockedHosts.filter(Boolean).map(x => x.toLowerCase());
			}

			if (Array.isArray(ps.sensitiveWords)) {
				set.sensitiveWords = ps.sensitiveWords.filter(Boolean);
			}
			if (Array.isArray(ps.prohibitedWords)) {
				set.prohibitedWords = ps.prohibitedWords.filter(Boolean);
			}
			if (Array.isArray(ps.prohibitedWordsForNameOfUser)) {
				set.prohibitedWordsForNameOfUser = ps.prohibitedWordsForNameOfUser.filter(Boolean);
			}
			if (Array.isArray(ps.silencedHosts)) {
				let lastValue = '';
				set.silencedHosts = ps.silencedHosts.sort().filter((h) => {
					const lv = lastValue;
					lastValue = h;
					return h !== '' && h !== lv && !set.blockedHosts?.includes(h);
				});
			}
			if (Array.isArray(ps.mediaSilencedHosts)) {
				let lastValue = '';
				set.mediaSilencedHosts = ps.mediaSilencedHosts.sort().filter((h) => {
					const lv = lastValue;
					lastValue = h;
					return h !== '' && h !== lv && !set.blockedHosts?.includes(h);
				});
			}
			if (ps.themeColor !== undefined) {
				set.themeColor = ps.themeColor;
			}

			if (ps.mascotImageUrl !== undefined) {
				set.mascotImageUrl = ps.mascotImageUrl;
			}

			if (ps.bannerUrl !== undefined) {
				set.bannerUrl = ps.bannerUrl;
			}

			if (ps.iconUrl !== undefined) {
				set.iconUrl = ps.iconUrl;
			}

			if (ps.app192IconUrl !== undefined) {
				set.app192IconUrl = ps.app192IconUrl;
			}

			if (ps.app512IconUrl !== undefined) {
				set.app512IconUrl = ps.app512IconUrl;
			}

			if (ps.serverErrorImageUrl !== undefined) {
				set.serverErrorImageUrl = ps.serverErrorImageUrl;
			}

			if (ps.infoImageUrl !== undefined) {
				set.infoImageUrl = ps.infoImageUrl;
			}

			if (ps.notFoundImageUrl !== undefined) {
				set.notFoundImageUrl = ps.notFoundImageUrl;
			}

			if (ps.backgroundImageUrl !== undefined) {
				set.backgroundImageUrl = ps.backgroundImageUrl;
			}

			if (ps.logoImageUrl !== undefined) {
				set.logoImageUrl = ps.logoImageUrl;
			}

			if (ps.name !== undefined) {
				set.name = ps.name;
			}

			if (ps.shortName !== undefined) {
				set.shortName = ps.shortName;
			}

			if (ps.description !== undefined) {
				set.description = ps.description;
			}

			if (ps.defaultLightTheme !== undefined) {
				set.defaultLightTheme = ps.defaultLightTheme;
			}

			if (ps.defaultDarkTheme !== undefined) {
				set.defaultDarkTheme = ps.defaultDarkTheme;
			}

			if (ps.clientOptions !== undefined) {
				set.clientOptions = {
					...serverSettings.clientOptions,
					...ps.clientOptions,
				};
			}

			if (ps.cacheRemoteFiles !== undefined) {
				set.cacheRemoteFiles = ps.cacheRemoteFiles;
			}

			if (ps.cacheRemoteSensitiveFiles !== undefined) {
				set.cacheRemoteSensitiveFiles = ps.cacheRemoteSensitiveFiles;
			}

			if (ps.emailRequiredForSignup !== undefined) {
				set.emailRequiredForSignup = ps.emailRequiredForSignup;
			}

			if (ps.enableHcaptcha !== undefined) {
				set.enableHcaptcha = ps.enableHcaptcha;
			}

			if (ps.hcaptchaSiteKey !== undefined) {
				set.hcaptchaSiteKey = ps.hcaptchaSiteKey;
			}

			if (ps.hcaptchaSecretKey !== undefined) {
				set.hcaptchaSecretKey = ps.hcaptchaSecretKey;
			}

			if (ps.enableMcaptcha !== undefined) {
				set.enableMcaptcha = ps.enableMcaptcha;
			}

			if (ps.mcaptchaSiteKey !== undefined) {
				set.mcaptchaSitekey = ps.mcaptchaSiteKey;
			}

			if (ps.mcaptchaInstanceUrl !== undefined) {
				set.mcaptchaInstanceUrl = ps.mcaptchaInstanceUrl;
			}

			if (ps.mcaptchaSecretKey !== undefined) {
				set.mcaptchaSecretKey = ps.mcaptchaSecretKey;
			}

			if (ps.enableRecaptcha !== undefined) {
				set.enableRecaptcha = ps.enableRecaptcha;
			}

			if (ps.recaptchaSiteKey !== undefined) {
				set.recaptchaSiteKey = ps.recaptchaSiteKey;
			}

			if (ps.recaptchaSecretKey !== undefined) {
				set.recaptchaSecretKey = ps.recaptchaSecretKey;
			}

			if (ps.enableTurnstile !== undefined) {
				set.enableTurnstile = ps.enableTurnstile;
			}

			if (ps.turnstileSiteKey !== undefined) {
				set.turnstileSiteKey = ps.turnstileSiteKey;
			}

			if (ps.turnstileSecretKey !== undefined) {
				set.turnstileSecretKey = ps.turnstileSecretKey;
			}

			if (ps.enableAliyunCaptcha !== undefined) {
				set.enableAliyunCaptcha = ps.enableAliyunCaptcha;
			}

			if (ps.aliyunCaptchaPrefix !== undefined) {
				set.aliyunCaptchaPrefix = ps.aliyunCaptchaPrefix;
			}

			if (ps.aliyunCaptchaSceneId !== undefined) {
				set.aliyunCaptchaSceneId = ps.aliyunCaptchaSceneId;
			}

			if (ps.aliyunCaptchaRegion !== undefined) {
				set.aliyunCaptchaRegion = ps.aliyunCaptchaRegion;
			}

			if (ps.aliyunCaptchaAccessKeyId !== undefined) {
				set.aliyunCaptchaAccessKeyId = ps.aliyunCaptchaAccessKeyId;
			}

			if (ps.aliyunCaptchaAccessKeySecret !== undefined) {
				set.aliyunCaptchaAccessKeySecret = ps.aliyunCaptchaAccessKeySecret;
			}

			if (ps.enableTestcaptcha !== undefined) {
				set.enableTestcaptcha = ps.enableTestcaptcha;
			}

			if (ps.googleAnalyticsMeasurementId !== undefined) {
				// 空文字列をnullにしたいので??は使わない
				// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
				set.googleAnalyticsMeasurementId = ps.googleAnalyticsMeasurementId || null;
			}

			if (ps.sensitiveMediaDetection !== undefined) {
				set.sensitiveMediaDetection = ps.sensitiveMediaDetection;
			}

			if (ps.sensitiveMediaDetectionSensitivity !== undefined) {
				set.sensitiveMediaDetectionSensitivity = ps.sensitiveMediaDetectionSensitivity;
			}

			if (ps.setSensitiveFlagAutomatically !== undefined) {
				set.setSensitiveFlagAutomatically = ps.setSensitiveFlagAutomatically;
			}

			if (ps.enableSensitiveMediaDetectionForVideos !== undefined) {
				set.enableSensitiveMediaDetectionForVideos = ps.enableSensitiveMediaDetectionForVideos;
			}

			if (ps.maintainerName !== undefined) {
				set.maintainerName = ps.maintainerName;
			}

			if (ps.maintainerEmail !== undefined) {
				set.maintainerEmail = ps.maintainerEmail;
			}

			if (Array.isArray(ps.langs)) {
				set.langs = ps.langs.filter(Boolean);
			}

			if (ps.enableEmail !== undefined) {
				set.enableEmail = ps.enableEmail;
			}

			if (ps.email !== undefined) {
				set.email = ps.email;
			}

			if (ps.smtpSecure !== undefined) {
				set.smtpSecure = ps.smtpSecure;
			}

			if (ps.smtpHost !== undefined) {
				set.smtpHost = ps.smtpHost;
			}

			if (ps.smtpPort !== undefined) {
				set.smtpPort = ps.smtpPort;
			}

			if (ps.smtpUser !== undefined) {
				set.smtpUser = ps.smtpUser;
			}

			if (ps.smtpPass !== undefined) {
				set.smtpPass = ps.smtpPass;
			}

			if (ps.enableServiceWorker !== undefined) {
				set.enableServiceWorker = ps.enableServiceWorker;
			}

			if (ps.swPublicKey !== undefined) {
				set.swPublicKey = ps.swPublicKey;
			}

			if (ps.swPrivateKey !== undefined) {
				set.swPrivateKey = ps.swPrivateKey;
			}

			if (ps.aliyunMobilePushAccessKeyId !== undefined) {
				set.aliyunMobilePushAccessKeyId = ps.aliyunMobilePushAccessKeyId;
			}

			if (ps.aliyunMobilePushAccessKeySecret !== undefined) {
				set.aliyunMobilePushAccessKeySecret = ps.aliyunMobilePushAccessKeySecret;
			}

			if (ps.aliyunMobilePushAppKey !== undefined) {
				set.aliyunMobilePushAppKey = ps.aliyunMobilePushAppKey;
			}

			if (ps.enableAliyunMobilePush !== undefined) {
				set.enableAliyunMobilePush = ps.enableAliyunMobilePush;
			}

			if (ps.agentFeatureEnabled !== undefined) {
				set.agentFeatureEnabled = ps.agentFeatureEnabled;
			}

			if (ps.agentGlobalSystemPrompt !== undefined) {
				set.agentGlobalSystemPrompt = ps.agentGlobalSystemPrompt;
			}

			if (ps.agentOpenaiCompatibleBaseUrl !== undefined) {
				const v = ps.agentOpenaiCompatibleBaseUrl === '' ? null : ps.agentOpenaiCompatibleBaseUrl;
				if (v) {
					try {
						const safe = await assertSafeLlmHttpsUrl(v);
						set.agentOpenaiCompatibleBaseUrl = hrefForStoredLlmBaseUrl(safe);
					} catch (e) {
						const detail = e instanceof UnsafeLlmUrlError
							? describeUnsafeLlmUrlReason(e.reason)
							: (e instanceof Error ? e.message : String(e));
						throw new ApiError({
							message: `LLM base URL: ${detail}`,
							code: 'INVALID_PARAM',
							id: 'a1c2e3f4-5061-7890-abcd-ef1234567890',
						});
					}
				} else {
					set.agentOpenaiCompatibleBaseUrl = null;
				}
			}

			if (ps.agentOpenaiCompatibleApiKey !== undefined) {
				set.agentOpenaiCompatibleApiKey = ps.agentOpenaiCompatibleApiKey === '' ? null : ps.agentOpenaiCompatibleApiKey;
			}

			if (ps.agentModelDisplayName !== undefined) {
				set.agentModelDisplayName = ps.agentModelDisplayName === '' ? null : ps.agentModelDisplayName;
			}

			if (ps.agentModelDescription !== undefined) {
				set.agentModelDescription = ps.agentModelDescription === '' ? null : ps.agentModelDescription;
			}

			if (ps.agentModelApiName !== undefined) {
				set.agentModelApiName = ps.agentModelApiName === '' ? null : ps.agentModelApiName;
			}

			if (ps.agentLlmModels !== undefined) {
				const r = normalizeAgentLlmModelsParam(ps.agentLlmModels);
				if (!r.ok) {
					throw new ApiError({
						message: 'Invalid agent LLM models.',
						code: 'INVALID_PARAM',
						id: 'b1c2d3e4-f5a6-7890-bcde-f12345678901',
					});
				}
				const nextDefaultId = ps.agentDefaultModelId !== undefined
					? (typeof ps.agentDefaultModelId === 'string' && ps.agentDefaultModelId.trim() !== '' ? ps.agentDefaultModelId.trim() : null)
					: serverSettings.agentDefaultModelId;

				if (r.value != null && r.value.length > 0) {
					for (let i = 0; i < r.value.length; i++) {
						const m = r.value[i];
						try {
							const safe = await assertSafeLlmHttpsUrl(m.baseUrl);
							r.value[i] = { ...m, baseUrl: hrefForStoredLlmBaseUrl(safe) };
						} catch (e) {
							const detail = e instanceof UnsafeLlmUrlError
								? describeUnsafeLlmUrlReason(e.reason)
								: (e instanceof Error ? e.message : String(e));
							throw new ApiError({
								message: `Model "${m.id}" base URL: ${detail}`,
								code: 'INVALID_PARAM',
								id: 'c2d3e4f5-a6b7-8901-cdef-123456789012',
							});
						}
					}
					set.agentLlmModels = r.value;
					set.agentOpenaiCompatibleBaseUrl = null;
					set.agentOpenaiCompatibleApiKey = null;
					set.agentModelDisplayName = null;
					set.agentModelDescription = null;
					set.agentModelApiName = null;
					const pick = (nextDefaultId ? r.value.find(x => x.id === nextDefaultId) : null) ?? r.value[0];
					set.agentMaxContextTokens = pick.maxContextTokens;
					set.agentMaxOutputTokensPerCall = pick.maxOutputTokensPerCall;
			} else {
				set.agentLlmModels = null;
				set.agentOpenaiCompatibleBaseUrl = null;
				set.agentOpenaiCompatibleApiKey = null;
				set.agentModelDisplayName = null;
				set.agentModelDescription = null;
				set.agentModelApiName = null;
				set.agentMaxContextTokens = 8192;
				set.agentMaxOutputTokensPerCall = 2048;
			}
		}

		if (ps.agentLlmModelGroups !== undefined) {
			const r = normalizeAgentLlmModelGroupsParam(ps.agentLlmModelGroups);
			if (!r.ok) {
				throw new ApiError({
					message: 'Invalid agent LLM model groups.',
					code: 'INVALID_PARAM',
					id: 'd3e4f5a6-b7c8-9012-def3-456789abcdef',
				});
			}
			set.agentLlmModelGroups = r.value;
		}

		if (ps.agentDefaultModelId !== undefined) {
				set.agentDefaultModelId = ps.agentDefaultModelId === '' ? null : ps.agentDefaultModelId;
			}

			if (ps.agentByokEnabled !== undefined) {
				set.agentByokEnabled = ps.agentByokEnabled;
			}

			if (ps.agentByokProviders !== undefined) {
				const r = normalizeAgentByokProvidersParam(ps.agentByokProviders);
				if (!r.ok) {
					throw new ApiError({
						message: 'Invalid BYOK providers.',
						code: 'INVALID_PARAM',
						id: 'd5e6f7a8-b9c0-41d1-8e2f-3a4b5c6d7e8f',
					});
				}
				if (r.value != null && r.value.length > 0) {
					const verified = [];
					for (const p of r.value) {
						try {
							const safe = await assertSafeLlmHttpsUrl(p.baseUrl);
							verified.push({ ...p, baseUrl: hrefForStoredLlmBaseUrl(safe) });
						} catch (e) {
							const detail = e instanceof UnsafeLlmUrlError
								? describeUnsafeLlmUrlReason(e.reason)
								: (e instanceof Error ? e.message : String(e));
							throw new ApiError({
								message: `BYOK provider "${p.name}" base URL: ${detail}`,
								code: 'INVALID_PARAM',
								id: 'e6f7a8b9-c0d1-42e2-9f3a-4b5c6d7e8f90',
							});
						}
					}
					set.agentByokProviders = verified;
				} else {
					set.agentByokProviders = null;
				}
			}

			if (ps.agentByokMaxUserModels !== undefined) {
				set.agentByokMaxUserModels = Math.max(1, Math.min(500, ps.agentByokMaxUserModels));
			}

			if (ps.agentMaxContextTokens !== undefined) {
				set.agentMaxContextTokens = ps.agentMaxContextTokens;
			}

			if (ps.agentMaxOutputTokensPerCall !== undefined) {
				set.agentMaxOutputTokensPerCall = ps.agentMaxOutputTokensPerCall;
			}

			if (ps.agentMem0Enabled !== undefined) {
				set.agentMem0Enabled = ps.agentMem0Enabled;
			}
			if (ps.agentMem0ApiKey !== undefined) {
				set.agentMem0ApiKey = ps.agentMem0ApiKey === '' ? null : ps.agentMem0ApiKey;
			}
			if (ps.agentMem0ApiBaseUrl !== undefined) {
				set.agentMem0ApiBaseUrl = ps.agentMem0ApiBaseUrl === '' ? null : ps.agentMem0ApiBaseUrl;
			}
			if (ps.agentMem0OrgId !== undefined) {
				set.agentMem0OrgId = ps.agentMem0OrgId === '' ? null : ps.agentMem0OrgId;
			}
			if (ps.agentMem0ProjectId !== undefined) {
				set.agentMem0ProjectId = ps.agentMem0ProjectId === '' ? null : ps.agentMem0ProjectId;
			}
			if (ps.agentMem0TopK !== undefined) {
				set.agentMem0TopK = ps.agentMem0TopK;
			}
			if (ps.agentMem0InjectMaxChars !== undefined) {
				set.agentMem0InjectMaxChars = ps.agentMem0InjectMaxChars;
			}
			if (ps.agentMem0AddMemoryMaxRounds !== undefined) {
				set.agentMem0AddMemoryMaxRounds = Math.max(1, Math.min(24, ps.agentMem0AddMemoryMaxRounds));
			}
			if (ps.agentMem0AddMemoryEveryNRounds !== undefined) {
				set.agentMem0AddMemoryEveryNRounds = Math.max(1, Math.min(48, ps.agentMem0AddMemoryEveryNRounds));
			}

			if (ps.agentCompressionSystemPrompt !== undefined) {
				set.agentCompressionSystemPrompt = ps.agentCompressionSystemPrompt === null || String(ps.agentCompressionSystemPrompt).trim() === ''
					? null
					: String(ps.agentCompressionSystemPrompt).trim();
			}
			if (ps.agentCompressionMaxInputChars !== undefined) {
				set.agentCompressionMaxInputChars = Math.max(500, Math.min(200000, ps.agentCompressionMaxInputChars));
			}
			if (ps.agentCompressionMaxOutputTokens !== undefined) {
				set.agentCompressionMaxOutputTokens = Math.max(1, Math.min(32000, ps.agentCompressionMaxOutputTokens));
			}

			if (ps.agentCompressionBandT1Ratio !== undefined || ps.agentCompressionBandT2Ratio !== undefined) {
				const t1m = ps.agentCompressionBandT1Ratio !== undefined ? ps.agentCompressionBandT1Ratio : serverSettings.agentCompressionBandT1Ratio;
				const t2m = ps.agentCompressionBandT2Ratio !== undefined ? ps.agentCompressionBandT2Ratio : serverSettings.agentCompressionBandT2Ratio;
				if (t1m === null && t2m === null) {
					set.agentCompressionBandT1Ratio = null;
					set.agentCompressionBandT2Ratio = null;
				} else {
					const o = this.agentCompressionMemoryService.resolveCompressionBandRatios(
						{ ...serverSettings, agentCompressionBandT1Ratio: t1m, agentCompressionBandT2Ratio: t2m } as MiMeta,
					);
					set.agentCompressionBandT1Ratio = o.t1Ratio;
					set.agentCompressionBandT2Ratio = o.t2Ratio;
				}
			}

			if (ps.agentCompressionDefaultModelId !== undefined) {
				const raw = ps.agentCompressionDefaultModelId;
				const v = raw === null || (typeof raw === 'string' && raw.trim() === '')
					? null
					: String(raw).trim();
				if (v) {
					const nextLlm = set.agentLlmModels !== undefined
						? set.agentLlmModels
						: serverSettings.agentLlmModels;
					const tentative = { ...serverSettings, ...set, agentLlmModels: nextLlm } as MiMeta;
					if (!getActiveLlmModels(tentative).some(m => m.id === v)) {
						throw new ApiError({
							message: 'Invalid agent compression default model id.',
							code: 'INVALID_PARAM',
							id: 'f1e2d3c4-b5a6-7890-1234-567890abcdef',
						});
					}
				}
				set.agentCompressionDefaultModelId = v;
			}

			if (ps.agentImageGenerationEnabled !== undefined) {
				set.agentImageGenerationEnabled = ps.agentImageGenerationEnabled;
			}
			if (ps.agentImageBaseUrl !== undefined) {
				const raw = ps.agentImageBaseUrl.trim().replace(/\/$/, '');
				try {
					const u = new URL(raw);
					if (u.protocol !== 'https:') throw new Error('HTTPS is required.');
					set.agentImageBaseUrl = u.toString().replace(/\/$/, '');
				} catch (e) {
					throw new ApiError({
						message: `Image base URL: ${e instanceof Error ? e.message : String(e)}`,
						code: 'INVALID_PARAM',
						id: '78188bb5-fd11-46b8-87fb-a48f0e4b871e',
					});
				}
			}
			if (ps.agentImageTokens !== undefined) {
				set.agentImageTokens = (ps.agentImageTokens ?? []).map((t, i) => ({
					id: typeof t.id === 'string' && t.id.trim() ? t.id.trim() : `token-${i + 1}`,
					token: t.token.trim(),
					name: typeof t.name === 'string' && t.name.trim() ? t.name.trim() : null,
					enabled: t.enabled !== false,
					sortOrder: Number.isFinite(Number(t.sortOrder)) ? Math.trunc(Number(t.sortOrder)) : i,
					points: typeof t.points === 'number' ? t.points : null,
					lastUsedAt: typeof t.lastUsedAt === 'string' ? t.lastUsedAt : null,
					lastCheckedAt: typeof t.lastCheckedAt === 'string' ? t.lastCheckedAt : null,
					lastError: typeof t.lastError === 'string' ? t.lastError : null,
				}));
			}
			if (ps.agentImageModels !== undefined) {
				const seen = new Set<string>();
				set.agentImageModels = await Promise.all((ps.agentImageModels ?? []).map(async (m, i) => {
					const id = m.id.trim();
					if (seen.has(id)) {
						throw new ApiError({
							message: `Duplicate image model id: ${id}`,
							code: 'INVALID_PARAM',
							id: '2fe74acd-4486-4549-a745-50f8586c76c4',
						});
					}
					seen.add(id);
					if (m.provider === 'aurora' && (typeof m.apiModelName !== 'string' || m.apiModelName.trim() === '')) {
						throw new ApiError({
							message: 'Aurora image model apiModelName is required.',
							code: 'INVALID_PARAM',
							id: 'b779a54b-01bf-4276-b48b-cff148ad9839',
						});
					}
					let apiUrl: string | null = null;
					let apiKey: string | null = null;
					if (m.provider === 'openai' || m.provider === 'qwen') {
						if (typeof m.apiModelName !== 'string' || m.apiModelName.trim() === ''
							|| typeof m.apiUrl !== 'string' || m.apiUrl.trim() === ''
							|| typeof m.apiKey !== 'string' || m.apiKey.trim() === '') {
							throw new ApiError({
								message: 'Image model requires apiModelName, apiUrl, and apiKey.',
								code: 'INVALID_PARAM',
								id: '4b9f0af0-aec5-4151-bff6-239b0c639baa',
							});
						}
						try {
							apiUrl = hrefForStoredLlmBaseUrl(await assertSafeLlmHttpsUrl(m.apiUrl));
						} catch (err) {
							const reason = err instanceof UnsafeLlmUrlError ? describeUnsafeLlmUrlReason(err.reason) : 'Invalid URL.';
							throw new ApiError({
								message: `Image model URL is invalid: ${reason}`,
								code: 'INVALID_PARAM',
								id: 'd5c7da16-6e40-4f65-90db-996bba9c4aaf',
							});
						}
						apiKey = m.apiKey.trim();
					}
					return {
						id,
						name: m.name.trim(),
						description: typeof m.description === 'string' && m.description.trim() !== '' ? m.description.trim() : null,
						provider: m.provider,
						enabled: m.enabled !== false,
						apiModelName: typeof m.apiModelName === 'string' && m.apiModelName.trim() !== '' ? m.apiModelName.trim() : null,
						apiUrl,
						apiKey,
						supportsReferenceImage: m.provider === 'openai' && m.supportsReferenceImage === true,
						costPerCall: typeof m.costPerCall === 'number' ? Math.max(0, m.costPerCall) : null,
						dailyFreeQuota: typeof m.dailyFreeQuota === 'number' && m.dailyFreeQuota > 0 ? Math.trunc(m.dailyFreeQuota) : null,
						defaultParams: m.defaultParams ?? null,
						defaultArtistPresetId: typeof m.defaultArtistPresetId === 'string' && m.defaultArtistPresetId.trim() !== '' ? m.defaultArtistPresetId.trim() : null,
					};
				}));
			}
			if (ps.agentVisionModels !== undefined) {
				const seen = new Set<string>();
				set.agentVisionModels = await Promise.all((ps.agentVisionModels ?? []).map(async (m) => {
					const id = m.id.trim();
					if (seen.has(id)) {
						throw new ApiError({ message: `Duplicate image recognition model id: ${id}`, code: 'INVALID_PARAM', id: '4c1b6fd6-67f8-40dd-930d-88e26042db19' });
					}
					seen.add(id);
					try {
						return {
							id,
							name: m.name.trim(),
							enabled: m.enabled !== false,
							apiUrl: hrefForStoredLlmBaseUrl(await assertSafeLlmHttpsUrl(m.apiUrl)),
							apiKey: m.apiKey.trim(),
							apiModelName: m.apiModelName.trim(),
							costPerCall: typeof m.costPerCall === 'number' ? Math.max(0, m.costPerCall) : null,
						};
					} catch (err) {
						const reason = err instanceof UnsafeLlmUrlError ? describeUnsafeLlmUrlReason(err.reason) : 'Invalid URL.';
						throw new ApiError({ message: `Image recognition model URL is invalid: ${reason}`, code: 'INVALID_PARAM', id: '51c2f9a6-0e1e-4b8c-b886-9148774aec8c' });
					}
				}));
			}
			if (ps.agentVisionDefaultModelId !== undefined) {
				const id = typeof ps.agentVisionDefaultModelId === 'string' && ps.agentVisionDefaultModelId.trim() !== '' ? ps.agentVisionDefaultModelId.trim() : null;
				const models = set.agentVisionModels ?? serverSettings.agentVisionModels ?? [];
				if (id != null && !models.some(model => model.id === id && model.enabled !== false)) {
					throw new ApiError({ message: 'Image recognition default model must be enabled.', code: 'INVALID_PARAM', id: 'edc23cfd-5338-40cf-a342-e3e6fcf5efb6' });
				}
				set.agentVisionDefaultModelId = id ?? models.find(model => model.enabled !== false)?.id ?? null;
			}
			if (ps.agentImageArtistPresets !== undefined) {
				const seen = new Set<string>();
				set.agentImageArtistPresets = (ps.agentImageArtistPresets ?? []).map((p, i) => {
					const id = String(p.id ?? '').trim();
					const name = String(p.name ?? '').trim();
					if (!id || !name) {
						throw new ApiError({
							message: `Image artist preset #${i + 1} requires id and name.`,
							code: 'INVALID_PARAM',
							id: 'f33a70d0-424b-4b10-adfc-64602f89db4f',
						});
					}
					if (seen.has(id)) {
						throw new ApiError({
							message: `Duplicate image artist preset id: ${id}`,
							code: 'INVALID_PARAM',
							id: 'd611e2de-c5dc-438a-9258-cb618dd915f0',
						});
					}
					seen.add(id);
					return {
						id,
						name,
						promptPrefix: typeof p.promptPrefix === 'string' ? p.promptPrefix : '',
						promptSuffix: typeof p.promptSuffix === 'string' ? p.promptSuffix : '',
						negativePrompt: typeof p.negativePrompt === 'string' ? p.negativePrompt : '',
						thumbnailUrl: typeof p.thumbnailUrl === 'string' && p.thumbnailUrl.trim() !== '' ? p.thumbnailUrl.trim() : null,
					};
				});
			}
			if (ps.agentImageDefaultModel !== undefined) {
				set.agentImageDefaultModel = ps.agentImageDefaultModel.trim() || 'nai-diffusion-4-5-full';
			}
			if (ps.agentImageDefaultParams !== undefined) {
				set.agentImageDefaultParams = ps.agentImageDefaultParams;
			}
			if (ps.agentImageDefaultNegativePrompt !== undefined) {
				set.agentImageDefaultNegativePrompt = ps.agentImageDefaultNegativePrompt === '' ? null : ps.agentImageDefaultNegativePrompt;
			}
			if (ps.agentImageMaxPerReply !== undefined) {
				set.agentImageMaxPerReply = Math.max(0, Math.min(12, ps.agentImageMaxPerReply));
			}
			if (ps.agentImageCostPerCall !== undefined) {
				set.agentImageCostPerCall = Math.max(0, ps.agentImageCostPerCall);
			}
			if (ps.agentImageDefaultArtistPresetId !== undefined) {
				set.agentImageDefaultArtistPresetId = ps.agentImageDefaultArtistPresetId === '' ? null : ps.agentImageDefaultArtistPresetId;
			}
			if (ps.agentImageTokenMinPoints !== undefined) {
				set.agentImageTokenMinPoints = Math.max(0, ps.agentImageTokenMinPoints);
			}
			if (ps.agentImageTokenBalanceTtlSeconds !== undefined) {
				set.agentImageTokenBalanceTtlSeconds = Math.max(0, ps.agentImageTokenBalanceTtlSeconds);
			}

			if (ps.agentExternalAuditEnabled !== undefined) {
				set.agentExternalAuditEnabled = ps.agentExternalAuditEnabled;
			}
			if (ps.agentExternalAuditModels !== undefined) {
				const seen = new Set<string>();
				set.agentExternalAuditModels = (ps.agentExternalAuditModels ?? []).map((m, i) => {
					const id = String(m.id ?? '').trim();
					if (seen.has(id)) {
						throw new ApiError({
							message: `Duplicate external audit model id: ${id}`,
							code: 'INVALID_PARAM',
							id: 'fd2e9f39-328a-4eb6-960a-e1795b72bfc0',
						});
					}
					seen.add(id);
					const baseUrlRaw = String(m.baseUrl ?? '').trim().replace(/\/$/, '');
					try {
						const u = new URL(baseUrlRaw);
						if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Only http and https endpoints are supported.');
					} catch (e) {
						throw new ApiError({
							message: `External audit model "${id || i + 1}" base URL: ${e instanceof Error ? e.message : String(e)}`,
							code: 'INVALID_PARAM',
							id: '8446fb08-2442-4ced-995f-8c538d79d6a2',
						});
					}
					return {
						id,
						name: String(m.name ?? '').trim(),
						apiModelName: String(m.apiModelName ?? '').trim(),
						baseUrl: baseUrlRaw,
						apiKey: String(m.apiKey ?? '').trim(),
						priority: Number.isFinite(Number(m.priority)) ? Math.trunc(Number(m.priority)) : i,
						enabled: m.enabled !== false,
						autoDisabledAt: typeof m.autoDisabledAt === 'string' && m.autoDisabledAt.trim() !== '' ? m.autoDisabledAt.trim() : null,
						autoDisabledReason: typeof m.autoDisabledReason === 'string' && m.autoDisabledReason.trim() !== '' ? m.autoDisabledReason.trim() : null,
						lastError: typeof m.lastError === 'string' && m.lastError.trim() !== '' ? m.lastError.trim() : null,
					};
				});
			}
			if (ps.agentExternalAuditTimeoutMs !== undefined) {
				set.agentExternalAuditTimeoutMs = Math.max(1000, Math.min(120000, ps.agentExternalAuditTimeoutMs));
			}
			if (ps.agentExternalAuditFailureThresholdPercent !== undefined) {
				set.agentExternalAuditFailureThresholdPercent = Math.max(1, Math.min(100, ps.agentExternalAuditFailureThresholdPercent));
			}
			if (ps.agentExternalAuditFailureMinRequests !== undefined) {
				set.agentExternalAuditFailureMinRequests = Math.max(1, Math.min(100000, ps.agentExternalAuditFailureMinRequests));
			}
			if (ps.agentExternalAuditNotifyEmails !== undefined) {
				set.agentExternalAuditNotifyEmails = ps.agentExternalAuditNotifyEmails === null || String(ps.agentExternalAuditNotifyEmails).trim() === ''
					? null
					: String(ps.agentExternalAuditNotifyEmails).trim();
			}
			if (ps.agentExternalAuditSystemPrompt !== undefined) {
				set.agentExternalAuditSystemPrompt = ps.agentExternalAuditSystemPrompt === null || String(ps.agentExternalAuditSystemPrompt).trim() === ''
					? null
					: String(ps.agentExternalAuditSystemPrompt).trim();
			}
			if (ps.agentReviewTriggerRules !== undefined) {
				set.agentReviewTriggerRules = (ps.agentReviewTriggerRules ?? []).map(r => ({
					id: String(r.id),
					timeWindowMinutes: Math.max(1, Math.min(10080, Math.trunc(r.timeWindowMinutes))),
					blockThreshold: Math.max(1, Math.min(1000, Math.trunc(r.blockThreshold))),
					enabled: r.enabled !== false,
				}));
			}

			if (ps.agentCheckinSettings !== undefined) {
				set.agentCheckinSettings = ps.agentCheckinSettings as any;
			}
			
			if (ps.agentRedeemPurchaseUrl !== undefined) {
				set.agentRedeemPurchaseUrl = ps.agentRedeemPurchaseUrl === null || String(ps.agentRedeemPurchaseUrl).trim() === ''
					? null
					: String(ps.agentRedeemPurchaseUrl).trim();
			}

			if (ps.agentAliyaCharacterId !== undefined) {
				set.agentAliyaCharacterId = ps.agentAliyaCharacterId === null || String(ps.agentAliyaCharacterId).trim() === ''
					? null
					: String(ps.agentAliyaCharacterId).trim();
			}

			if (ps.agentAliyaWebUrl !== undefined) {
				set.agentAliyaWebUrl = ps.agentAliyaWebUrl === null || String(ps.agentAliyaWebUrl).trim() === ''
					? null
					: String(ps.agentAliyaWebUrl).trim();
			}

			if (ps.agentProactiveRandomDefaultEnabled !== undefined) {
				set.agentProactiveRandomDefaultEnabled = ps.agentProactiveRandomDefaultEnabled;
			}
			if (ps.agentProactiveScheduledDefaultEnabled !== undefined) {
				set.agentProactiveScheduledDefaultEnabled = ps.agentProactiveScheduledDefaultEnabled;
			}
			if (ps.agentProactiveMinSilenceMinutes !== undefined) {
				set.agentProactiveMinSilenceMinutes = Math.max(5, Math.min(1440, ps.agentProactiveMinSilenceMinutes));
			}
			if (ps.agentProactiveMaxWindowMinutes !== undefined) {
				set.agentProactiveMaxWindowMinutes = Math.max(30, Math.min(10080, ps.agentProactiveMaxWindowMinutes));
			}
			if (ps.agentProactiveDaytimeWeight !== undefined) {
				set.agentProactiveDaytimeWeight = Math.max(1, Math.min(10, ps.agentProactiveDaytimeWeight));
			}
			if (ps.agentProactiveRecencyBias !== undefined) {
				set.agentProactiveRecencyBias = Math.max(1, Math.min(10, ps.agentProactiveRecencyBias));
			}

			if (ps.nativeClientAppInfo !== undefined) {
				const cur: MiNativeClientAppInfo = { ...(serverSettings.nativeClientAppInfo ?? {}) };
				const p = ps.nativeClientAppInfo;
				const keys = ['latestAndroidVersion', 'latestIosVersion', 'minRequiredAppVersion', 'androidDownloadUrl', 'iosDownloadUrl', 'announcement'] as const;
				for (const key of keys) {
					if (p[key] !== undefined) {
						const v = p[key];
						cur[key] = v === '' ? null : v;
					}
				}
				if (p.changelog !== undefined) {
					if (!Array.isArray(p.changelog)) {
						cur.changelog = [];
					} else {
						cur.changelog = p.changelog
							.map((entry) => ({
								version: (entry?.version ?? '').trim(),
								content: (entry?.content ?? '').trim(),
							}))
							.filter((entry) => entry.version.length > 0 || entry.content.length > 0);
					}
				}
				set.nativeClientAppInfo = cur;
			}

			if (ps.tosUrl !== undefined) {
				set.termsOfServiceUrl = ps.tosUrl;
			}

			if (ps.repositoryUrl !== undefined) {
				set.repositoryUrl = URL.canParse(ps.repositoryUrl!) ? ps.repositoryUrl : null;
			}

			if (ps.feedbackUrl !== undefined) {
				set.feedbackUrl = ps.feedbackUrl;
			}

			if (ps.impressumUrl !== undefined) {
				set.impressumUrl = ps.impressumUrl;
			}

			if (ps.privacyPolicyUrl !== undefined) {
				set.privacyPolicyUrl = ps.privacyPolicyUrl;
			}

			if (ps.inquiryUrl !== undefined) {
				set.inquiryUrl = ps.inquiryUrl;
			}

			if (ps.useObjectStorage !== undefined) {
				set.useObjectStorage = ps.useObjectStorage;
			}

			if (ps.objectStorageForceHttps !== undefined) {
				set.objectStorageForceHttps = ps.objectStorageForceHttps;
			}

			if (ps.objectStorageBaseUrl !== undefined) {
				const forceHttps = ps.objectStorageForceHttps ?? serverSettings.objectStorageForceHttps;
				set.objectStorageBaseUrl = coerceHttpObjectStorageUrlToHttps(ps.objectStorageBaseUrl, forceHttps);
			} else if (ps.objectStorageForceHttps === true && ps.objectStorageBaseUrl === undefined && serverSettings.objectStorageBaseUrl?.startsWith('http://')) {
				set.objectStorageBaseUrl = coerceHttpObjectStorageUrlToHttps(serverSettings.objectStorageBaseUrl, true);
			}

			if (ps.objectStorageBucket !== undefined) {
				set.objectStorageBucket = normalizeObjectStorageConfigValue(ps.objectStorageBucket);
			}

			if (ps.objectStoragePrefix !== undefined) {
				set.objectStoragePrefix = normalizeObjectStorageConfigValue(ps.objectStoragePrefix);
			}

			if (ps.objectStorageEndpoint !== undefined) {
				set.objectStorageEndpoint = normalizeObjectStorageConfigValue(ps.objectStorageEndpoint);
			}

			if (ps.objectStorageRegion !== undefined) {
				set.objectStorageRegion = normalizeObjectStorageConfigValue(ps.objectStorageRegion);
			}

			if (ps.objectStoragePort !== undefined) {
				set.objectStoragePort = ps.objectStoragePort;
			}

			if (ps.objectStorageAccessKey !== undefined) {
				set.objectStorageAccessKey = normalizeObjectStorageConfigValue(ps.objectStorageAccessKey);
			}

			if (ps.objectStorageSecretKey !== undefined) {
				set.objectStorageSecretKey = normalizeObjectStorageConfigValue(ps.objectStorageSecretKey);
			}

			if (ps.objectStorageUseSSL !== undefined) {
				set.objectStorageUseSSL = ps.objectStorageUseSSL;
			}

			if (ps.objectStorageUseProxy !== undefined) {
				set.objectStorageUseProxy = ps.objectStorageUseProxy;
			}

			if (ps.objectStorageSetPublicRead !== undefined) {
				set.objectStorageSetPublicRead = ps.objectStorageSetPublicRead;
			}

			if (ps.objectStorageS3ForcePathStyle !== undefined) {
				set.objectStorageS3ForcePathStyle = ps.objectStorageS3ForcePathStyle;
			}

			if (ps.deeplAuthKey !== undefined) {
				if (ps.deeplAuthKey === '') {
					set.deeplAuthKey = null;
				} else {
					set.deeplAuthKey = ps.deeplAuthKey;
				}
			}

			if (ps.deeplIsPro !== undefined) {
				set.deeplIsPro = ps.deeplIsPro;
			}

			if (ps.enableIpLogging !== undefined) {
				set.enableIpLogging = ps.enableIpLogging;
			}

			if (ps.enableActiveEmailValidation !== undefined) {
				set.enableActiveEmailValidation = ps.enableActiveEmailValidation;
			}

			if (ps.enableVerifymailApi !== undefined) {
				set.enableVerifymailApi = ps.enableVerifymailApi;
			}

			if (ps.verifymailAuthKey !== undefined) {
				if (ps.verifymailAuthKey === '') {
					set.verifymailAuthKey = null;
				} else {
					set.verifymailAuthKey = ps.verifymailAuthKey;
				}
			}

			if (ps.enableTruemailApi !== undefined) {
				set.enableTruemailApi = ps.enableTruemailApi;
			}

			if (ps.truemailInstance !== undefined) {
				if (ps.truemailInstance === '') {
					set.truemailInstance = null;
				} else {
					set.truemailInstance = ps.truemailInstance;
				}
			}

			if (ps.truemailAuthKey !== undefined) {
				if (ps.truemailAuthKey === '') {
					set.truemailAuthKey = null;
				} else {
					set.truemailAuthKey = ps.truemailAuthKey;
				}
			}

			if (ps.enableChartsForRemoteUser !== undefined) {
				set.enableChartsForRemoteUser = ps.enableChartsForRemoteUser;
			}

			if (ps.enableChartsForFederatedInstances !== undefined) {
				set.enableChartsForFederatedInstances = ps.enableChartsForFederatedInstances;
			}

			if (ps.enableStatsForFederatedInstances !== undefined) {
				set.enableStatsForFederatedInstances = ps.enableStatsForFederatedInstances;
			}

			if (ps.enableServerMachineStats !== undefined) {
				set.enableServerMachineStats = ps.enableServerMachineStats;
			}

			if (ps.enableIdenticonGeneration !== undefined) {
				set.enableIdenticonGeneration = ps.enableIdenticonGeneration;
			}

			if (ps.serverRules !== undefined) {
				set.serverRules = ps.serverRules;
			}

			if (ps.preservedUsernames !== undefined) {
				set.preservedUsernames = ps.preservedUsernames;
			}

			if (ps.manifestJsonOverride !== undefined) {
				set.manifestJsonOverride = ps.manifestJsonOverride;
			}

			if (ps.enableFanoutTimeline !== undefined) {
				set.enableFanoutTimeline = ps.enableFanoutTimeline;
			}

			if (ps.enableFanoutTimelineDbFallback !== undefined) {
				set.enableFanoutTimelineDbFallback = ps.enableFanoutTimelineDbFallback;
			}

			if (ps.perLocalUserUserTimelineCacheMax !== undefined) {
				set.perLocalUserUserTimelineCacheMax = ps.perLocalUserUserTimelineCacheMax;
			}

			if (ps.perRemoteUserUserTimelineCacheMax !== undefined) {
				set.perRemoteUserUserTimelineCacheMax = ps.perRemoteUserUserTimelineCacheMax;
			}

			if (ps.perUserHomeTimelineCacheMax !== undefined) {
				set.perUserHomeTimelineCacheMax = ps.perUserHomeTimelineCacheMax;
			}

			if (ps.perUserListTimelineCacheMax !== undefined) {
				set.perUserListTimelineCacheMax = ps.perUserListTimelineCacheMax;
			}

			if (ps.enableReactionsBuffering !== undefined) {
				set.enableReactionsBuffering = ps.enableReactionsBuffering;
			}

			if (ps.notesPerOneAd !== undefined) {
				set.notesPerOneAd = ps.notesPerOneAd;
			}

			if (ps.bannedEmailDomains !== undefined) {
				set.bannedEmailDomains = ps.bannedEmailDomains;
			}

			if (ps.urlPreviewEnabled !== undefined) {
				set.urlPreviewEnabled = ps.urlPreviewEnabled;
			}

			if (ps.urlPreviewAllowRedirect !== undefined) {
				set.urlPreviewAllowRedirect = ps.urlPreviewAllowRedirect;
			}

			if (ps.urlPreviewTimeout !== undefined) {
				set.urlPreviewTimeout = ps.urlPreviewTimeout;
			}

			if (ps.urlPreviewMaximumContentLength !== undefined) {
				set.urlPreviewMaximumContentLength = ps.urlPreviewMaximumContentLength;
			}

			if (ps.urlPreviewRequireContentLength !== undefined) {
				set.urlPreviewRequireContentLength = ps.urlPreviewRequireContentLength;
			}

			if (ps.urlPreviewUserAgent !== undefined) {
				const value = (ps.urlPreviewUserAgent ?? '').trim();
				set.urlPreviewUserAgent = value === '' ? null : ps.urlPreviewUserAgent;
			}

			if (ps.summalyProxy !== undefined || ps.urlPreviewSummaryProxyUrl !== undefined) {
				const value = ((ps.urlPreviewSummaryProxyUrl ?? ps.summalyProxy) ?? '').trim();
				set.urlPreviewSummaryProxyUrl = value === '' ? null : value;
			}

			if (ps.federation !== undefined) {
				set.federation = ps.federation;
			}

			if (ps.deliverSuspendedSoftware !== undefined) {
				set.deliverSuspendedSoftware = ps.deliverSuspendedSoftware;
			}

			if (Array.isArray(ps.federationHosts)) {
				set.federationHosts = ps.federationHosts.filter(Boolean).map(x => x.toLowerCase());
			}

			if (ps.singleUserMode !== undefined) {
				set.singleUserMode = ps.singleUserMode;
			}

			if (ps.ugcVisibilityForVisitor !== undefined) {
				set.ugcVisibilityForVisitor = ps.ugcVisibilityForVisitor;
			}

			if (ps.proxyRemoteFiles !== undefined) {
				set.proxyRemoteFiles = ps.proxyRemoteFiles;
			}

			if (ps.signToActivityPubGet !== undefined) {
				set.signToActivityPubGet = ps.signToActivityPubGet;
			}

			if (ps.allowExternalApRedirect !== undefined) {
				set.allowExternalApRedirect = ps.allowExternalApRedirect;
			}

			if (ps.enableRemoteNotesCleaning !== undefined) {
				set.enableRemoteNotesCleaning = ps.enableRemoteNotesCleaning;
			}

			if (ps.remoteNotesCleaningExpiryDaysForEachNotes !== undefined) {
				set.remoteNotesCleaningExpiryDaysForEachNotes = ps.remoteNotesCleaningExpiryDaysForEachNotes;
			}

			if (ps.remoteNotesCleaningMaxProcessingDurationInMinutes !== undefined) {
				set.remoteNotesCleaningMaxProcessingDurationInMinutes = ps.remoteNotesCleaningMaxProcessingDurationInMinutes;
			}

			if (ps.showRoleBadgesOfRemoteUsers !== undefined) {
				set.showRoleBadgesOfRemoteUsers = ps.showRoleBadgesOfRemoteUsers;
			}

			const before = metaEntityForModerationLog(await this.metaService.fetch(true));

			await this.metaService.update(set);

			const after = metaEntityForModerationLog(await this.metaService.fetch(true));

			await this.moderationLogService.log(me, 'updateServerSettings', {
				before,
				after,
			});
		});
	}
}
