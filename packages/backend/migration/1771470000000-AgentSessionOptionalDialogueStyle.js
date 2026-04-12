/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentSessionOptionalDialogueStyle1771470000000 {
	name = 'AgentSessionOptionalDialogueStyle1771470000000';

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_session" ALTER COLUMN "dialogueStyleId" DROP NOT NULL`);
	}

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		await queryRunner.query(`
			DELETE FROM "agent_message" WHERE "sessionId" IN (
				SELECT "id" FROM "agent_session" WHERE "dialogueStyleId" IS NULL
			)
		`);
		await queryRunner.query(`DELETE FROM "agent_session" WHERE "dialogueStyleId" IS NULL`);
		await queryRunner.query(`ALTER TABLE "agent_session" ALTER COLUMN "dialogueStyleId" SET NOT NULL`);
	}
}
