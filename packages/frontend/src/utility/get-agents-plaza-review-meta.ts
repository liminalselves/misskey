/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Misskey from 'misskey-js';
import type { AgentsPlazaReviewNoteMeta } from '@/components/MkNoteAgentsPlazaReview.vue';

/** pack された Note に付く智能体広場レビュー用メタ（無ければ null） */
export function getAgentsPlazaReviewMeta(note: Misskey.entities.Note | null | undefined): AgentsPlazaReviewNoteMeta | null {
	if (note == null) return null;
	const raw = (note as Misskey.entities.Note & { agentsPlazaReview?: AgentsPlazaReviewNoteMeta }).agentsPlazaReview;
	return raw ?? null;
}
