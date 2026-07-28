/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class UserSuspensionReason1774900000000 {
	name = 'UserSuspensionReason1774900000000'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "user" ADD "suspensionReason" character varying(2048)`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "suspensionReason"`);
	}
}
