/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddUserAppPush1771900000000 {
    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user_profile" ADD "enableAppPush" boolean NOT NULL DEFAULT false`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user_profile" DROP COLUMN "enableAppPush"`);
    }
}
