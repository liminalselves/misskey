/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Brackets } from 'typeorm';
import { Inject, Injectable } from '@nestjs/common';
import JSON5 from 'json5';
import type { Packed } from '@/misc/json-schema.js';
import type { MiMeta } from '@/models/Meta.js';
import type { AdsRepository } from '@/models/_.js';
import { MAX_NOTE_TEXT_LENGTH } from '@/const.js';
import { bindThis } from '@/decorators.js';
import { SystemAccountService } from '@/core/SystemAccountService.js';
import type { Config } from '@/config.js';
import { DI } from '@/di-symbols.js';
import { DEFAULT_POLICIES } from '@/core/RoleService.js';
import { getActiveLlmModels, getAgentLlmModelGroups, isAgentLlmRunnable, packPublicAgentModels, packedAgentMaxContextTokens, packedAgentMaxOutputTokensPerCall } from '@/misc/agent-llm-models.js';

@Injectable()
export class MetaEntityService {
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.adsRepository)
		private adsRepository: AdsRepository,

		private systemAccountService: SystemAccountService,
	) { }

	@bindThis
	public async pack(meta?: MiMeta): Promise<Packed<'MetaLite'>> {
		let instance = meta;

		if (!instance) {
			instance = this.meta;
		}

		const ads = await this.adsRepository.createQueryBuilder('ads')
			.where('ads.expiresAt > :now', { now: new Date() })
			.andWhere('ads.startsAt <= :now', { now: new Date() })
			.andWhere(new Brackets(qb => {
				// 曜日のビットフラグを確認する
				qb.where('ads.dayOfWeek & :dayOfWeek > 0', { dayOfWeek: 1 << new Date().getDay() })
					.orWhere('ads.dayOfWeek = 0');
			}))
			.getMany();

		// クライアントの手間を減らすためあらかじめJSONに変換しておく
		let defaultLightTheme = null;
		let defaultDarkTheme = null;
		if (instance.defaultLightTheme) {
			try {
				defaultLightTheme = JSON.stringify(JSON5.parse(instance.defaultLightTheme));
			} catch (_) {
			}
		}
		if (instance.defaultDarkTheme) {
			try {
				defaultDarkTheme = JSON.stringify(JSON5.parse(instance.defaultDarkTheme));
			} catch (_) {
			}
		}

		const effAgentModels = getActiveLlmModels(instance);
		const defAgentModelId = instance.agentDefaultModelId?.trim() || effAgentModels[0]?.id || null;
		const defAgentModel = defAgentModelId ? effAgentModels.find(m => m.id === defAgentModelId) ?? effAgentModels[0] : effAgentModels[0];

		const packed: Packed<'MetaLite'> = {
			maintainerName: instance.maintainerName,
			maintainerEmail: instance.maintainerEmail,

			version: this.config.version,
			providesTarball: this.config.publishTarballInsteadOfProvideRepositoryUrl,

			name: instance.name,
			shortName: instance.shortName,
			uri: this.config.url,
			description: instance.description,
			langs: instance.langs,
			tosUrl: instance.termsOfServiceUrl,
			repositoryUrl: instance.repositoryUrl,
			feedbackUrl: instance.feedbackUrl,
			impressumUrl: instance.impressumUrl,
			privacyPolicyUrl: instance.privacyPolicyUrl,
			inquiryUrl: instance.inquiryUrl,
			disableRegistration: instance.disableRegistration,
			emailRequiredForSignup: instance.emailRequiredForSignup,
			enableHcaptcha: instance.enableHcaptcha,
			hcaptchaSiteKey: instance.hcaptchaSiteKey,
			enableMcaptcha: instance.enableMcaptcha,
			mcaptchaSiteKey: instance.mcaptchaSitekey,
			mcaptchaInstanceUrl: instance.mcaptchaInstanceUrl,
			enableRecaptcha: instance.enableRecaptcha,
			recaptchaSiteKey: instance.recaptchaSiteKey,
			enableTurnstile: instance.enableTurnstile,
			turnstileSiteKey: instance.turnstileSiteKey,
			enableAliyunCaptcha: instance.enableAliyunCaptcha,
			aliyunCaptchaPrefix: instance.aliyunCaptchaPrefix,
			aliyunCaptchaSceneId: instance.aliyunCaptchaSceneId,
			aliyunCaptchaRegion: instance.aliyunCaptchaRegion,
			enableTestcaptcha: instance.enableTestcaptcha,
			googleAnalyticsMeasurementId: instance.googleAnalyticsMeasurementId,
			swPublickey: instance.swPublicKey,
			themeColor: instance.themeColor,
			mascotImageUrl: instance.mascotImageUrl ?? '/assets/ai.png',
			bannerUrl: instance.bannerUrl,
			infoImageUrl: instance.infoImageUrl,
			serverErrorImageUrl: instance.serverErrorImageUrl,
			notFoundImageUrl: instance.notFoundImageUrl,
			iconUrl: instance.iconUrl,
			backgroundImageUrl: instance.backgroundImageUrl,
			logoImageUrl: instance.logoImageUrl,
			maxNoteTextLength: MAX_NOTE_TEXT_LENGTH,
			defaultLightTheme,
			defaultDarkTheme,
			clientOptions: instance.clientOptions,
			ads: ads.map(ad => ({
				id: ad.id,
				url: ad.url,
				place: ad.place,
				ratio: ad.ratio,
				imageUrl: ad.imageUrl,
				dayOfWeek: ad.dayOfWeek,
				isSensitive: ad.isSensitive ? true : undefined,
			})),
			notesPerOneAd: instance.notesPerOneAd,
			enableEmail: instance.enableEmail,
			enableServiceWorker: instance.enableServiceWorker,

			translatorAvailable: instance.deeplAuthKey != null,

			serverRules: instance.serverRules,

			policies: { ...DEFAULT_POLICIES, ...instance.policies },

			sentryForFrontend: this.config.sentryForFrontend ?? null,
			mediaProxy: this.config.mediaProxy,
			enableUrlPreview: instance.urlPreviewEnabled,
			noteSearchableScope: (this.config.meilisearch == null || this.config.meilisearch.scope !== 'local') ? 'global' : 'local',
			maxFileSize: this.config.maxFileSize,
			federation: instance.federation,
			nativeClientAppInfo: (() => {
				const n = instance.nativeClientAppInfo ?? {};
				return {
					latestAndroidVersion: n.latestAndroidVersion ?? null,
					latestIosVersion: n.latestIosVersion ?? null,
					minRequiredAppVersion: n.minRequiredAppVersion ?? null,
					androidDownloadUrl: n.androidDownloadUrl ?? null,
					iosDownloadUrl: n.iosDownloadUrl ?? null,
					changelog: Array.isArray(n.changelog) ? n.changelog : [],
					announcement: n.announcement ?? null,
				};
			})(),
			agentFeatureEnabled: instance.agentFeatureEnabled,
			agentModelDisplayName: defAgentModel?.name ?? null,
			agentModelDescription: defAgentModel?.description ?? null,
			agentMaxContextTokens: packedAgentMaxContextTokens(instance),
			agentMaxOutputTokensPerCall: packedAgentMaxOutputTokensPerCall(instance),
			agentModels: packPublicAgentModels(instance),
			// 模型分组（有序名称列表，供用户侧模型 tab 导航；顺序即本数组顺序）
			agentLlmModelGroups: getAgentLlmModelGroups(instance).map(g => g.name),
			agentDefaultModelId: instance.agentDefaultModelId ?? effAgentModels[0]?.id ?? null,
			agentByokEnabled: instance.agentByokEnabled === true,
			agentByokProviders: instance.agentByokProviders ?? null,
			agentByokMaxUserModels: Math.max(1, Math.min(500, instance.agentByokMaxUserModels ?? 20)),
			agentCompressionDefaultModelId: (() => {
				const t = instance.agentCompressionDefaultModelId?.trim();
				if (t) {
					const hit = getActiveLlmModels(instance).find(m => m.id === t);
					if (hit) return t;
				}
				return null;
			})(),
			agentRedeemPurchaseUrl: instance.agentRedeemPurchaseUrl ?? null,
			agentLlmConfigured: isAgentLlmRunnable(instance),
			agentImageGenerationEnabled: instance.agentImageGenerationEnabled === true,
			agentImageConfigured: instance.agentImageGenerationEnabled === true && Array.isArray(instance.agentImageTokens) && instance.agentImageTokens.some(t => t.enabled !== false && typeof t.token === 'string' && t.token.trim().length > 0),
			agentImageDefaultModel: instance.agentImageDefaultModel,
			agentImageMaxPerReply: instance.agentImageMaxPerReply,
			agentStickerEnabled: instance.agentStickerEnabled === true,
			agentStickerMaxPerMessage: instance.agentStickerMaxPerMessage,
			agentImageCostPerCall: instance.agentImageCostPerCall,
			agentLongMemoryConfigured: instance.agentMem0Enabled === true && (instance.agentMem0ApiKey?.trim().length ?? 0) > 0,
			agentMem0AddMemoryMaxRounds: (() => {
				const v = Math.trunc(Number(instance.agentMem0AddMemoryMaxRounds));
				if (!Number.isFinite(v)) return 3;
				return Math.max(1, Math.min(24, v));
			})(),
			agentMem0AddMemoryEveryNRounds: (() => {
				const v = Math.trunc(Number(instance.agentMem0AddMemoryEveryNRounds));
				if (!Number.isFinite(v)) return 1;
				return Math.max(1, Math.min(48, v));
			})(),
			agentProactiveMinSilenceMinutes: (() => {
				const v = Math.trunc(Number(instance.agentProactiveMinSilenceMinutes));
				if (!Number.isFinite(v)) return 30;
				return Math.max(5, Math.min(1440, v));
			})(),
			agentProactiveMaxWindowMinutes: (() => {
				const v = Math.trunc(Number(instance.agentProactiveMaxWindowMinutes));
				if (!Number.isFinite(v)) return 1410;
				return Math.max(30, Math.min(10080, v));
			})(),
			agentProactiveDaytimeWeight: (() => {
				const v = Math.trunc(Number(instance.agentProactiveDaytimeWeight));
				if (!Number.isFinite(v)) return 3;
				return Math.max(1, Math.min(10, v));
			})(),
			agentProactiveRecencyBias: (() => {
				const v = Math.trunc(Number(instance.agentProactiveRecencyBias));
				if (!Number.isFinite(v)) return 1;
				return Math.max(1, Math.min(10, v));
			})(),
			agentAliyaCharacterId: instance.agentAliyaCharacterId ?? null,
			agentAliyaWebUrl: instance.agentAliyaWebUrl ?? null,
		};

		return packed;
	}

	@bindThis
	public async packDetailed(meta?: MiMeta): Promise<Packed<'MetaDetailed'>> {
		let instance = meta;

		if (!instance) {
			instance = this.meta;
		}

		const packed = await this.pack(instance);

		const proxyAccount = await this.systemAccountService.fetch('proxy');

		const packDetailed: Packed<'MetaDetailed'> = {
			...packed,
			cacheRemoteFiles: instance.cacheRemoteFiles,
			cacheRemoteSensitiveFiles: instance.cacheRemoteSensitiveFiles,
			requireSetup: this.meta.rootUserId == null,
			proxyAccountName: proxyAccount.username,
			features: {
				localTimeline: instance.policies.ltlAvailable,
				globalTimeline: instance.policies.gtlAvailable,
				registration: !instance.disableRegistration,
				emailRequiredForSignup: instance.emailRequiredForSignup,
				hcaptcha: instance.enableHcaptcha,
				recaptcha: instance.enableRecaptcha,
				turnstile: instance.enableTurnstile,
				aliyuncaptcha: instance.enableAliyunCaptcha,
				objectStorage: instance.useObjectStorage,
				serviceWorker: instance.enableServiceWorker,
				miauth: true,
			},
		};

		return packDetailed;
	}
}
