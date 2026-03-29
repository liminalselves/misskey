/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class MobilePushDevice1770500000000 {
	name = 'MobilePushDevice1770500000000';

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		await queryRunner.query(`CREATE TABLE "mobile_push_device" ("id" character varying(32) NOT NULL, "userId" character varying(32) NOT NULL, "deviceId" character varying(256) NOT NULL, "platform" character varying(16) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(), CONSTRAINT "PK_mobile_push_device" PRIMARY KEY ("id"))`);
		await queryRunner.query(`CREATE INDEX "IDX_mobile_push_device_userId" ON "mobile_push_device" ("userId")`);
		await queryRunner.query(`CREATE UNIQUE INDEX "UQ_mobile_push_device_user_device" ON "mobile_push_device" ("userId", "deviceId")`);
		await queryRunner.query(`ALTER TABLE "mobile_push_device" ADD CONSTRAINT "FK_mobile_push_device_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
	}

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "mobile_push_device" DROP CONSTRAINT "FK_mobile_push_device_user"`);
		await queryRunner.query(`DROP INDEX "public"."UQ_mobile_push_device_user_device"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_mobile_push_device_userId"`);
		await queryRunner.query(`DROP TABLE "mobile_push_device"`);
	}
}
