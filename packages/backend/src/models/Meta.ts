/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Entity, Column, PrimaryColumn, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';

/** 管理后台配置、公开 meta 下发给官方 App 壳使用（版本提示、下载链接等） */
export type MiNativeClientAppInfo = {
	latestAndroidVersion?: string | null;
	latestIosVersion?: string | null;
	/** semver。客户端版本 **低于** 此值时禁止使用壳（留空则不限制） */
	minRequiredAppVersion?: string | null;
	androidDownloadUrl?: string | null;
	iosDownloadUrl?: string | null;
	changelog?: Array<{
		version: string;
		content: string;
	}> | null;
	announcement?: string | null;
};

export type MiAgentImageToken = {
	id: string;
	token: string;
	name?: string | null;
	enabled?: boolean;
	sortOrder?: number;
	points?: number | null;
	lastUsedAt?: string | null;
	lastCheckedAt?: string | null;
	lastError?: string | null;
};

export type MiAgentImageDefaultParams = {
	steps?: number;
	scale?: number;
	cfgRescale?: number;
	sampler?: string;
	noiseSchedule?: string;
	promptPrefix?: string;
	promptSuffix?: string;
};

export type MiAgentImageProvider = 'aurora' | 'openai';

export type MiAgentImageModel = {
	id: string;
	name: string;
	description?: string | null;
	provider: MiAgentImageProvider;
	enabled?: boolean;
	apiModelName?: string | null;
	/** Full OpenAI-compatible /images/generations or /chat/completions endpoint URL. */
	apiUrl?: string | null;
	/** Per-model credential for an OpenAI-compatible image endpoint. */
	apiKey?: string | null;
	/** Whether this model accepts the character's default reference image. */
	supportsReferenceImage?: boolean;
	costPerCall?: number | null;
	dailyFreeQuota?: number | null;
	defaultParams?: MiAgentImageDefaultParams | null;
	defaultArtistPresetId?: string | null;
};

export type MiAgentImageArtistPreset = {
	id: string;
	name: string;
	promptPrefix?: string | null;
	promptSuffix?: string | null;
	negativePrompt?: string | null;
	thumbnailUrl?: string | null;
};

export type MiAgentVisionModel = {
	id: string;
	name: string;
	enabled?: boolean;
	/** Full OpenAI-compatible /v1/chat/completions endpoint URL. */
	apiUrl: string;
	apiKey: string;
	apiModelName: string;
	costPerCall?: number | null;
};

export type MiAgentExternalAuditModel = {
	id: string;
	name: string;
	apiModelName: string;
	baseUrl: string;
	apiKey: string;
	priority: number;
	enabled?: boolean;
	autoDisabledAt?: string | null;
	autoDisabledReason?: string | null;
	lastError?: string | null;
};

/** 外审复审触发条件：在 timeWindowMinutes 分钟内触发外审拦截 blockThreshold 次则进入人工复审 */
export type MiAgentReviewTriggerRule = {
	id: string;
	/** 时间窗口（分钟） */
	timeWindowMinutes: number;
	/** 触发次数阈值 */
	blockThreshold: number;
	/** 是否启用 */
	enabled: boolean;
};

@Entity('meta')
export class MiMeta {
	@PrimaryColumn({
		type: 'varchar',
		length: 32,
	})
	public id: string;

	@Column({
		...id(),
		nullable: true,
	})
	public rootUserId: MiUser['id'] | null;

	@ManyToOne(() => MiUser, {
		onDelete: 'SET NULL',
		nullable: true,
	})
	public rootUser: MiUser | null;

	@Column('varchar', {
		length: 1024, nullable: true,
	})
	public name: string | null;

	@Column('varchar', {
		length: 64, nullable: true,
	})
	public shortName: string | null;

	@Column('varchar', {
		length: 1024, nullable: true,
	})
	public description: string | null;

	/**
	 * メンテナの名前
	 */
	@Column('varchar', {
		length: 1024, nullable: true,
	})
	public maintainerName: string | null;

