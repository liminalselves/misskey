/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class DriveMissingObjectReports1785000000000 {
	name = 'DriveMissingObjectReports1785000000000';

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		// 对象存储里已确认缺失、等待管理员审查删除的网盘文件；文件删除后随外键级联消失
		await queryRunner.query(`CREATE TABLE IF NOT EXISTS "drive_missing_object_report" (
			"id" varchar(32) NOT NULL,
			"fileId" varchar(32) NOT NULL,
			"bucket" varchar(256) NOT NULL,
			"objectKey" varchar(1024) NOT NULL,
			"scope" varchar(16) NOT NULL,
			"reportCount" integer NOT NULL DEFAULT 1,
			"firstReportedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
			"lastReportedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
			"verifiedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
			CONSTRAINT "PK_drive_missing_object_report" PRIMARY KEY ("id")
		)`);
		await queryRunner.query(`COMMENT ON COLUMN "drive_missing_object_report"."bucket" IS 'The bucket the missing object was expected in, at verification time.'`);
		await queryRunner.query(`COMMENT ON COLUMN "drive_missing_object_report"."objectKey" IS 'The object key that was verified missing.'`);
		await queryRunner.query(`COMMENT ON COLUMN "drive_missing_object_report"."scope" IS 'current: object belongs to the configured bucket; legacy: a previous bucket on the same endpoint.'`);
		await queryRunner.query(`COMMENT ON COLUMN "drive_missing_object_report"."reportCount" IS 'How many times a missing object was verified for this file.'`);
		await queryRunner.query(`COMMENT ON COLUMN "drive_missing_object_report"."verifiedAt" IS 'The last time the server itself confirmed the object missing.'`);
		await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_drive_missing_object_report_file" ON "drive_missing_object_report" ("fileId")`);
		await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_drive_missing_object_report_last" ON "drive_missing_object_report" ("lastReportedAt")`);
		await queryRunner.query(`ALTER TABLE "drive_missing_object_report" ADD CONSTRAINT "FK_drive_missing_object_report_file" FOREIGN KEY ("fileId") REFERENCES "drive_file"("id") ON DELETE CASCADE`);
	}

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		await queryRunner.query(`DROP TABLE IF EXISTS "drive_missing_object_report"`);
	}
}
