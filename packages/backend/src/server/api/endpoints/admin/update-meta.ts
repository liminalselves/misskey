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
import { getActiveLlmModels, normalizeAgentLlmModelsParam } from '@/misc/agent-llm-models.js';
import { AgentCompressionMemoryService } from '@/core/AgentCompressionMemoryService.js';

function coerceHttpObjectStorageUrlToHttps(url: string | null | undefined, force: boolean): string | null {
	if (url == null || url === '') return url ?? null;
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
					costPerCall: { type: 'number', minimum: 0, maximum: 1000000 },
				},
				required: ['id', 'name', 'apiModelName', 'baseUrl', 'apiKey', 'maxContextTokens', 'maxOutputTokensPerCall'],
			},
		},
		agentDefaultModelId: { type: 'string', nullable: true, maxLength: 64 },
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

			if (ps.agentDefaultModelId !== undefined) {
				set.agentDefaultModelId = ps.agentDefaultModelId === '' ? null : ps.agentDefaultModelId;
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
				set.objectStorageBucket = ps.objectStorageBucket;
			}

			if (ps.objectStoragePrefix !== undefined) {
				set.objectStoragePrefix = ps.objectStoragePrefix;
			}

			if (ps.objectStorageEndpoint !== undefined) {
				set.objectStorageEndpoint = ps.objectStorageEndpoint;
			}

			if (ps.objectStorageRegion !== undefined) {
				set.objectStorageRegion = ps.objectStorageRegion;
			}

			if (ps.objectStoragePort !== undefined) {
				set.objectStoragePort = ps.objectStoragePort;
			}

			if (ps.objectStorageAccessKey !== undefined) {
				set.objectStorageAccessKey = ps.objectStorageAccessKey;
			}

			if (ps.objectStorageSecretKey !== undefined) {
				set.objectStorageSecretKey = ps.objectStorageSecretKey;
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
