<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div v-if="note == null" :class="$style.deleted">
	{{ i18n.ts.deletedNote }}
</div>
<div
	v-else-if="!muted"
	:class="[$style.root, { [$style.children]: depth > 1, [$style.clickable]: navigate }]"
	:tabindex="navigate ? 0 : undefined"
	@click="openDetail"
	@keydown.enter="openDetail"
>
	<div :class="$style.main">
		<div v-if="note.channel" :class="$style.colorBar" :style="{ background: note.channel.color }"></div>
		<MkAvatar :class="$style.avatar" :user="note.user" link preview/>
		<div :class="$style.body">
			<MkNoteHeader :class="$style.header" :note="note" :mini="true"/>
			<MkNoteAgentsPlazaReview v-if="agentsPlazaReviewMeta" :meta="agentsPlazaReviewMeta"/>
			<div>
				<p v-if="note.cw != null" :class="$style.cw">
					<Mfm v-if="note.cw != ''" style="margin-right: 8px;" :text="note.cw" :author="note.user" :nyaize="'respect'"/>
					<MkCwButton v-model="showContent" :text="note.text" :files="note.files" :poll="note.poll"/>
				</p>
				<div v-show="note.cw == null || showContent">
					<MkSubNoteContent :class="$style.text" :note="note">
						<template #tail>
							<span :class="$style.quickReactions" data-note-interactive @click.stop>
								<MkReactionsViewer
									v-if="$note.reactionCount > 0"
									style="display: inline-flex; vertical-align: middle;"
									:reactions="$note.reactions"
									:reactionEmojis="$note.reactionEmojis"
									:myReaction="$note.myReaction"
									:noteId="note.id"
									:maxNumber="4"
									compact
								>
									<template #more>
										<MkA v-tooltip.noDelay="i18n.ts.more" :to="`/notes/${note.id}/reactions`" :class="$style.moreReactions" :aria-label="i18n.ts.more"><i class="ti ti-dots"></i></MkA>
									</template>
								</MkReactionsViewer>
								<button
									v-if="note.reactionAcceptance !== 'likeOnly' || $note.reactionCount === 0"
									ref="reactButton"
									v-tooltip.noDelay="i18n.ts.reaction"
									type="button"
									class="_button"
									:class="$style.quickReactionButton"
									:aria-label="i18n.ts.reaction"
									@click="toggleReact"
								>
									<i v-if="note.reactionAcceptance === 'likeOnly' && $note.myReaction != null" class="ti ti-heart-filled" :class="$style.liked"></i>
									<i v-else-if="$note.myReaction != null" class="ti ti-minus" :class="$style.reacted"></i>
									<i v-else-if="note.reactionAcceptance === 'likeOnly'" class="ti ti-heart"></i>
									<i v-else class="ti ti-plus"></i>
								</button>
							</span>
						</template>
					</MkSubNoteContent>
				</div>
			</div>
		</div>
	</div>
	<template v-if="expandReplies">
		<MkNoteSub
			v-for="reply in replies"
			:key="reply.id"
			:note="reply"
			:class="$style.reply"
			:navigate="true"
			:expandReplies="true"
			:depth="depth + 1"
		/>
	</template>
	<div v-if="expandReplies && note.repliesCount > INLINE_REPLY_LIMIT" :class="$style.branch">
		<button class="_textButton" @click.stop="openDetail()">
			{{ i18n.ts.continueThread }} ({{ number(note.repliesCount - INLINE_REPLY_LIMIT) }}) <i class="ti ti-chevron-double-right"></i>
		</button>
	</div>
</div>
<div v-else :class="$style.muted" @click="muted = false">
	<I18n :src="i18n.ts.userSaysSomething" tag="small">
		<template #name>
			<MkA v-user-preview="note.userId" :to="userPage(note.user)">
				<MkUserName :user="note.user"/>
			</MkA>
		</template>
	</I18n>
</div>
</template>

<script lang="ts" setup>
import { computed, reactive, ref, useTemplateRef } from 'vue';
import * as Misskey from 'misskey-js';
import MkNoteHeader from '@/components/MkNoteHeader.vue';
import MkNoteAgentsPlazaReview from '@/components/MkNoteAgentsPlazaReview.vue';
import MkSubNoteContent from '@/components/MkSubNoteContent.vue';
import MkCwButton from '@/components/MkCwButton.vue';
import MkReactionsViewer from '@/components/MkReactionsViewer.vue';
import { notePage } from '@/filters/note.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { $i } from '@/i.js';
import { userPage } from '@/filters/user.js';
import { checkWordMute } from '@/utility/check-word-mute.js';
import { getAgentsPlazaReviewMeta } from '@/utility/get-agents-plaza-review-meta.js';
import number from '@/filters/number.js';
import { useRouter } from '@/router.js';
import { useNoteCapture, noteEvents } from '@/composables/use-note-capture.js';
import { pleaseLogin } from '@/utility/please-login.js';
import * as os from '@/os.js';
import * as sound from '@/utility/sound.js';
import { reactionPicker } from '@/utility/reaction-picker.js';
import { prefer } from '@/preferences.js';

const props = withDefaults(defineProps<{
	note: Misskey.entities.Note | null;
	navigate?: boolean;
	expandReplies?: boolean;
	depth?: number;
}>(), {
	navigate: false,
	expandReplies: false,
	depth: 1,
});

const INLINE_REPLY_LIMIT = 10;
const muted = ref(props.note && $i ? checkWordMute(props.note, $i, $i.mutedWords) : false);
const router = useRouter();
const reactButton = useTemplateRef('reactButton');

