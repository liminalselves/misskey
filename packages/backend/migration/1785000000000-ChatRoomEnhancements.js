/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ChatRoomEnhancements1785000000000 {
	name = 'ChatRoomEnhancements1785000000000';

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "chat_room" ADD "allowMemberInvite" boolean NOT NULL DEFAULT false`);
		await queryRunner.query(`COMMENT ON COLUMN "chat_room"."allowMemberInvite" IS 'Whether regular members can invite others to the room.'`);
		await queryRunner.query(`ALTER TABLE "chat_room" ADD "announcement" character varying(2048)`);
		await queryRunner.query(`COMMENT ON COLUMN "chat_room"."announcement" IS 'Announcement text displayed in the room.'`);
		await queryRunner.query(`ALTER TABLE "chat_room" ADD "pinnedMessageId" character varying(32)`);
		await queryRunner.query(`COMMENT ON COLUMN "chat_room"."pinnedMessageId" IS 'The ID of the pinned message in this room.'`);
		await queryRunner.query(`ALTER TABLE "chat_room" ADD CONSTRAINT "FK_chat_room_pinnedMessageId" FOREIGN KEY ("pinnedMessageId") REFERENCES "chat_message"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);

		await queryRunner.query(`ALTER TABLE "chat_room_membership" ADD "role" character varying(16) NOT NULL DEFAULT 'member'`);
		await queryRunner.query(`COMMENT ON COLUMN "chat_room_membership"."role" IS 'The role of the user in the room.'`);

		await queryRunner.query(`ALTER TABLE "chat_message" ADD "editedAt" TIMESTAMP WITH TIME ZONE`);
		await queryRunner.query(`COMMENT ON COLUMN "chat_message"."editedAt" IS 'The date and time when the message was last edited.'`);

		await queryRunner.query(`CREATE TABLE IF NOT EXISTS "chat_room_ban" (
			"id" character varying(32) NOT NULL,
			"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
			"roomId" character varying(32) NOT NULL,
			"userId" character varying(32) NOT NULL,
			"bannedById" character varying(32),
			"reason" character varying(256),
			CONSTRAINT "PK_chat_room_ban" PRIMARY KEY ("id")
		)`);
		await queryRunner.query(`COMMENT ON COLUMN "chat_room_ban"."createdAt" IS 'The created date of the ChatRoomBan.'`);
		await queryRunner.query(`COMMENT ON COLUMN "chat_room_ban"."roomId" IS 'The ID of the banned room.'`);
		await queryRunner.query(`COMMENT ON COLUMN "chat_room_ban"."userId" IS 'The ID of the banned user.'`);
		await queryRunner.query(`COMMENT ON COLUMN "chat_room_ban"."bannedById" IS 'The ID of the user who banned the target user.'`);
		await queryRunner.query(`COMMENT ON COLUMN "chat_room_ban"."reason" IS 'The reason for the ban.'`);
		await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_chat_room_ban_room_user" ON "chat_room_ban" ("roomId", "userId")`);
		await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_chat_room_ban_room" ON "chat_room_ban" ("roomId")`);
		await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_chat_room_ban_user" ON "chat_room_ban" ("userId")`);
		await queryRunner.query(`ALTER TABLE "chat_room_ban" ADD CONSTRAINT "FK_chat_room_ban_room" FOREIGN KEY ("roomId") REFERENCES "chat_room"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
		await queryRunner.query(`ALTER TABLE "chat_room_ban" ADD CONSTRAINT "FK_chat_room_ban_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
		await queryRunner.query(`ALTER TABLE "chat_room_ban" ADD CONSTRAINT "FK_chat_room_ban_bannedBy" FOREIGN KEY ("bannedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
	}

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "chat_room_ban" DROP CONSTRAINT IF EXISTS "FK_chat_room_ban_bannedBy"`);
		await queryRunner.query(`ALTER TABLE "chat_room_ban" DROP CONSTRAINT IF EXISTS "FK_chat_room_ban_user"`);
		await queryRunner.query(`ALTER TABLE "chat_room_ban" DROP CONSTRAINT IF EXISTS "FK_chat_room_ban_room"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_chat_room_ban_user"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_chat_room_ban_room"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_chat_room_ban_room_user"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "chat_room_ban"`);

		await queryRunner.query(`ALTER TABLE "chat_message" DROP COLUMN IF EXISTS "editedAt"`);

		await queryRunner.query(`ALTER TABLE "chat_room_membership" DROP COLUMN IF EXISTS "role"`);

		await queryRunner.query(`ALTER TABLE "chat_room" DROP CONSTRAINT IF EXISTS "FK_chat_room_pinnedMessageId"`);
		await queryRunner.query(`ALTER TABLE "chat_room" DROP COLUMN IF EXISTS "pinnedMessageId"`);
		await queryRunner.query(`ALTER TABLE "chat_room" DROP COLUMN IF EXISTS "announcement"`);
		await queryRunner.query(`ALTER TABLE "chat_room" DROP COLUMN IF EXISTS "allowMemberInvite"`);
	}
}
