/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddAliyunCaptchaMeta1771800000000 {
	name = 'AddAliyunCaptchaMeta1771800000000';

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" ADD "enableAliyunCaptcha" boolean NOT NULL DEFAULT false`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "aliyunCaptchaPrefix" character varying(128)`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "aliyunCaptchaSceneId" character varying(128)`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "aliyunCaptchaRegion" character varying(16)`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "aliyunCaptchaAccessKeyId" character varying(1024)`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "aliyunCaptchaAccessKeySecret" character varying(1024)`);
	}

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "aliyunCaptchaAccessKeySecret"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "aliyunCaptchaAccessKeyId"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "aliyunCaptchaRegion"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "aliyunCaptchaSceneId"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "aliyunCaptchaPrefix"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "enableAliyunCaptcha"`);
	}
}
