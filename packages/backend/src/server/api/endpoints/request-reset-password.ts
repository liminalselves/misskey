/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { IsNull } from 'typeorm';
import { Inject, Injectable } from '@nestjs/common';
import type { MiMeta, PasswordResetRequestsRepository, UserProfilesRepository, UsersRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { IdService } from '@/core/IdService.js';
import type { Config } from '@/config.js';
import { DI } from '@/di-symbols.js';
import { EmailService } from '@/core/EmailService.js';
import { CaptchaService } from '@/core/CaptchaService.js';
import { L_CHARS, secureRndstr } from '@/misc/secure-rndstr.js';
import { ApiError } from '../error.js';

export const meta = {
	tags: ['reset password'],

	requireCredential: false,

	description: 'Request a users password to be reset.',

	limit: {
		duration: ms('1hour'),
		max: 3,
	},

	errors: {
		captchaVerificationFailed: {
			message: 'Captcha verification failed.',
			code: 'CAPTCHA_VERIFICATION_FAILED',
			id: 'a6af4bbf-8f60-4bbf-8b5f-2d1f6fce6d45',
			httpStatusCode: 400,
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		username: { type: 'string' },
		email: { type: 'string' },
		'hcaptcha-response': { type: 'string', nullable: true },
		'm-captcha-response': { type: 'string', nullable: true },
		'g-recaptcha-response': { type: 'string', nullable: true },
		'turnstile-response': { type: 'string', nullable: true },
		'aliyun-captcha-response': { type: 'string', nullable: true },
		'testcaptcha-response': { type: 'string', nullable: true },
	},
	required: ['username', 'email'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.meta)
		private serverSettings: MiMeta,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		@Inject(DI.passwordResetRequestsRepository)
		private passwordResetRequestsRepository: PasswordResetRequestsRepository,

		private idService: IdService,
		private emailService: EmailService,
		private captchaService: CaptchaService,
	) {
		super(meta, paramDef, async (ps, me) => {
			if (process.env.NODE_ENV !== 'test') {
				if (this.serverSettings.enableHcaptcha && this.serverSettings.hcaptchaSecretKey) {
					await this.captchaService.verifyHcaptcha(this.serverSettings.hcaptchaSecretKey, ps['hcaptcha-response']).catch(() => {
						throw new ApiError(meta.errors.captchaVerificationFailed);
					});
				}

				if (this.serverSettings.enableMcaptcha && this.serverSettings.mcaptchaSecretKey && this.serverSettings.mcaptchaSitekey && this.serverSettings.mcaptchaInstanceUrl) {
					await this.captchaService.verifyMcaptcha(this.serverSettings.mcaptchaSecretKey, this.serverSettings.mcaptchaSitekey, this.serverSettings.mcaptchaInstanceUrl, ps['m-captcha-response']).catch(() => {
						throw new ApiError(meta.errors.captchaVerificationFailed);
					});
				}

				if (this.serverSettings.enableRecaptcha && this.serverSettings.recaptchaSecretKey) {
					await this.captchaService.verifyRecaptcha(this.serverSettings.recaptchaSecretKey, ps['g-recaptcha-response']).catch(() => {
						throw new ApiError(meta.errors.captchaVerificationFailed);
					});
				}

				if (this.serverSettings.enableTurnstile && this.serverSettings.turnstileSecretKey) {
					await this.captchaService.verifyTurnstile(this.serverSettings.turnstileSecretKey, ps['turnstile-response']).catch(() => {
						throw new ApiError(meta.errors.captchaVerificationFailed);
					});
				}

				if (this.serverSettings.enableAliyunCaptcha && this.serverSettings.aliyunCaptchaAccessKeyId && this.serverSettings.aliyunCaptchaAccessKeySecret && this.serverSettings.aliyunCaptchaSceneId) {
					await this.captchaService.verifyAliyunCaptcha(
						this.serverSettings.aliyunCaptchaAccessKeyId,
						this.serverSettings.aliyunCaptchaAccessKeySecret,
						this.serverSettings.aliyunCaptchaRegion ?? 'cn',
						this.serverSettings.aliyunCaptchaSceneId,
						ps['aliyun-captcha-response'],
					).catch(() => {
						throw new ApiError(meta.errors.captchaVerificationFailed);
					});
				}

				if (this.serverSettings.enableTestcaptcha) {
					await this.captchaService.verifyTestcaptcha(ps['testcaptcha-response']).catch(() => {
						throw new ApiError(meta.errors.captchaVerificationFailed);
					});
				}
			}

			const user = await this.usersRepository.findOneBy({
				usernameLower: ps.username.toLowerCase(),
				host: IsNull(),
			});

			// 合致するユーザーが登録されていなかったら無視
			if (user == null) {
				return;
			}

			const profile = await this.userProfilesRepository.findOneByOrFail({ userId: user.id });
			const registeredEmail = profile.email?.trim() ?? null;
			const requestedEmail = ps.email.trim();

			// 合致するメアドが登録されていなかったら無視
			if (registeredEmail == null || registeredEmail.toLowerCase() !== requestedEmail.toLowerCase()) {
				return;
			}

			// メアドが認証されていなかったら無視
			if (!profile.emailVerified) {
				return;
			}

			const token = secureRndstr(64, { chars: L_CHARS });

			await this.passwordResetRequestsRepository.insert({
				id: this.idService.gen(),
				userId: profile.userId,
				token,
			});

			const link = `${this.config.url}/reset-password/${token}`;

			this.emailService.sendEmail(registeredEmail, '密码重置请求 / Password reset requested',
				`请点击以下链接重置密码：<br><a href="${link}">${link}</a><br><br>To reset password, please click this link:<br><a href="${link}">${link}</a>`,
				`请点击以下链接重置密码：${link}\n\nTo reset password, please click this link: ${link}`);
		});
	}
}
