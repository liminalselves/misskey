/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ChatRoomInvitationStatusAndSystemMessage1785200000000 {
	name = 'ChatRoomInvitationStatusAndSystemMessage1785200000000';

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "chat_room_invitation" ADD "status" character varying(16) NOT NULL DEFAULT 'pending'`);
		await queryRunner.query(`COMMENT ON COLUMN "chat_room_invitation"."status" IS 'pending / accepted / ignored / canceled'`);
		await queryRunner.query(`UPDATE "chat_room_invitation" SET "status" = 'ignored' WHERE "ignored" = true`);
		await queryRunner.query(`ALTER TABLE "chat_room_invitation" DROP COLUMN "ignored"`);
		await queryRunner.query(`ALTER TABLE "chat_message" ADD "systemType" character varying(32)`);
		await queryRunner.query(`COMMENT ON COLUMN "chat_message"."systemType" IS 'System notice type (memberJoined / memberInvitedJoined / memberLeft); NULL for normal messages.'`);
	}

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		await queryRunner.query(`DELETE FROM "chat_message" WHERE "systemType" IS NOT NULL`);
		await queryRunner.query(`ALTER TABLE "chat_message" DROP COLUMN "systemType"`);
		await queryRunner.query(`ALTER TABLE "chat_room_invitation" ADD "ignored" boolean NOT NULL DEFAULT false`);
		await queryRunner.query(`UPDATE "chat_room_invitation" SET "ignored" = true WHERE "status" = 'ignored'`);
		await queryRunner.query(`DELETE FROM "chat_room_invitation" WHERE "status" IN ('accepted', 'canceled')`);
		await queryRunner.query(`ALTER TABLE "chat_room_invitation" DROP COLUMN "status"`);
	}
}