	/**
	 * メンテナの連絡先
	 */
	@Column('varchar', {
		length: 1024, nullable: true,
	})
	public maintainerEmail: string | null;

	@Column('boolean', {
		default: true,
	})
	public disableRegistration: boolean;

	@Column('varchar', {
		length: 1024, array: true, default: '{}',
	})
	public langs: string[];

	@Column('varchar', {
		length: 1024, array: true, default: '{}',
	})
	public pinnedUsers: string[];

	@Column('varchar', {
		length: 1024, array: true, default: '{}',
	})
	public hiddenTags: string[];

	@Column('varchar', {
		length: 1024, array: true, default: '{}',
	})
	public blockedHosts: string[];

	@Column('varchar', {
		length: 1024, array: true, default: '{}',
	})
	public sensitiveWords: string[];

	@Column('varchar', {
		length: 1024, array: true, default: '{}',
	})
	public prohibitedWords: string[];

	@Column('varchar', {
		length: 1024, array: true, default: '{}',
	})
	public prohibitedWordsForNameOfUser: string[];

	@Column('varchar', {
		length: 1024, array: true, default: '{}',
	})
	public silencedHosts: string[];

	@Column('varchar', {
		length: 1024, array: true, default: '{}',
	})
	public mediaSilencedHosts: string[];

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public themeColor: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public mascotImageUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public bannerUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public backgroundImageUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public logoImageUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public iconUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public app192IconUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public app512IconUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public serverErrorImageUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public notFoundImageUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public infoImageUrl: string | null;

	@Column('boolean', {
		default: false,
	})
	public cacheRemoteFiles: boolean;

	@Column('boolean', {
		default: true,
	})
	public cacheRemoteSensitiveFiles: boolean;

	@Column('boolean', {
		default: false,
	})
	public emailRequiredForSignup: boolean;

	@Column('boolean', {
		default: false,
	})
	public enableHcaptcha: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public hcaptchaSiteKey: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public hcaptchaSecretKey: string | null;

	@Column('boolean', {
		default: false,
	})
	public enableMcaptcha: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public mcaptchaSitekey: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public mcaptchaSecretKey: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public mcaptchaInstanceUrl: string | null;

	@Column('boolean', {
		default: false,
	})
	public enableRecaptcha: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public recaptchaSiteKey: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public recaptchaSecretKey: string | null;

	@Column('boolean', {
		default: false,
	})
	public enableTurnstile: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public turnstileSiteKey: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public turnstileSecretKey: string | null;

	@Column('boolean', {
		default: false,
	})
	public enableAliyunCaptcha: boolean;

	@Column('varchar', {
		length: 128,
		nullable: true,
	})
	public aliyunCaptchaPrefix: string | null;

	@Column('varchar', {
		length: 128,
		nullable: true,
	})
	public aliyunCaptchaSceneId: string | null;

	@Column('varchar', {
		length: 16,
		nullable: true,
	})
	public aliyunCaptchaRegion: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public aliyunCaptchaAccessKeyId: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public aliyunCaptchaAccessKeySecret: string | null;

	@Column('boolean', {
		default: false,
	})
	public enableTestcaptcha: boolean;

	// chaptcha系を追加した際にはnodeinfoのレスポンスに追加するのを忘れないようにすること

	@Column('enum', {
		enum: ['none', 'all', 'local', 'remote'],
		default: 'none',
	})
	public sensitiveMediaDetection: 'none' | 'all' | 'local' | 'remote';

	@Column('enum', {
		enum: ['medium', 'low', 'high', 'veryLow', 'veryHigh'],
		default: 'medium',
	})
	public sensitiveMediaDetectionSensitivity: 'medium' | 'low' | 'high' | 'veryLow' | 'veryHigh';

	@Column('boolean', {
		default: false,
	})
	public setSensitiveFlagAutomatically: boolean;

	@Column('boolean', {
		default: false,
	})
	public enableSensitiveMediaDetectionForVideos: boolean;

	@Column('boolean', {
		default: false,
	})
	public enableEmail: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public email: string | null;

	@Column('boolean', {
		default: false,
	})
	public smtpSecure: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public smtpHost: string | null;

