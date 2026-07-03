/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentImageGeneration1773500000000 {
	name = 'AgentImageGeneration1773500000000';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentImageGenerationEnabled" boolean NOT NULL DEFAULT false`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentImageBaseUrl" character varying(512) NOT NULL DEFAULT 'https://love.auroralove.cc'`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentImageTokens" jsonb NOT NULL DEFAULT '[]'::jsonb`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentImageDefaultModel" character varying(128) NOT NULL DEFAULT 'nai-diffusion-4-5-full'`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentImageDefaultParams" jsonb NOT NULL DEFAULT '{}'::jsonb`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentImageDefaultNegativePrompt" text`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentImageMaxPerReply" integer NOT NULL DEFAULT 2`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentImageCostPerCall" double precision NOT NULL DEFAULT 0`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentImageDefaultArtistPresetId" character varying(128)`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentImageTokenMinPoints" integer NOT NULL DEFAULT 1`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentImageTokenBalanceTtlSeconds" integer NOT NULL DEFAULT 300`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentImageTokenBalanceTtlSeconds"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentImageTokenMinPoints"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentImageDefaultArtistPresetId"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentImageCostPerCall"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentImageMaxPerReply"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentImageDefaultNegativePrompt"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentImageDefaultParams"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentImageDefaultModel"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentImageTokens"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentImageBaseUrl"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentImageGenerationEnabled"`);
	}
}
