/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentCompressionBandRatiosMeta1772800000000 {
	name = 'AgentCompressionBandRatiosMeta1772800000000';

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentCompressionBandT1Ratio" double precision`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentCompressionBandT2Ratio" double precision`);
	}

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentCompressionBandT1Ratio"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentCompressionBandT2Ratio"`);
	}
}
