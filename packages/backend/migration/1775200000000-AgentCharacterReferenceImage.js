/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentCharacterReferenceImage1775200000000 {
	name = 'AgentCharacterReferenceImage1775200000000';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_character" ADD "referenceImageFileId" character varying(128)`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_character" DROP COLUMN "referenceImageFileId"`);
	}
}
