/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class RoleCheckinMultiplier1775900000000 {
	name = 'RoleCheckinMultiplier1775900000000';

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "role" ADD IF NOT EXISTS "checkinMultiplier" double precision`);
	}

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "role" DROP COLUMN IF EXISTS "checkinMultiplier"`);
	}
}
