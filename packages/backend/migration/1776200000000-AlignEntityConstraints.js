/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Aligns the database schema with entity definitions by adding auto-named
 * indexes and foreign keys that TypeORM expects but were never created by
 * previous migrations (which used custom names for some constraints).
 */
export class AlignEntityConstraints1776200000000 {
	name = 'AlignEntityConstraints1776200000000';

	async up(queryRunner) {
		// --- Missing standalone indexes (from @Index() on columns) ---
		await queryRunner.query(`CREATE INDEX "IDX_7853aba49635c117d8ecf187ee" ON "agent_session" ("userId")`);
		await queryRunner.query(`CREATE INDEX "IDX_35913775addd5e60ebd11474ee" ON "agent_message" ("sessionId")`);
		await queryRunner.query(`CREATE INDEX "IDX_6c604417697c034197e31fc93d" ON "agent_proactive_schedule" ("sessionId")`);

		// --- Missing foreign keys (from @ManyToOne + @JoinColumn) ---
		// NOT VALID: 不校验已有数据（生产库可能存在孤儿引用），仅约束新写入
		await queryRunner.query(`ALTER TABLE "agent_character" ADD CONSTRAINT "FK_60820b70ee4fb918cd34c85780b" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION NOT VALID`);
		await queryRunner.query(`ALTER TABLE "agent_dialogue_style" ADD CONSTRAINT "FK_830f63897bd4558466c1f6acfab" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION NOT VALID`);
		await queryRunner.query(`ALTER TABLE "agent_session" ADD CONSTRAINT "FK_7853aba49635c117d8ecf187eea" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION NOT VALID`);
		await queryRunner.query(`ALTER TABLE "agent_session" ADD CONSTRAINT "FK_caff8eba6769db1a16908f9aeaa" FOREIGN KEY ("characterId") REFERENCES "agent_character"("id") ON DELETE CASCADE ON UPDATE NO ACTION NOT VALID`);
		await queryRunner.query(`ALTER TABLE "agent_session" ADD CONSTRAINT "FK_3ce6f23f223c6a307daab77c1c3" FOREIGN KEY ("dialogueStyleId") REFERENCES "agent_dialogue_style"("id") ON DELETE CASCADE ON UPDATE NO ACTION NOT VALID`);
		await queryRunner.query(`ALTER TABLE "agent_user_style_subscription" ADD CONSTRAINT "FK_dfc23fba244e4fda622e0f05597" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION NOT VALID`);
		await queryRunner.query(`ALTER TABLE "agent_user_style_subscription" ADD CONSTRAINT "FK_3c5f6224d1d18867d51fae837fe" FOREIGN KEY ("styleId") REFERENCES "agent_dialogue_style"("id") ON DELETE CASCADE ON UPDATE NO ACTION NOT VALID`);
		await queryRunner.query(`ALTER TABLE "agent_model_usage_log" ADD CONSTRAINT "FK_c7131662110cd9fbb9f0a258f41" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION NOT VALID`);
		await queryRunner.query(`ALTER TABLE "agent_redeem_code" ADD CONSTRAINT "FK_ae86921388b4b0f086f1cfa3df2" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION NOT VALID`);
		await queryRunner.query(`ALTER TABLE "agent_redeem_code" ADD CONSTRAINT "FK_86e589e8bf7e387b8ef6eb6f1aa" FOREIGN KEY ("redeemedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION NOT VALID`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_redeem_code" DROP CONSTRAINT "FK_86e589e8bf7e387b8ef6eb6f1aa"`);
		await queryRunner.query(`ALTER TABLE "agent_redeem_code" DROP CONSTRAINT "FK_ae86921388b4b0f086f1cfa3df2"`);
		await queryRunner.query(`ALTER TABLE "agent_model_usage_log" DROP CONSTRAINT "FK_c7131662110cd9fbb9f0a258f41"`);
		await queryRunner.query(`ALTER TABLE "agent_user_style_subscription" DROP CONSTRAINT "FK_3c5f6224d1d18867d51fae837fe"`);
		await queryRunner.query(`ALTER TABLE "agent_user_style_subscription" DROP CONSTRAINT "FK_dfc23fba244e4fda622e0f05597"`);
		await queryRunner.query(`ALTER TABLE "agent_session" DROP CONSTRAINT "FK_3ce6f23f223c6a307daab77c1c3"`);
		await queryRunner.query(`ALTER TABLE "agent_session" DROP CONSTRAINT "FK_caff8eba6769db1a16908f9aeaa"`);
		await queryRunner.query(`ALTER TABLE "agent_session" DROP CONSTRAINT "FK_7853aba49635c117d8ecf187eea"`);
		await queryRunner.query(`ALTER TABLE "agent_dialogue_style" DROP CONSTRAINT "FK_830f63897bd4558466c1f6acfab"`);
		await queryRunner.query(`ALTER TABLE "agent_character" DROP CONSTRAINT "FK_60820b70ee4fb918cd34c85780b"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_6c604417697c034197e31fc93d"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_35913775addd5e60ebd11474ee"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_7853aba49635c117d8ecf187ee"`);
	}
}
