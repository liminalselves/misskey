/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * Replaces removed migration 1771000000000-AgentLongMemoryMeta.js.
 * IF NOT EXISTS / IF EXISTS keep this safe whether an older DB ran 177100 or not.
 */

export class AgentMem0MetaColumns1771250000000 {
	name = 'AgentMem0MetaColumns1771250000000';

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" ADD COLUMN IF NOT EXISTS "agentMem0Enabled" boolean NOT NULL DEFAULT false`);
		await queryRunner.query(`ALTER TABLE "meta" ADD COLUMN IF NOT EXISTS "agentMem0ApiKey" text`);
		await queryRunner.query(`ALTER TABLE "meta" ADD COLUMN IF NOT EXISTS "agentMem0ApiBaseUrl" character varying(512)`);
		await queryRunner.query(`ALTER TABLE "meta" ADD COLUMN IF NOT EXISTS "agentMem0OrgId" character varying(128)`);
		await queryRunner.query(`ALTER TABLE "meta" ADD COLUMN IF NOT EXISTS "agentMem0ProjectId" character varying(128)`);
		await queryRunner.query(`ALTER TABLE "meta" ADD COLUMN IF NOT EXISTS "agentMem0TopK" integer NOT NULL DEFAULT 8`);
		await queryRunner.query(`ALTER TABLE "meta" ADD COLUMN IF NOT EXISTS "agentMem0InjectMaxChars" integer NOT NULL DEFAULT 4000`);
	}

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN IF EXISTS "agentMem0InjectMaxChars"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN IF EXISTS "agentMem0TopK"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN IF EXISTS "agentMem0ProjectId"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN IF EXISTS "agentMem0OrgId"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN IF EXISTS "agentMem0ApiBaseUrl"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN IF EXISTS "agentMem0ApiKey"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN IF EXISTS "agentMem0Enabled"`);
	}
}
