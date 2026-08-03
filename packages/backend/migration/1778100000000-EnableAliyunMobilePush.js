/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class EnableAliyunMobilePush1778100000000 {
	name = 'EnableAliyunMobilePush1778100000000';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" ADD "enableAliyunMobilePush" boolean NOT NULL DEFAULT true`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "enableAliyunMobilePush"`);
	}
}
