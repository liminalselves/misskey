export class AgentProactiveMessages1775000000000 {
	name = 'AgentProactiveMessages1775000000000';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_session" ADD "randomProactiveEnabled" boolean NOT NULL DEFAULT false`);
		await queryRunner.query(`ALTER TABLE "agent_session" ADD "scheduledProactiveEnabled" boolean NOT NULL DEFAULT false`);
		await queryRunner.query(`ALTER TABLE "agent_session" ADD "randomProactiveAt" TIMESTAMP WITH TIME ZONE`);
		await queryRunner.query(`ALTER TABLE "agent_session" ADD "randomProactiveNeedsUserMessage" boolean NOT NULL DEFAULT false`);
		await queryRunner.query(`ALTER TABLE "agent_message" ADD "rawContent" text`);
		await queryRunner.query(`ALTER TABLE "agent_message" ADD "proactiveScheduleControlRaw" text`);
		await queryRunner.query(`ALTER TABLE "agent_message" ADD "proactiveScheduleControlError" jsonb`);
		await queryRunner.query(`ALTER TABLE "agent_message" ADD "isInternal" boolean NOT NULL DEFAULT false`);
		await queryRunner.query(`
			CREATE TABLE "agent_proactive_schedule" (
				"id" character varying(32) NOT NULL,
				"sessionId" character varying(32) NOT NULL,
				"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
				"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
				"status" character varying(32) NOT NULL DEFAULT 'active',
				"description" character varying(80) NOT NULL,
				"trigger" jsonb NOT NULL,
				"nextRunAt" TIMESTAMP WITH TIME ZONE,
				"lastRunAt" TIMESTAMP WITH TIME ZONE,
				"remainingRuns" integer,
				CONSTRAINT "PK_agent_proactive_schedule_id" PRIMARY KEY ("id"),
				CONSTRAINT "FK_agent_proactive_schedule_session" FOREIGN KEY ("sessionId") REFERENCES "agent_session"("id") ON DELETE CASCADE
			)
		`);
		await queryRunner.query(`CREATE INDEX "IDX_agent_proactive_schedule_session_status_next_run" ON "agent_proactive_schedule" ("sessionId", "status", "nextRunAt")`);
	}

	async down(queryRunner) {
		await queryRunner.query(`DROP INDEX "public"."IDX_agent_proactive_schedule_session_status_next_run"`);
		await queryRunner.query(`DROP TABLE "agent_proactive_schedule"`);
		await queryRunner.query(`ALTER TABLE "agent_message" DROP COLUMN "isInternal"`);
		await queryRunner.query(`ALTER TABLE "agent_message" DROP COLUMN "proactiveScheduleControlError"`);
		await queryRunner.query(`ALTER TABLE "agent_message" DROP COLUMN "proactiveScheduleControlRaw"`);
		await queryRunner.query(`ALTER TABLE "agent_message" DROP COLUMN "rawContent"`);
		await queryRunner.query(`ALTER TABLE "agent_session" DROP COLUMN "randomProactiveNeedsUserMessage"`);
		await queryRunner.query(`ALTER TABLE "agent_session" DROP COLUMN "randomProactiveAt"`);
		await queryRunner.query(`ALTER TABLE "agent_session" DROP COLUMN "scheduledProactiveEnabled"`);
		await queryRunner.query(`ALTER TABLE "agent_session" DROP COLUMN "randomProactiveEnabled"`);
	}
}
