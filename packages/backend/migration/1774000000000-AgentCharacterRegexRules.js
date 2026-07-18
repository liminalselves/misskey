export class AgentCharacterRegexRules1774000000000 {
	name = 'AgentCharacterRegexRules1774000000000';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_character" ADD "regexRules" jsonb NOT NULL DEFAULT '[]'::jsonb`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_character" DROP COLUMN "regexRules"`);
	}
}