	@Column('integer', {
		nullable: true,
	})
	public smtpPort: number | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public smtpUser: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public smtpPass: string | null;

	@Column('boolean', {
		default: false,
	})
	public enableServiceWorker: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public swPublicKey: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public swPrivateKey: string | null;

	/** 阿里云 OpenAPI（移动推送）AccessKey ID，管理员面板配置 */
	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public aliyunMobilePushAccessKeyId: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public aliyunMobilePushAccessKeySecret: string | null;

	/** EMAS 应用 AppKey（与客户端 aliyun-emas-services.json 中 emas.appKey 一致） */
	@Column('varchar', {
		length: 64,
		nullable: true,
	})
	public aliyunMobilePushAppKey: string | null;

	/** 阿里云移动推送总开关：关闭后不再下发阿里云离线推送，也拒绝新设备注册 */
	@Column('boolean', {
		default: true,
	})
	public enableAliyunMobilePush: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public deeplAuthKey: string | null;

	@Column('boolean', {
		default: false,
	})
	public deeplIsPro: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public termsOfServiceUrl: string | null;

	@Column('varchar', {
		length: 1024,
		default: 'https://github.com/misskey-dev/misskey',
		nullable: true,
	})
	public repositoryUrl: string | null;

	@Column('varchar', {
		length: 1024,
		default: 'https://github.com/misskey-dev/misskey/issues/new',
		nullable: true,
	})
	public feedbackUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public impressumUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public privacyPolicyUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public inquiryUrl: string | null;

	@Column('varchar', {
		length: 8192,
		nullable: true,
	})
	public defaultLightTheme: string | null;

	@Column('varchar', {
		length: 8192,
		nullable: true,
	})
	public defaultDarkTheme: string | null;

	@Column('boolean', {
		default: false,
	})
	public useObjectStorage: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public objectStorageBucket: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public objectStoragePrefix: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public objectStorageBaseUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public objectStorageEndpoint: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public objectStorageRegion: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public objectStorageAccessKey: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public objectStorageSecretKey: string | null;

	@Column('integer', {
		nullable: true,
	})
	public objectStoragePort: number | null;

	@Column('boolean', {
		default: true,
	})
	public objectStorageUseSSL: boolean;

	@Column('boolean', {
		default: true,
	})
	public objectStorageUseProxy: boolean;

	@Column('boolean', {
		default: false,
	})
	public objectStorageSetPublicRead: boolean;

	@Column('boolean', {
		default: true,
	})
	public objectStorageS3ForcePathStyle: boolean;

	@Column('boolean', {
		default: false,
	})
	public objectStorageForceHttps: boolean;

	@Column('boolean', {
		default: false,
	})
	public enableIpLogging: boolean;

	@Column('boolean', {
		default: true,
	})
	public enableActiveEmailValidation: boolean;

	@Column('boolean', {
		default: false,
	})
	public enableVerifymailApi: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public verifymailAuthKey: string | null;

	@Column('boolean', {
		default: false,
	})
	public enableTruemailApi: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public truemailInstance: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public truemailAuthKey: string | null;

	@Column('boolean', {
		default: true,
	})
	public enableChartsForRemoteUser: boolean;

	@Column('boolean', {
		default: true,
	})
	public enableChartsForFederatedInstances: boolean;

	@Column('boolean', {
		default: true,
	})
	public enableStatsForFederatedInstances: boolean;

	@Column('boolean', {
		default: false,
	})
	public enableServerMachineStats: boolean;

	@Column('boolean', {
		default: true,
	})
	public enableIdenticonGeneration: boolean;

	@Column('jsonb', {
		default: { },
	})
	public policies: Record<string, any>;

	@Column('varchar', {
		length: 280,
		array: true,
		default: '{}',
	})
	public serverRules: string[];

	@Column('varchar', {
		length: 8192,
		default: '{}',
	})
	public manifestJsonOverride: string;

	@Column('varchar', {
		length: 1024,
		array: true,
		default: '{}',
	})
	public bannedEmailDomains: string[];

