/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable, Inject } from '@nestjs/common';
import { In, LessThan } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type {
	AgentPlazaReviewsRepository,
	AgentCharactersRepository,
	AgentDialogueStylesRepository,
	NotesRepository,
} from '@/models/_.js';
import type { MiLocalUser } from '@/models/User.js';
import type { MiNote } from '@/models/Note.js';
import type { MiAgentCharacter } from '@/models/AgentCharacter.js';
import type { MiAgentDialogueStyle } from '@/models/AgentDialogueStyle.js';
import { MiAgentPlazaReview } from '@/models/AgentPlazaReview.js';
import { AgentService } from '@/core/AgentService.js';
import { NoteCreateService } from '@/core/NoteCreateService.js';
import { NoteDeleteService } from '@/core/NoteDeleteService.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { IdService } from '@/core/IdService.js';
import type { Packed } from '@/misc/json-schema.js';
import { MAX_NOTE_TEXT_LENGTH } from '@/const.js';
import { bindThis } from '@/decorators.js';

@Injectable()
export class AgentPlazaReviewService {
	constructor(
		@Inject(DI.agentPlazaReviewsRepository)
		private agentPlazaReviewsRepository: AgentPlazaReviewsRepository,

		@Inject(DI.agentCharactersRepository)
		private agentCharactersRepository: AgentCharactersRepository,

		@Inject(DI.agentDialogueStylesRepository)
		private agentDialogueStylesRepository: AgentDialogueStylesRepository,

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		private agentService: AgentService,
		private noteCreateService: NoteCreateService,
		private noteDeleteService: NoteDeleteService,
		private noteEntityService: NoteEntityService,
		private idService: IdService,
	) {}

	@bindThis
	public async getRatingAggregate(params: { characterId?: string | null; styleId?: string | null }): Promise<{ average: number | null; count: number }> {
		const qb = this.agentPlazaReviewsRepository.createQueryBuilder('r').select('AVG(r.stars)', 'avg').addSelect('COUNT(*)', 'cnt');
		if (params.characterId) {
			qb.where('r.characterId = :id', { id: params.characterId });
		} else if (params.styleId) {
			qb.where('r.styleId = :id', { id: params.styleId });
		} else {
			return { average: null, count: 0 };
		}
		const raw = await qb.getRawOne<{ avg: string | null; cnt: string }>();
		const count = raw?.cnt != null ? parseInt(raw.cnt, 10) : 0;
		const avg = raw?.avg != null ? parseFloat(raw.avg) : null;
		return {
			count: Number.isFinite(count) ? count : 0,
			average: avg != null && Number.isFinite(avg) ? Math.round(avg * 100) / 100 : null,
		};
	}

	@bindThis
	public async findMyReview(userId: string, params: { characterId?: string | null; styleId?: string | null }): Promise<MiAgentPlazaReview | null> {
		if (params.characterId) {
			return await this.agentPlazaReviewsRepository.findOneBy({ userId, characterId: params.characterId });
		}
		if (params.styleId) {
			return await this.agentPlazaReviewsRepository.findOneBy({ userId, styleId: params.styleId });
		}
		return null;
	}

	@bindThis
	public async listReviews(me: { id: string } | null | undefined, params: {
		characterId?: string | null;
		styleId?: string | null;
		limit: number;
		untilNoteId?: string | null;
	}): Promise<{ stars: number; note: Packed<'Note'> }[]> {
		const limit = Math.min(100, Math.max(1, params.limit));
		const where = params.characterId
			? {
				characterId: params.characterId,
				...(params.untilNoteId ? { noteId: LessThan(params.untilNoteId) } : {}),
			}
			: params.styleId
				? {
					styleId: params.styleId,
					...(params.untilNoteId ? { noteId: LessThan(params.untilNoteId) } : {}),
				}
				: null;
		if (where == null) return [];

		const rows = await this.agentPlazaReviewsRepository.find({
			where,
			order: { noteId: 'DESC' },
			take: limit,
		});
		const noteIds = rows.map(r => r.noteId);
		if (noteIds.length === 0) return [];

		const notes = await this.notesRepository.findBy({ id: In(noteIds) });
		const noteById = new Map(notes.map(n => [n.id, n]));
		const out: { stars: number; note: Packed<'Note'> }[] = [];
		for (const r of rows) {
			const note = noteById.get(r.noteId);
			if (!note) continue;
			const packed = await this.noteEntityService.pack(note, me);
			if (packed.isHidden === true) continue;
			out.push({ stars: r.stars, note: packed });
		}
		return out;
	}

