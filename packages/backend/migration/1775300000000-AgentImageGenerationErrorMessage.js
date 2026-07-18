export class AgentImageGenerationErrorMessage1775300000000 {
	name = 'AgentImageGenerationErrorMessage1775300000000';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_image_generation" ADD "errorMessage" character varying(768)`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_image_generation" DROP COLUMN "errorMessage"`);
	}
}
