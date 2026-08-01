/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentAliyaPromotion1778000000000 {
	name = 'AgentAliyaPromotion1778000000000';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentAliyaCharacterId" character varying(256)`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentAliyaWebUrl" character varying(1024)`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentAliyaWebUrl"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentAliyaCharacterId"`);
	}
}
