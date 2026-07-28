/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentImageArtistPresets1773900000000 {
	name = 'AgentImageArtistPresets1773900000000'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentImageArtistPresets" jsonb NOT NULL DEFAULT '[]'`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentImageArtistPresets"`);
	}
}
