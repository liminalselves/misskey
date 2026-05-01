/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddAgentCompressionMeta1772500000000 {
	name = 'AddAgentCompressionMeta1772500000000';

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentCompressionSystemPrompt" text`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentCompressionMaxInputChars" integer NOT NULL DEFAULT 12000`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentCompressionMaxOutputTokens" integer NOT NULL DEFAULT 2048`);
	}

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentCompressionMaxOutputTokens"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentCompressionMaxInputChars"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentCompressionSystemPrompt"`);
	}
}
