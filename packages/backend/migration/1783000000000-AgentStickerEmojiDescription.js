/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentStickerEmojiDescription1783000000000 {
	name = 'AgentStickerEmojiDescription1783000000000';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "emoji" ADD "agentDescription" varchar(200)`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentStickerEnabled" boolean NOT NULL DEFAULT false`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentStickerMaxPerMessage" integer NOT NULL DEFAULT 3`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentEmojiPromptMaxCount" integer NOT NULL DEFAULT 200`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentEmojiPromptMaxCount"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentStickerMaxPerMessage"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentStickerEnabled"`);
		await queryRunner.query(`ALTER TABLE "emoji" DROP COLUMN "agentDescription"`);
	}
}