	@bindThis
	public async createOrReplace(me: MiLocalUser, data: {
		characterId?: string | null;
		styleId?: string | null;
		stars: number;
		text: string;
		visibility: 'public' | 'followers';
		visibleUserIds: string[];
		localOnly: boolean;
		cw: string | null;
		reactionAcceptance: MiNote['reactionAcceptance'];
	}): Promise<{ note: Packed<'Note'> }> {
		this.agentService.assertAgentsEnabled();

		const stars = Math.trunc(Number(data.stars));
		if (!Number.isFinite(stars) || stars < 0 || stars > 5) {
			throw new Error('INVALID_STARS');
		}

		const text = data.text.trim();
		if (text.length === 0 || text.length > MAX_NOTE_TEXT_LENGTH) {
			throw new Error('INVALID_TEXT');
		}

		const hasCh = data.characterId != null && data.characterId !== '';
		const hasSt = data.styleId != null && data.styleId !== '';
		if (hasCh === hasSt) {
			throw new Error('INVALID_TARGET');
		}

		if (data.visibility !== 'public' && data.visibility !== 'followers') {
			throw new Error('INVALID_VISIBILITY');
		}

		if (hasCh) {
			const row = await this.agentCharactersRepository.findOneBy({ id: data.characterId! });
			if (!row || !this.agentService.isListedOnPlazaCharacter(row)) {
				throw new Error('NO_SUCH_CHARACTER');
			}
		} else {
			const row = await this.agentDialogueStylesRepository.findOneBy({ id: data.styleId! });
			if (!row || !this.agentService.isListedOnPlazaStyle(row)) {
				throw new Error('NO_SUCH_STYLE');
			}
		}

		const existing = await this.findMyReview(me.id, {
			characterId: hasCh ? data.characterId! : null,
			styleId: hasSt ? data.styleId! : null,
		});
		if (existing) {
			const oldNote = await this.notesRepository.findOneBy({ id: existing.noteId });
			if (oldNote) {
				await this.noteDeleteService.delete(me, oldNote, false);
			}
		}

		const note = await this.noteCreateService.fetchAndCreate(me, {
			createdAt: new Date(),
			replyId: null,
			renoteId: null,
			fileIds: [],
			text,
			cw: null,
			localOnly: data.localOnly,
			reactionAcceptance: data.reactionAcceptance,
			visibility: data.visibility,
			visibleUserIds: data.visibleUserIds ?? [],
			channelId: null,
			poll: null,
		});

		const review = new MiAgentPlazaReview({
			id: this.idService.gen(),
			noteId: note.id,
			userId: me.id,
			characterId: hasCh ? data.characterId! : null,
			styleId: hasSt ? data.styleId! : null,
			stars,
		});
		await this.agentPlazaReviewsRepository.insert(review);

		return {
			note: await this.noteEntityService.pack(note, me),
		};
	}

	@bindThis
	public characterPromptStatsFromRow(row: MiAgentCharacter): {
		personalityChars: number;
		backgroundChars: number;
		speakingStyleChars: number;
		greetingChars: number;
		exampleTurnCount: number;
		exampleDialogueChars: number;
		forbiddenChars: number;
		totalChars: number;
	} {
		const eff = this.agentService.effectiveCharacterForLlm(row, true);
		const turns = this.agentService.exampleTurnsFromStored(eff.exampleDialogue);
		const exChars = turns.reduce((a, t) => a + t.content.length, 0);
		const p = eff.personality?.length ?? 0;
		const b = eff.background?.length ?? 0;
		const s = eff.speakingStyle?.length ?? 0;
		const g = eff.greeting?.length ?? 0;
		const f = eff.forbiddenBehavior?.length ?? 0;
		const total = p + b + s + g + exChars + f;
		return {
			personalityChars: p,
			backgroundChars: b,
			speakingStyleChars: s,
			greetingChars: g,
			exampleTurnCount: turns.length,
			exampleDialogueChars: exChars,
			forbiddenChars: f,
			totalChars: total,
		};
	}

	@bindThis
	public styleBodyCharCount(row: MiAgentDialogueStyle): number {
		const eff = this.agentService.effectiveStyleForLlm(row, true);
		return eff.body?.length ?? 0;
	}
}
