/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentModelAnnouncements1784500000000 {
	name = 'AgentModelAnnouncements1784500000000';

	async up(queryRunner) {
		await queryRunner.query(`CREATE TABLE "agent_model_announcement" (
			"id" character varying(32) NOT NULL,
			"createdAt" timestamp with time zone NOT NULL,
			"scope" character varying(16) NOT NULL,
			"title" character varying(256) NOT NULL,
			"text" text NOT NULL,
			"changes" jsonb NOT NULL DEFAULT '[]'::jsonb,
			CONSTRAINT "PK_agent_model_announcement" PRIMARY KEY ("id")
		)`);
	}

	async down(queryRunner) {
		await queryRunner.query('DROP TABLE "agent_model_announcement"');
	}
}