	@Column('varchar', {
		length: 1024, array: true, default: ['admin', 'administrator', 'root', 'system', 'maintainer', 'host', 'mod', 'moderator', 'owner', 'superuser', 'staff', 'auth', 'i', 'me', 'everyone', 'all', 'mention', 'mentions', 'example', 'user', 'users', 'account', 'accounts', 'official', 'help', 'helps', 'support', 'supports', 'info', 'information', 'informations', 'announce', 'announces', 'announcement', 'announcements', 'notice', 'notification', 'notifications', 'dev', 'developer', 'developers', 'tech', 'misskey'],
	})
	public preservedUsernames: string[];

	@Column('boolean', {
		default: true,
	})
	public enableFanoutTimeline: boolean;

	@Column('boolean', {
		default: true,
	})
	public enableFanoutTimelineDbFallback: boolean;

	@Column('integer', {
		default: 300,
	})
	public perLocalUserUserTimelineCacheMax: number;

	@Column('integer', {
		default: 100,
	})
	public perRemoteUserUserTimelineCacheMax: number;

	@Column('integer', {
		default: 300,
	})
	public perUserHomeTimelineCacheMax: number;

	@Column('integer', {
		default: 300,
	})
	public perUserListTimelineCacheMax: number;

	@Column('boolean', {
		default: false,
	})
	public enableReactionsBuffering: boolean;

	@Column('integer', {
		default: 0,
	})
	public notesPerOneAd: number;

	@Column('boolean', {
		default: true,
	})
	public urlPreviewEnabled: boolean;

	@Column('boolean', {
		default: true,
	})
	public urlPreviewAllowRedirect: boolean;

	@Column('integer', {
		default: 10000,
	})
	public urlPreviewTimeout: number;

	@Column('bigint', {
		default: 1024 * 1024 * 10,
	})
	public urlPreviewMaximumContentLength: number;

