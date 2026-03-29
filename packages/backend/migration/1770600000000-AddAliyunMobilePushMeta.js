/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddAliyunMobilePushMeta1770600000000 {
	name = 'AddAliyunMobilePushMeta1770600000000';

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" ADD "aliyunMobilePushAccessKeyId" character varying(1024)`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "aliyunMobilePushAccessKeySecret" character varying(1024)`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "aliyunMobilePushAppKey" character varying(64)`);
	}

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "aliyunMobilePushAppKey"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "aliyunMobilePushAccessKeySecret"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "aliyunMobilePushAccessKeyId"`);
	}
}
