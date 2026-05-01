/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentRedeemCode1772200000000 {
	name = 'AgentRedeemCode1772200000000';

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		await queryRunner.query(`CREATE TABLE "agent_redeem_code" (
			"id" character varying(32) NOT NULL,
			"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
			"code" character varying(32) NOT NULL,
			"creditAmount" double precision NOT NULL,
			"note" character varying(256) NOT NULL DEFAULT '',
			"createdById" character varying(32) NOT NULL,
			"expiresAt" TIMESTAMP WITH TIME ZONE,
			"redeemedAt" TIMESTAMP WITH TIME ZONE,
			"redeemedById" character varying(32),
			"revoked" boolean NOT NULL DEFAULT false,
			CONSTRAINT "PK_agent_redeem_code" PRIMARY KEY ("id")
		)`);
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_agent_redeem_code_code" ON "agent_redeem_code" ("code")`);
		await queryRunner.query(`CREATE INDEX "IDX_agent_redeem_code_created" ON "agent_redeem_code" ("createdAt")`);
		await queryRunner.query(`CREATE INDEX "IDX_agent_redeem_code_redeemed" ON "agent_redeem_code" ("redeemedById")`);
	}

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		await queryRunner.query(`DROP INDEX "IDX_agent_redeem_code_redeemed"`);
		await queryRunner.query(`DROP INDEX "IDX_agent_redeem_code_created"`);
		await queryRunner.query(`DROP INDEX "IDX_agent_redeem_code_code"`);
		await queryRunner.query(`DROP TABLE "agent_redeem_code"`);
	}
}
