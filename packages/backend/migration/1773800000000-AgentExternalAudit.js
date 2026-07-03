export class AgentExternalAudit1773800000000 {
	name = 'AgentExternalAudit1773800000000'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentExternalAuditEnabled" boolean NOT NULL DEFAULT false`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentExternalAuditModels" jsonb NOT NULL DEFAULT '[]'::jsonb`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentExternalAuditTimeoutMs" integer NOT NULL DEFAULT 10000`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentExternalAuditFailureThresholdPercent" integer NOT NULL DEFAULT 60`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentExternalAuditFailureMinRequests" integer NOT NULL DEFAULT 10`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentExternalAuditNotifyEmails" text`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentExternalAuditSystemPrompt" text`);
		await queryRunner.query(`CREATE TABLE "agent_external_audit_log" ("id" character varying(32) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "completedAt" TIMESTAMP WITH TIME ZONE, "durationMs" integer, "userId" character varying(32), "sessionId" character varying(32), "characterId" character varying(32), "dialogueStyleId" character varying(32), "modelId" character varying(64), "modelName" character varying(256), "apiModelName" character varying(256), "baseUrl" character varying(512), "priority" integer NOT NULL, "attemptIndex" integer NOT NULL, "status" character varying(32) NOT NULL, "blockCode" character varying(64), "category" character varying(128), "reason" character varying(1024), "confidence" double precision, "userText" text, "assistantText" text, "responseText" text, "errorCode" character varying(128), "errorMessage" character varying(1024), CONSTRAINT "PK_agent_external_audit_log" PRIMARY KEY ("id"))`);
		await queryRunner.query(`CREATE INDEX "IDX_agent_external_audit_log_created_at" ON "agent_external_audit_log" ("createdAt")`);
		await queryRunner.query(`CREATE INDEX "IDX_agent_external_audit_log_model_created_at" ON "agent_external_audit_log" ("modelId", "createdAt")`);
		await queryRunner.query(`CREATE INDEX "IDX_agent_external_audit_log_status_created_at" ON "agent_external_audit_log" ("status", "createdAt")`);
		await queryRunner.query(`CREATE INDEX "IDX_agent_external_audit_log_block_code" ON "agent_external_audit_log" ("blockCode")`);
		await queryRunner.query(`CREATE INDEX "IDX_agent_external_audit_log_user_created_at" ON "agent_external_audit_log" ("userId", "createdAt")`);
		await queryRunner.query(`CREATE INDEX "IDX_agent_external_audit_log_session_created_at" ON "agent_external_audit_log" ("sessionId", "createdAt")`);
		await queryRunner.query(`ALTER TABLE "agent_external_audit_log" ADD CONSTRAINT "FK_agent_external_audit_log_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
		await queryRunner.query(`ALTER TABLE "agent_external_audit_log" ADD CONSTRAINT "FK_agent_external_audit_log_session" FOREIGN KEY ("sessionId") REFERENCES "agent_session"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
		await queryRunner.query(`ALTER TABLE "agent_external_audit_log" ADD CONSTRAINT "FK_agent_external_audit_log_character" FOREIGN KEY ("characterId") REFERENCES "agent_character"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
		await queryRunner.query(`ALTER TABLE "agent_external_audit_log" ADD CONSTRAINT "FK_agent_external_audit_log_dialogue_style" FOREIGN KEY ("dialogueStyleId") REFERENCES "agent_dialogue_style"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_external_audit_log" DROP CONSTRAINT "FK_agent_external_audit_log_dialogue_style"`);
		await queryRunner.query(`ALTER TABLE "agent_external_audit_log" DROP CONSTRAINT "FK_agent_external_audit_log_character"`);
		await queryRunner.query(`ALTER TABLE "agent_external_audit_log" DROP CONSTRAINT "FK_agent_external_audit_log_session"`);
		await queryRunner.query(`ALTER TABLE "agent_external_audit_log" DROP CONSTRAINT "FK_agent_external_audit_log_user"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_agent_external_audit_log_session_created_at"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_agent_external_audit_log_user_created_at"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_agent_external_audit_log_block_code"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_agent_external_audit_log_status_created_at"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_agent_external_audit_log_model_created_at"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_agent_external_audit_log_created_at"`);
		await queryRunner.query(`DROP TABLE "agent_external_audit_log"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentExternalAuditSystemPrompt"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentExternalAuditNotifyEmails"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentExternalAuditFailureMinRequests"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentExternalAuditFailureThresholdPercent"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentExternalAuditTimeoutMs"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentExternalAuditModels"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentExternalAuditEnabled"`);
	}
}
