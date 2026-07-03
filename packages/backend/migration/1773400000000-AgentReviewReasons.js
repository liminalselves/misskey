/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentReviewReasons1773400000000 {
	name = 'AgentReviewReasons1773400000000';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_character" ADD "reviewRejectReason" character varying(64)`);
		await queryRunner.query(`ALTER TABLE "agent_character" ADD "reviewRejectMessage" text`);
		await queryRunner.query(`ALTER TABLE "agent_character" ADD "reviewInternalNote" text`);
		await queryRunner.query(`ALTER TABLE "agent_dialogue_style" ADD "reviewRejectReason" character varying(64)`);
		await queryRunner.query(`ALTER TABLE "agent_dialogue_style" ADD "reviewRejectMessage" text`);
		await queryRunner.query(`ALTER TABLE "agent_dialogue_style" ADD "reviewInternalNote" text`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_dialogue_style" DROP COLUMN "reviewInternalNote"`);
		await queryRunner.query(`ALTER TABLE "agent_dialogue_style" DROP COLUMN "reviewRejectMessage"`);
		await queryRunner.query(`ALTER TABLE "agent_dialogue_style" DROP COLUMN "reviewRejectReason"`);
		await queryRunner.query(`ALTER TABLE "agent_character" DROP COLUMN "reviewInternalNote"`);
		await queryRunner.query(`ALTER TABLE "agent_character" DROP COLUMN "reviewRejectMessage"`);
		await queryRunner.query(`ALTER TABLE "agent_character" DROP COLUMN "reviewRejectReason"`);
	}
}
