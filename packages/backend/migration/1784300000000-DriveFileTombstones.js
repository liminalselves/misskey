/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class DriveFileTombstones1784300000000 {
	name = 'DriveFileTombstones1784300000000';

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		// 网盘文件删除后的墓碑：引用处展示「已被清理」占位与归属者
		await queryRunner.query(`CREATE TABLE IF NOT EXISTS "drive_file_tombstone" (
			"id" varchar(32) NOT NULL,
			"userId" varchar(32),
			"userHost" varchar(128),
			"name" varchar(256) NOT NULL,
			"type" varchar(128) NOT NULL,
			"size" integer NOT NULL,
			"properties" jsonb NOT NULL DEFAULT '{}'::jsonb,
			"deletedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
			CONSTRAINT "PK_drive_file_tombstone" PRIMARY KEY ("id")
		)`);
		await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_drive_file_tombstone_user" ON "drive_file_tombstone" ("userId")`);
		await queryRunner.query(`ALTER TABLE "drive_file_tombstone" ADD CONSTRAINT "FK_drive_file_tombstone_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE`);
	}

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		await queryRunner.query(`DROP TABLE IF EXISTS "drive_file_tombstone"`);
	}
}