const agentsPlazaReviewMeta = computed(() => getAgentsPlazaReviewMeta(props.note));

const showContent = ref(false);
const replies = ref<Misskey.entities.Note[]>([]);
const { $note } = props.note != null ? useNoteCapture({
	note: props.note,
	parentNote: null,
}) : {
	$note: reactive({
		reactions: {},
		reactionCount: 0,
		reactionEmojis: {},
		myReaction: null,
		pollChoices: [],
	}),
};

if (props.expandReplies && props.note && props.note.repliesCount > 0) {
	misskeyApi('notes/children', {
		noteId: props.note.id,
		limit: INLINE_REPLY_LIMIT,
	}).then(res => {
		replies.value = res;
	}).catch(err => {
		console.error('Failed to load note reply branch:', err);
	});
}

function openDetail(ev?: MouseEvent | KeyboardEvent) {
	if (!props.navigate || props.note == null) return;
	if (ev != null) {
		if (ev instanceof MouseEvent && window.getSelection()?.toString() !== '') return;
		if (isInteractiveTarget(ev.target)) return;
		if (ev instanceof KeyboardEvent) ev.preventDefault();
	}

	router.pushByPath(notePage(props.note), 'forcePage');
}

function isInteractiveTarget(target: EventTarget | null): boolean {
	return target instanceof Element && target.closest('a, button, input, select, textarea, option, label, summary, video, audio, [contenteditable]') != null;
}

async function react(): Promise<void> {
	if (props.note == null) return;
	if (!await pleaseLogin()) return;

	if (props.note.reactionAcceptance === 'likeOnly') {
		sound.playMisskeySfx('reaction');
		misskeyApi('notes/reactions/create', {
			noteId: props.note.id,
			reaction: '❤️',
		}).then(() => {
			noteEvents.emit(`reacted:${props.note!.id}`, {
				userId: $i!.id,
				reaction: '❤️',
			});
		});
		return;
	}

	reactionPicker.show(reactButton.value ?? null, props.note, async (reaction) => {
		if (prefer.s.confirmOnReact) {
			const confirm = await os.confirm({
				type: 'question',
				text: i18n.tsx.reactAreYouSure({ emoji: reaction.replace('@.', '') }),
			});
			if (confirm.canceled) return;
		}

		sound.playMisskeySfx('reaction');
		misskeyApi('notes/reactions/create', {
			noteId: props.note!.id,
			reaction,
		}).then(() => {
			noteEvents.emit(`reacted:${props.note!.id}`, {
				userId: $i!.id,
				reaction,
			});
		});
	});
}

function undoReact(): void {
	if (props.note == null || $note.myReaction == null) return;

	const reaction = $note.myReaction;
	misskeyApi('notes/reactions/delete', {
		noteId: props.note.id,
	}).then(() => {
		noteEvents.emit(`unreacted:${props.note!.id}`, {
			userId: $i!.id,
			reaction,
		});
	});
}

function toggleReact(): void {
	if ($note.myReaction == null) {
		void react();
	} else {
		undoReact();
	}
}
</script>

<style lang="scss" module>
.root {
	padding: 16px 32px;
	font-size: 0.9em;
	position: relative;

	&.children {
		padding: 10px 0 0 16px;
		font-size: 1em;
	}

	&.clickable {
		cursor: pointer;
	}
}

.main {
	display: flex;
}

.colorBar {
	position: absolute;
	top: 8px;
	left: 8px;
	width: 5px;
	height: calc(100% - 8px);
	border-radius: 999px;
	pointer-events: none;
}

.avatar {
	flex-shrink: 0;
	display: block;
	margin: 0 8px 0 0;
	width: 38px;
	height: 38px;
	border-radius: 8px;
}

.body {
	flex: 1;
	min-width: 0;
}

.header {
	margin-bottom: 2px;
}

.cw {
	cursor: default;
	display: block;
	margin: 0;
	padding: 0;
	overflow-wrap: break-word;
}

.text {
	margin: 0;
	padding: 0;
}

.quickReactions {
	display: inline-flex;
	align-items: center;
	gap: 3px;
	vertical-align: middle;
}

.moreReactions {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 28px;
	height: 28px;
	border-radius: 5px;
	color: var(--MI_THEME-accent);
}

.quickReactionButton {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 28px;
	height: 28px;
	border-radius: 5px;
	color: var(--MI_THEME-accent);

	&:hover {
		background: var(--MI_THEME-buttonBg);
	}
}

.liked {
	color: var(--MI_THEME-love);
}

.reacted {
	color: var(--MI_THEME-accent);
}

.branch {
	margin: 10px 0 0 46px;
	font-size: 0.9em;
}

.reply {
	border-left: solid 0.5px var(--MI_THEME-divider);
	margin-top: 10px;
}

@container (max-width: 450px) {
	.root {
		padding: 14px 16px;

		&.children {
			padding: 10px 0 0 8px;
		}
	}

	.branch {
		margin-left: 46px;
	}
}

.muted {
	text-align: center;
	padding: 8px !important;
	border: 1px solid var(--MI_THEME-divider);
	margin: 8px 8px 0 8px;
	border-radius: 8px;
}

.deleted {
	text-align: center;
	padding: 8px !important;
	margin: 8px 8px 0 8px;
	--color: light-dark(rgba(0, 0, 0, 0.05), rgba(0, 0, 0, 0.15));
	background-size: auto auto;
	background-image: repeating-linear-gradient(135deg, transparent, transparent 10px, var(--color) 4px, var(--color) 14px);
	border-radius: 8px;
}
</style>
