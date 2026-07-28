/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentVisionMessages1775500000000 {
	name = 'AgentVisionMessages1775500000000';

	async up(queryRunner) {
		await queryRunner.query('ALTER TABLE "agent_session" ADD "agentVisionModelId" character varying(128)');
		await queryRunner.query('ALTER TABLE "agent_message" ADD "imageFileId" character varying(128)');
		await queryRunner.query('ALTER TABLE "agent_message" ADD "imageRecognitionStatus" character varying(16)');
		await queryRunner.query('ALTER TABLE "agent_message" ADD "imageRecognitionDescription" text');
		await queryRunner.query('ALTER TABLE "meta" ADD "agentVisionModels" jsonb NOT NULL DEFAULT \'[]\'');
		await queryRunner.query('ALTER TABLE "meta" ADD "agentVisionDefaultModelId" character varying(128)');
	}

	async down(queryRunner) {
		await queryRunner.query('ALTER TABLE "meta" DROP COLUMN "agentVisionDefaultModelId"');
		await queryRunner.query('ALTER TABLE "meta" DROP COLUMN "agentVisionModels"');
		await queryRunner.query('ALTER TABLE "agent_message" DROP COLUMN "imageRecognitionDescription"');
		await queryRunner.query('ALTER TABLE "agent_message" DROP COLUMN "imageRecognitionStatus"');
		await queryRunner.query('ALTER TABLE "agent_message" DROP COLUMN "imageFileId"');
		await queryRunner.query('ALTER TABLE "agent_session" DROP COLUMN "agentVisionModelId"');
	}
}
