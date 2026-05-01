/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class UserSuspendedUntil1772700000000 {
	name = 'UserSuspendedUntil1772700000000';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "user" ADD "suspendedUntil" TIMESTAMP WITH TIME ZONE`);
		await queryRunner.query(`CREATE INDEX "IDX_user_suspendedUntil" ON "user" ("suspendedUntil") WHERE "suspendedUntil" IS NOT NULL`);
	}

	async down(queryRunner) {
		await queryRunner.query(`DROP INDEX "public"."IDX_user_suspendedUntil"`);
		await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "suspendedUntil"`);
	}
}
