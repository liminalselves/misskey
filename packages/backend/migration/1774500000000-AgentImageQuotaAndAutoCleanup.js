/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentImageQuotaAndAutoCleanup1774500000000 {
    name = 'AgentImageQuotaAndAutoCleanup1774500000000'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "agent_image_generation" ADD "autoCleanedAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "agent_image_generation" ADD "autoCleanedReason" character varying(128)`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "agent_image_generation" DROP COLUMN "autoCleanedReason"`);
        await queryRunner.query(`ALTER TABLE "agent_image_generation" DROP COLUMN "autoCleanedAt"`);
    }
}
