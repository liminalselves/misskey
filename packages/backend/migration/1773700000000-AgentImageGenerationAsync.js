export class AgentImageGenerationAsync1773700000000 {
	name = 'AgentImageGenerationAsync1773700000000'

	async up(queryRunner) {
		await queryRunner.query(`CREATE TABLE "agent_image_generation" ("id" character varying(32) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "userId" character varying(32) NOT NULL, "sessionId" character varying(32) NOT NULL, "messageId" character varying(32) NOT NULL, "characterId" character varying(32), "dialogueStyleId" character varying(32), "placeholderIndex" integer NOT NULL, "tag" text NOT NULL, "size" character varying(16) NOT NULL, "provider" character varying(32) NOT NULL, "imageModelId" character varying(128) NOT NULL, "status" character varying(32) NOT NULL, "fileId" character varying(32), "url" character varying(1024), "errorCode" character varying(128), "cost" double precision NOT NULL DEFAULT '0', "regenerationOfId" character varying(32), "isBlocked" boolean NOT NULL DEFAULT false, "blockedReason" character varying(256), "blockedByUserId" character varying(32), "blockedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_agent_image_generation_id" PRIMARY KEY ("id"))`);
		await queryRunner.query(`CREATE INDEX "IDX_agent_image_generation_message_placeholder" ON "agent_image_generation" ("messageId", "placeholderIndex")`);
		await queryRunner.query(`CREATE INDEX "IDX_agent_image_generation_user_created" ON "agent_image_generation" ("userId", "createdAt")`);
		await queryRunner.query(`CREATE INDEX "IDX_agent_image_generation_status_created" ON "agent_image_generation" ("status", "createdAt")`);
		await queryRunner.query(`CREATE INDEX "IDX_agent_image_generation_blocked_created" ON "agent_image_generation" ("isBlocked", "createdAt")`);
		await queryRunner.query(`ALTER TABLE "agent_image_generation" ADD CONSTRAINT "FK_agent_image_generation_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
		await queryRunner.query(`ALTER TABLE "agent_image_generation" ADD CONSTRAINT "FK_agent_image_generation_session" FOREIGN KEY ("sessionId") REFERENCES "agent_session"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
		await queryRunner.query(`ALTER TABLE "agent_image_generation" ADD CONSTRAINT "FK_agent_image_generation_message" FOREIGN KEY ("messageId") REFERENCES "agent_message"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_image_generation" DROP CONSTRAINT "FK_agent_image_generation_message"`);
		await queryRunner.query(`ALTER TABLE "agent_image_generation" DROP CONSTRAINT "FK_agent_image_generation_session"`);
		await queryRunner.query(`ALTER TABLE "agent_image_generation" DROP CONSTRAINT "FK_agent_image_generation_user"`);
		await queryRunner.query(`DROP INDEX "IDX_agent_image_generation_blocked_created"`);
		await queryRunner.query(`DROP INDEX "IDX_agent_image_generation_status_created"`);
		await queryRunner.query(`DROP INDEX "IDX_agent_image_generation_user_created"`);
		await queryRunner.query(`DROP INDEX "IDX_agent_image_generation_message_placeholder"`);
		await queryRunner.query(`DROP TABLE "agent_image_generation"`);
	}
}
