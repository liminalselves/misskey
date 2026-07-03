/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentImageDriveFolder1774200000000 {
	name = 'AgentImageDriveFolder1774200000000';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "drive_folder" ADD "systemType" character varying(32)`);
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_drive_folder_user_system_type" ON "drive_folder" ("userId", "systemType") WHERE "systemType" IS NOT NULL`);
		await queryRunner.query(`ALTER TABLE "drive_file" ADD "isAgentGenerated" boolean NOT NULL DEFAULT false`);
		await queryRunner.query(`ALTER TABLE "drive_file" ADD "isAgentImageBlocked" boolean NOT NULL DEFAULT false`);
		await queryRunner.query(`CREATE INDEX "IDX_drive_file_agent_generated" ON "drive_file" ("isAgentGenerated")`);
		await queryRunner.query(`CREATE INDEX "IDX_drive_file_agent_image_blocked" ON "drive_file" ("isAgentImageBlocked")`);
		await queryRunner.query(`UPDATE "drive_file" AS f SET "isAgentGenerated" = true, "isAgentImageBlocked" = g."isBlocked" FROM "agent_image_generation" AS g WHERE g."fileId" = f."id"`);
	}

	async down(queryRunner) {
		await queryRunner.query(`DROP INDEX "public"."IDX_drive_file_agent_image_blocked"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_drive_file_agent_generated"`);
		await queryRunner.query(`ALTER TABLE "drive_file" DROP COLUMN "isAgentImageBlocked"`);
		await queryRunner.query(`ALTER TABLE "drive_file" DROP COLUMN "isAgentGenerated"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_drive_folder_user_system_type"`);
		await queryRunner.query(`ALTER TABLE "drive_folder" DROP COLUMN "systemType"`);
	}
}
