/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentCharacterReferenceImages1775400000000 {
	name = 'AgentCharacterReferenceImages1775400000000';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_character" ADD "referenceImageFileIds" jsonb NOT NULL DEFAULT '[]'`);
		await queryRunner.query(`UPDATE "agent_character" SET "referenceImageFileIds" = CASE WHEN "referenceImageFileId" IS NULL THEN '[]'::jsonb ELSE jsonb_build_array("referenceImageFileId") END`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_character" DROP COLUMN "referenceImageFileIds"`);
	}
}