	@Column('boolean', {
		default: false,
	})
	public urlPreviewRequireContentLength: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public urlPreviewSummaryProxyUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
		default: null,
	})
	public urlPreviewUserAgent: string | null;

	@Column('varchar', {
		length: 128,
		default: 'none',
	})
	public federation: 'all' | 'specified' | 'none';

	@Column('varchar', {
		length: 1024,
		array: true,
		default: '{}',
	})
	public federationHosts: string[];

	@Column('varchar', {
		length: 128,
		default: 'local',
	})
	public ugcVisibilityForVisitor: 'all' | 'local' | 'none';

	@Column('varchar', {
		length: 64,
		nullable: true,
	})
	public googleAnalyticsMeasurementId: string | null;

	@Column('jsonb', {
		default: [],
	})
	public deliverSuspendedSoftware: SoftwareSuspension[];

	@Column('boolean', {
		default: false,
	})
	public singleUserMode: boolean;

	@Column('boolean', {
		default: true,
	})
	public proxyRemoteFiles: boolean;

	@Column('boolean', {
		default: true,
	})
	public signToActivityPubGet: boolean;

	@Column('boolean', {
		default: true,
	})
	public allowExternalApRedirect: boolean;

	@Column('boolean', {
		default: false,
	})
	public enableRemoteNotesCleaning: boolean;

	@Column('integer', {
		default: 60, // minutes
	})
	public remoteNotesCleaningMaxProcessingDurationInMinutes: number;

	@Column('integer', {
		default: 90, // days
	})
	public remoteNotesCleaningExpiryDaysForEachNotes: number;

	@Column('boolean', {
		default: false,
	})
	public showRoleBadgesOfRemoteUsers: boolean;

	@Column('jsonb', {
		default: { },
	})
	public clientOptions: {
		entrancePageStyle: 'classic' | 'simple';
		showTimelineForVisitor: boolean;
		showActivitiesForVisitor: boolean;
	};

	@Column('jsonb', {
		default: { },
	})
	public nativeClientAppInfo: MiNativeClientAppInfo;

	@Column('boolean', {
		default: false,
	})
	public agentFeatureEnabled: boolean;

	@Column('text', {
		nullable: true,
	})
	public agentGlobalSystemPrompt: string | null;

	@Column('varchar', {
		length: 512, nullable: true,
	})
	public agentOpenaiCompatibleBaseUrl: string | null;

	@Column('text', {
		nullable: true,
	})
	public agentOpenaiCompatibleApiKey: string | null;

	@Column('varchar', {
		length: 256, nullable: true,
	})
	public agentModelDisplayName: string | null;

	@Column('varchar', {
		length: 2048, nullable: true,
	})
	public agentModelDescription: string | null;

	@Column('varchar', {
		length: 256, nullable: true,
	})
	public agentModelApiName: string | null;

	/** 多模型配置（JSON）；每条含独立 Base URL、Key、用量；无全局回退 */
	@Column('jsonb', {
		nullable: true,
	})
	public agentLlmModels: Array<{
		id: string;
		name: string;
		description?: string | null;
		apiModelName: string;
		baseUrl: string;
		apiKey: string;
		maxContextTokens: number;
		maxOutputTokensPerCall: number;
		/** 下架后仅保留在控制面板；对用户侧与新会话不可见 */
		unlisted?: boolean;
		/** 所属模型分组 id（引用 agentLlmModelGroups）；空/无表示未分组 */
		groupId?: string | null;
		/** 每次成功或中断调用扣费金额，默认 0；失败不扣费。usage 模式下为 usage 缺失时的兜底按次价 */
		costPerCall?: number;
		/** 计费模式：per_call 按次（缺省）；usage 按量（token 数取自响应 usage 字段） */
		billingMode?: 'per_call' | 'usage';
		/** 每百万输入 token（缓存命中）单价（usage 模式） */
		pricePerMillionInputCacheHitTokens?: number;
		/** 每百万输入 token（缓存未命中）单价（usage 模式） */
		pricePerMillionInputCacheMissTokens?: number;
		/** 每百万输出 token 单价（usage 模式） */
		pricePerMillionOutputTokens?: number;
		/** 高峰时段价格倍率（DeepSeek 峰谷定价：高峰时段所有计费项 ×N）；undefined/1 不启用，官方默认 2，取值 [1, 10] */
		peakPriceMultiplier?: number;
		/** 每 token 对应字符数的估算比率，默认 3 */
		charsPerToken?: number;
		/** token 编码器标识：tiktoken 内置编码名（如 "cl100k_base"）、"gemini:<型号>" 精确分词，
		 * 或 "glm:/deepseek:/claude:<型号>" 兼容近似；为空则使用字符估算 */
		tokenizerEncoding?: string;
		/** 每日免费调用次数；0/无则无免费额度 */
		dailyFreeQuota?: number;
	}> | null;

	/** 模型分组（JSON）：仅含 id 与展示名，数组顺序即用户侧 tab 顺序 */
	@Column('jsonb', {
		nullable: true,
	})
	public agentLlmModelGroups: Array<{
		id: string;
		name: string;
	}> | null;

	@Column('varchar', {
		length: 64, nullable: true,
	})
	public agentDefaultModelId: string | null;

	/** 压缩便签侧车调用的默认逻辑模型 id；空则与会话主模型或站点默认一致 */
	@Column('varchar', {
		length: 64, nullable: true,
	})
	public agentCompressionDefaultModelId: string | null;

	/** 是否启用 BYOK（用户自带 API Key 自定义模型） */
	@Column('boolean', {
		default: false,
	})
	public agentByokEnabled: boolean;

	/** BYOK 半设置提供商模板：管理员预置连接信息，用户只需填自己的 Key */
	@Column('jsonb', {
		nullable: true,
	})
	public agentByokProviders: Array<{
		id: string;
		name: string;
		description?: string | null;
		baseUrl: string;
		apiModelName?: string | null;
		maxContextTokens?: number;
		maxOutputTokensPerCall?: number;
		tokenizerEncoding?: string | null;
		charsPerToken?: number;
	}> | null;

	/** 每用户自定义模型数量上限 */
	@Column('integer', {
		default: 20,
	})
	public agentByokMaxUserModels: number;

	@Column('integer', {
		default: 8192,
	})
	public agentMaxContextTokens: number;

	@Column('integer', {
		default: 2048,
	})
	public agentMaxOutputTokensPerCall: number;

	/** 智能体长期记忆总开关（阿里云百炼 Memory API） */
	@Column('boolean', {
		default: false,
	})
	public agentMem0Enabled: boolean;

	@Column('text', {
		nullable: true,
	})
	public agentMem0ApiKey: string | null;

	/** 可选；空则 https://dashscope.aliyuncs.com */
	@Column('varchar', {
		length: 512, nullable: true,
	})
	public agentMem0ApiBaseUrl: string | null;

	/** 百炼记忆库 memory_library_id（控制台记忆库卡片） */
	@Column('varchar', {
		length: 128, nullable: true,
	})
	public agentMem0OrgId: string | null;

	/** 预留（记忆片段规则等），当前可不填 */
	@Column('varchar', {
		length: 128, nullable: true,
	})
	public agentMem0ProjectId: string | null;

	@Column('integer', {
		default: 8,
	})
	public agentMem0TopK: number;

	@Column('integer', {
		default: 4000,
	})
	public agentMem0InjectMaxChars: number;

	/** 调用百炼 add 记忆时上传最近若干轮「用户+助手」完整对话（至少 1，默认 3） */
	@Column('integer', {
		default: 3,
	})
	public agentMem0AddMemoryMaxRounds: number;

	/** 每完成多少轮「用户+助手」对话才触发一次 add 记忆（至少 1，默认 1=每轮都写） */
	@Column('integer', {
		default: 1,
	})
	public agentMem0AddMemoryEveryNRounds: number;

	/**
	 * 侧车 LLM 压缩便签的 system 提示；空则使用内置默认
	 */
	@Column('text', {
		nullable: true,
	})
	public agentCompressionSystemPrompt: string | null;

	/**
	 * 送入压缩模型的对话节录最大字符数（节录在服务端截断）
	 */
	@Column('integer', {
		default: 12000,
	})
	public agentCompressionMaxInputChars: number;

	/**
	 * 压缩补全的 max_tokens 上限
	 */
	@Column('integer', {
		default: 2048,
	})
	public agentCompressionMaxOutputTokens: number;

	/**
	 * 压缩区带：预备区上界 = t1Ratio × H（对对话历史滑窗预算 H）。空则 0.8
	 */
	@Column('double precision', {
		nullable: true,
	})
	public agentCompressionBandT1Ratio: number | null;

	/**
	 * 压缩区带：预备区下界 = t2Ratio × H。空则 0.9；须 t1 < t2
	 */
	@Column('double precision', {
		nullable: true,
	})
	public agentCompressionBandT2Ratio: number | null;

	@Column('boolean', {
		default: false,
	})
	public agentImageGenerationEnabled: boolean;

	@Column('varchar', {
		length: 512,
		default: 'https://love.auroralove.cc',
	})
	public agentImageBaseUrl: string;

	@Column('jsonb', {
		default: [],
	})
	public agentImageTokens: MiAgentImageToken[];

	@Column('jsonb', {
		default: [],
	})
	public agentImageModels: MiAgentImageModel[];

	@Column('jsonb', {
		default: [],
	})
	public agentVisionModels: MiAgentVisionModel[];

	@Column('varchar', {
		length: 128,
		nullable: true,
	})
	public agentVisionDefaultModelId: string | null;

	@Column('jsonb', {
		default: [],
	})
	public agentImageArtistPresets: MiAgentImageArtistPreset[];

	@Column('varchar', {
		length: 128,
		default: 'nai-diffusion-4-5-full',
	})
	public agentImageDefaultModel: string;

	@Column('jsonb', {
		default: {},
	})
	public agentImageDefaultParams: MiAgentImageDefaultParams;

	@Column('text', {
		nullable: true,
	})
	public agentImageDefaultNegativePrompt: string | null;

	@Column('integer', {
		default: 2,
	})
	public agentImageMaxPerReply: number;

	@Column('double precision', {
		default: 0,
	})
	public agentImageCostPerCall: number;

	@Column('varchar', {
		length: 128,
		nullable: true,
	})
	public agentImageDefaultArtistPresetId: string | null;

	@Column('integer', {
		default: 1,
	})
	public agentImageTokenMinPoints: number;

	@Column('integer', {
		default: 300,
	})
	public agentImageTokenBalanceTtlSeconds: number;

	@Column('boolean', {
		default: false,
	})
	public agentExternalAuditEnabled: boolean;

	@Column('jsonb', {
		default: [],
	})
	public agentExternalAuditModels: MiAgentExternalAuditModel[];

	@Column('integer', {
		default: 10000,
	})
	public agentExternalAuditTimeoutMs: number;

	@Column('integer', {
		default: 60,
	})
	public agentExternalAuditFailureThresholdPercent: number;

	@Column('integer', {
		default: 10,
	})
	public agentExternalAuditFailureMinRequests: number;

	@Column('text', {
		nullable: true,
	})
	public agentExternalAuditNotifyEmails: string | null;

	@Column('text', {
		nullable: true,
	})
	public agentExternalAuditSystemPrompt: string | null;

	/** 外审复审触发条件规则列表 */
	@Column('jsonb', {
		default: [],
	})
	public agentReviewTriggerRules: MiAgentReviewTriggerRule[];

	@Column('jsonb', {
		nullable: true,
		default: null,
	})
	public agentCheckinSettings: AgentCheckinSettings | null;

	/** 卡密购买链接；未配置时前端不展示购买入口 */
	@Column('varchar', {
		length: 1024, nullable: true,
		default: null,
	})
	public agentRedeemPurchaseUrl: string | null;

	/** 新建会话时随机主动消息是否默认开启 */
	@Column('boolean', {
		default: false,
	})
	public agentProactiveRandomDefaultEnabled: boolean;

	/** 新建会话时定时主动消息是否默认开启 */
	@Column('boolean', {
		default: false,
	})
	public agentProactiveScheduledDefaultEnabled: boolean;

	/** 随机主动消息最小静默时间（分钟），默认 30 */
	@Column('integer', {
		default: 30,
	})
	public agentProactiveMinSilenceMinutes: number;

	/** 随机主动消息最大等待窗口（分钟），默认 1410（23.5 小时） */
	@Column('integer', {
		default: 1410,
	})
	public agentProactiveMaxWindowMinutes: number;

	/** 随机主动消息白天权重倍率（08:00–22:00 北京时间），默认 3 */
	@Column('integer', {
		default: 3,
	})
	public agentProactiveDaytimeWeight: number;

	/** 随机主动消息近期偏好系数，1=均匀分布，越大越偏向近期，默认 1 */
	@Column('integer', {
		default: 1,
	})
	public agentProactiveRecencyBias: number;

	/** Aliya 智能体角色 ID；配置后对应会话会展示 Aliya Web 推荐横幅与常驻板块 */
	@Column('varchar', {
		length: 256, nullable: true,
		default: null,
	})
	public agentAliyaCharacterId: string | null;

	/** Aliya Web 跳转地址 */
	@Column('varchar', {
		length: 1024, nullable: true,
		default: null,
	})
	public agentAliyaWebUrl: string | null;

	/** 额度迁移系统授权 Key 的 SHA-256 哈希 */
	@Column('varchar', {
		length: 128, nullable: true,
		default: null,
	})
	public agentMigrationKeyHash: string | null;
}

export type AgentCheckinSettings = {
	enabled: boolean;
	streakMaxDays: number;
	streakMaxMultiplier: number;
	specialDayMultiplier: number;
	specialDays: string[];
	roleMultipliers: Record<string, number>;
	makeupEnabled: boolean;
	makeupMaxPerMonth: number;
	makeupBaseCost: number;
	makeupCostIncrement: number;
	makeupAllowedWindowDays: number;
};

export type SoftwareSuspension = {
	software: string,
	versionRange: string,
};
