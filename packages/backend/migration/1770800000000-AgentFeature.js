/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentFeature1770800000000 {
	name = 'AgentFeature1770800000000';

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentFeatureEnabled" boolean NOT NULL DEFAULT false`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentGlobalSystemPrompt" text`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentOpenaiCompatibleBaseUrl" character varying(512)`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentOpenaiCompatibleApiKey" text`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentModelDisplayName" character varying(256)`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentModelDescription" character varying(2048)`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentModelApiName" character varying(256)`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentMaxContextTokens" integer NOT NULL DEFAULT '8192'`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentMaxOutputTokensPerCall" integer NOT NULL DEFAULT '2048'`);

		await queryRunner.query(`
			CREATE TABLE "agent_character" (
				"id" character varying(32) NOT NULL,
				"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
				"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
				"userId" character varying(32) NOT NULL,
				"name" character varying(256) NOT NULL,
				"summary" character varying(512),
				"personality" text NOT NULL DEFAULT '',
				"background" text NOT NULL DEFAULT '',
				"speakingStyle" text NOT NULL DEFAULT '',
				"greeting" text NOT NULL DEFAULT '',
				"exampleDialogue" text NOT NULL DEFAULT '',
				"forbiddenBehavior" text NOT NULL DEFAULT '',
				"isPublished" boolean NOT NULL DEFAULT false,
				"avatarFileId" character varying(32),
				CONSTRAINT "PK_agent_character" PRIMARY KEY ("id")
			)
		`);
		await queryRunner.query(`CREATE INDEX "IDX_agent_character_userId" ON "agent_character" ("userId")`);
		await queryRunner.query(`CREATE INDEX "IDX_agent_character_published_updated" ON "agent_character" ("isPublished", "updatedAt")`);

		await queryRunner.query(`
			CREATE TABLE "agent_dialogue_style" (
				"id" character varying(32) NOT NULL,
				"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
				"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
				"userId" character varying(32) NOT NULL,
				"name" character varying(256) NOT NULL,
				"body" text NOT NULL DEFAULT '',
				"isPublished" boolean NOT NULL DEFAULT false,
				CONSTRAINT "PK_agent_dialogue_style" PRIMARY KEY ("id")
			)
		`);
		await queryRunner.query(`CREATE INDEX "IDX_agent_dialogue_style_userId" ON "agent_dialogue_style" ("userId")`);
		await queryRunner.query(`CREATE INDEX "IDX_agent_dialogue_style_published_updated" ON "agent_dialogue_style" ("isPublished", "updatedAt")`);

		await queryRunner.query(`
			CREATE TABLE "agent_session" (
				"id" character varying(32) NOT NULL,
				"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
				"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
				"userId" character varying(32) NOT NULL,
				"name" character varying(256) NOT NULL,
				"characterId" character varying(32) NOT NULL,
				"dialogueStyleId" character varying(32) NOT NULL,
				"characterOwnerId" character varying(32) NOT NULL,
				"sessionKind" character varying(32) NOT NULL,
				"lastMessageAt" TIMESTAMP WITH TIME ZONE,
				CONSTRAINT "PK_agent_session" PRIMARY KEY ("id")
			)
		`);
		await queryRunner.query(`CREATE INDEX "IDX_agent_session_userId_lastMessage" ON "agent_session" ("userId", "lastMessageAt")`);
		await queryRunner.query(`CREATE INDEX "IDX_agent_session_characterId" ON "agent_session" ("characterId")`);

		await queryRunner.query(`
			CREATE TABLE "agent_message" (
				"id" character varying(32) NOT NULL,
				"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
				"sessionId" character varying(32) NOT NULL,
				"role" character varying(32) NOT NULL,
				"content" text NOT NULL,
				"promptTokens" integer,
				"completionTokens" integer,
				CONSTRAINT "PK_agent_message" PRIMARY KEY ("id")
			)
		`);
		await queryRunner.query(`CREATE INDEX "IDX_agent_message_session_created" ON "agent_message" ("sessionId", "createdAt")`);
	}

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		await queryRunner.query(`DROP INDEX "public"."IDX_agent_message_session_created"`);
		await queryRunner.query(`DROP TABLE "agent_message"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_agent_session_characterId"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_agent_session_userId_lastMessage"`);
		await queryRunner.query(`DROP TABLE "agent_session"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_agent_dialogue_style_published_updated"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_agent_dialogue_style_userId"`);
		await queryRunner.query(`DROP TABLE "agent_dialogue_style"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_agent_character_published_updated"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_agent_character_userId"`);
		await queryRunner.query(`DROP TABLE "agent_character"`);

		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentMaxOutputTokensPerCall"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentMaxContextTokens"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentModelApiName"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentModelDescription"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentModelDisplayName"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentOpenaiCompatibleApiKey"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentOpenaiCompatibleBaseUrl"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentGlobalSystemPrompt"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentFeatureEnabled"`);
	}
}
