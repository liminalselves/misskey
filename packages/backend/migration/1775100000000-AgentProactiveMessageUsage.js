export class AgentProactiveMessageUsage1775100000000 {
	name = 'AgentProactiveMessageUsage1775100000000';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_model_usage_log" ALTER COLUMN "usageKind" TYPE character varying(32)`);
		await queryRunner.query(`ALTER TABLE "agent_session" ADD "randomProactiveLastError" jsonb`);
		await queryRunner.query(`ALTER TABLE "agent_session" ADD "scheduledProactiveLastError" jsonb`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_session" DROP COLUMN "scheduledProactiveLastError"`);
		await queryRunner.query(`ALTER TABLE "agent_session" DROP COLUMN "randomProactiveLastError"`);
		await queryRunner.query(`UPDATE "agent_model_usage_log" SET "usageKind" = 'chat' WHERE "usageKind" IN ('proactive_random', 'proactive_scheduled')`);
		await queryRunner.query(`ALTER TABLE "agent_model_usage_log" ALTER COLUMN "usageKind" TYPE character varying(16)`);
	}
}
