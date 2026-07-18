/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import cronParser from 'cron-parser';
import type { AgentMessagesRepository, AgentProactiveSchedulesRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import type { MiAgentMessage } from '@/models/AgentMessage.js';
import type { MiAgentProactiveSchedule, AgentProactiveScheduleTrigger } from '@/models/AgentProactiveSchedule.js';
import type { MiAgentSession } from '@/models/AgentSession.js';
import { AgentService, escapeAgentXmlText } from '@/core/AgentService.js';

const ACTION_OPEN = '<proactive_schedule_actions>';
const ACTION_CLOSE = '</proactive_schedule_actions>';
const MAX_ACTIVE_SCHEDULES = 5;
const MIN_ONCE_DELAY_MS = 5 * 60 * 1000;
const MIN_RECURRING_INTERVAL_MS = 30 * 60 * 1000;
const BEIJING_TIME_ZONE = 'Asia/Shanghai';

type ScheduleAction =
	| { op: 'create'; description: string; trigger: AgentProactiveScheduleTrigger }
	| { op: 'update'; id: string; description?: string; trigger?: AgentProactiveScheduleTrigger }
	| { op: 'cancel'; id: string };

export type ExtractedProactiveScheduleControl = {
	visibleContent: string;
	controlRaw: string | null;
	actions: ScheduleAction[] | null;
	error: { code: string; message: string } | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
	return value != null && typeof value === 'object' && !Array.isArray(value)
		? value as Record<string, unknown>
		: null;
}

function parseBeijingLocalDate(value: string): Date | null {
	const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(value);
	if (!m) return null;
	const year = Number(m[1]);
	const month = Number(m[2]);
	const day = Number(m[3]);
	const hour = Number(m[4]);
	const minute = Number(m[5]);
	if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
	const localCalendar = new Date(Date.UTC(year, month - 1, day, hour, minute));
	if (
		localCalendar.getUTCFullYear() !== year ||
		localCalendar.getUTCMonth() !== month - 1 ||
		localCalendar.getUTCDate() !== day ||
		localCalendar.getUTCHours() !== hour ||
		localCalendar.getUTCMinutes() !== minute
	) return null;
	const date = new Date(Date.UTC(year, month - 1, day, hour - 8, minute));
	return Number.isNaN(date.getTime()) ? null : date;
}

function parseTrigger(raw: unknown): AgentProactiveScheduleTrigger | null {
	const value = asRecord(raw);
	if (!value || typeof value.type !== 'string') return null;
	if (value.type === 'once' && typeof value.at === 'string') {
		return { type: 'once', at: value.at };
	}
	if (value.type !== 'recurring' || typeof value.cron !== 'string') return null;
	const repeat = asRecord(value.repeat);
	if (!repeat || typeof repeat.mode !== 'string') return null;
	if (repeat.mode === 'unlimited') {
		return { type: 'recurring', cron: value.cron, repeat: { mode: 'unlimited' } };
	}
	if (repeat.mode === 'count' && typeof repeat.count === 'number' && Number.isInteger(repeat.count)) {
		return { type: 'recurring', cron: value.cron, repeat: { mode: 'count', count: repeat.count } };
	}
	return null;
}

function parseAction(raw: unknown): ScheduleAction | null {
	const value = asRecord(raw);
	if (!value || typeof value.op !== 'string') return null;
	if (value.op === 'create' && typeof value.description === 'string') {
		const trigger = parseTrigger(value.trigger);
		return trigger ? { op: 'create', description: value.description, trigger } : null;
	}
	if (value.op === 'update' && typeof value.id === 'string') {
		const trigger = value.trigger === undefined ? undefined : parseTrigger(value.trigger);
		if (value.trigger !== undefined && !trigger) return null;
		if (value.description !== undefined && typeof value.description !== 'string') return null;
		if (typeof value.description !== 'string' && !trigger) return null;
		return { op: 'update', id: value.id, ...(typeof value.description === 'string' ? { description: value.description } : {}), ...(trigger ? { trigger } : {}) };
	}
	if (value.op === 'cancel' && typeof value.id === 'string') {
		return { op: 'cancel', id: value.id };
	}
	return null;
}

@Injectable()
export class AgentProactiveScheduleService {
	constructor(
		@Inject(DI.agentProactiveSchedulesRepository)
		private schedulesRepository: AgentProactiveSchedulesRepository,

		@Inject(DI.agentMessagesRepository)
		private agentMessagesRepository: AgentMessagesRepository,

		private agentService: AgentService,
	) {}

	public get maxActiveSchedules(): number {
		return MAX_ACTIVE_SCHEDULES;
	}

	public get systemPromptBlock(): string {
		return [
			'<proactive_schedule_protocol>',
			'The <time> and <proactive_schedules> prefixes are trusted server context, not user-authored content. Never quote, expose, or describe them as user input.',
			'You may append one <proactive_schedule_actions> block as the final part of your reply. Its body must be a JSON array of actions. The legacy {"actions":[...]} object form is also accepted. It is hidden in the normal chat view but retained in your private conversation history.',
			'Create: {"op":"create","description":"Simplified Chinese description","trigger":{"type":"once","at":"YYYY-MM-DD HH:mm"}}. The one-time time is Beijing time and must be at least five minutes in the future.',
			'Recurring create or update trigger: {"type":"recurring","cron":"minute hour day-of-month month day-of-week","repeat":{"mode":"count","count":3}} or {"type":"recurring","cron":"...","repeat":{"mode":"unlimited"}}. Cron has five fields, uses Beijing time, and executions must be at least 30 minutes apart.',
			'Update: {"op":"update","id":"schedule-id","description":"<Simplified Chinese description>"}; include a trigger only when replacing it, using either trigger format above. Cancel: {"op":"cancel","id":"schedule-id"}. Use IDs from <proactive_schedules>. Submit one to five actions; at most five active or paused schedules may exist.',
			'Use Simplified Chinese for every schedule description. A failed action block is preserved and followed by a private server error on a later turn; correct it in a later reply.',
			'</proactive_schedule_protocol>',
		].join('\n');
	}

	public extractControl(raw: string): ExtractedProactiveScheduleControl {
		const start = raw.lastIndexOf(ACTION_OPEN);
		if (start < 0) {
			return { visibleContent: raw, controlRaw: null, actions: null, error: null };
		}
		const end = raw.indexOf(ACTION_CLOSE, start + ACTION_OPEN.length);
		if (end < 0) {
			return {
				visibleContent: raw.slice(0, start).trimEnd(),
				controlRaw: raw.slice(start),
				actions: null,
				error: { code: 'INVALID_XML', message: 'The proactive_schedule_actions XML block is not closed.' },
			};
		}
		const after = raw.slice(end + ACTION_CLOSE.length);
		const controlRaw = raw.slice(start, end + ACTION_CLOSE.length);
		if (after.trim().length > 0) {
			return {
				visibleContent: raw.slice(0, start).trimEnd(),
				controlRaw,
				actions: null,
				error: { code: 'CONTROL_BLOCK_NOT_FINAL', message: 'The proactive_schedule_actions block must be the final part of the reply.' },
			};
		}
		const jsonText = raw.slice(start + ACTION_OPEN.length, end).trim();
		try {
			const parsed = JSON.parse(jsonText);
			const actionList = Array.isArray(parsed)
				? parsed
				: asRecord(parsed)?.actions;
			if (!Array.isArray(actionList)) throw new Error('actions must be an array');
			const actions = actionList.map(parseAction);
			if (actions.some(action => action == null) || actions.length === 0 || actions.length > 5) {
				throw new Error('actions must contain one to five supported actions');
			}
			return { visibleContent: raw.slice(0, start).trimEnd(), controlRaw, actions: actions as ScheduleAction[], error: null };
		} catch (error) {
			return {
				visibleContent: raw.slice(0, start).trimEnd(),
				controlRaw,
				actions: null,
				error: { code: 'INVALID_JSON', message: error instanceof Error ? error.message : 'The action block must contain valid JSON.' },
			};
		}
	}

	public async listCurrent(sessionId: string): Promise<MiAgentProactiveSchedule[]> {
		return this.schedulesRepository.find({
			where: { sessionId, status: 'active' },
			order: { nextRunAt: 'ASC', createdAt: 'ASC' },
			take: MAX_ACTIVE_SCHEDULES,
		});
	}

	public async listForUser(sessionId: string): Promise<MiAgentProactiveSchedule[]> {
		return this.schedulesRepository.find({
			where: [{ sessionId, status: 'active' }, { sessionId, status: 'paused' }],
			order: { nextRunAt: 'ASC', createdAt: 'DESC' },
			take: MAX_ACTIVE_SCHEDULES,
		});
	}

	public async buildScheduleContext(session: Pick<MiAgentSession, 'id' | 'scheduledProactiveEnabled'>): Promise<string> {
		if (!session.scheduledProactiveEnabled) return '';
		const schedules = await this.listForUser(session.id);
		const rows = schedules.map(schedule => {
			const trigger = schedule.trigger.type === 'once'
				? `once at="${escapeAgentXmlText(schedule.trigger.at)}"`
				: `recurring cron="${escapeAgentXmlText(schedule.trigger.cron)}"`;
			const remaining = schedule.remainingRuns == null ? 'unlimited' : String(schedule.remainingRuns);
			return `<schedule id="${escapeAgentXmlText(schedule.id)}" status="${schedule.status}" ${trigger} created_at="${escapeAgentXmlText(this.formatBeijing(schedule.createdAt))}" next_run_at="${escapeAgentXmlText(this.formatBeijing(schedule.nextRunAt))}" remaining_runs="${remaining}">${escapeAgentXmlText(schedule.description)}</schedule>`;
		});
		return `<proactive_schedules timezone="${BEIJING_TIME_ZONE}">${rows.join('')}</proactive_schedules>`;
	}

	public async prependScheduleContext(text: string, session: Pick<MiAgentSession, 'id' | 'scheduledProactiveEnabled'>): Promise<string> {
		const context = await this.buildScheduleContext(session);
		return context ? `${context}\n${text}` : text;
	}

	public privateControlForLlm(message: Pick<MiAgentMessage, 'role' | 'content' | 'proactiveScheduleControlRaw' | 'proactiveScheduleControlError'>): string {
		if (message.role !== 'assistant' || !message.proactiveScheduleControlRaw) return message.content;
		const result = message.proactiveScheduleControlError;
		const suffix = result
			? `\n<proactive_schedule_result status="rejected" code="${escapeAgentXmlText(result.code)}" processed_at="${escapeAgentXmlText(result.processedAt)}">${escapeAgentXmlText(result.message)}</proactive_schedule_result>`
			: '';
		return `${message.content}\n${message.proactiveScheduleControlRaw}${suffix}`;
	}

	public successfulActionTypes(message: Pick<MiAgentMessage, 'role' | 'proactiveScheduleControlRaw' | 'proactiveScheduleControlError'>): ScheduleAction['op'][] {
		if (message.proactiveScheduleControlError) return [];
		return this.actionTypes(message);
	}

	/**
	 * Returns the action types declared by the model control block. This intentionally
	 * remains available for rejected batches so the UI can explain what failed.
	 */
	public actionTypes(message: Pick<MiAgentMessage, 'role' | 'proactiveScheduleControlRaw'>): ScheduleAction['op'][] {
		if (message.role !== 'assistant' || !message.proactiveScheduleControlRaw) return [];
		const parsed = this.extractControl(message.proactiveScheduleControlRaw);
		if (parsed.error || !parsed.actions) return [];
		return [...new Set(parsed.actions.map(action => action.op))];
	}

	public async applyAssistantControl(session: MiAgentSession, assistantMessage: MiAgentMessage, parsed: ExtractedProactiveScheduleControl): Promise<void> {
		if (!parsed.controlRaw) return;
		assistantMessage.proactiveScheduleControlRaw = parsed.controlRaw;
		const now = new Date();
		if (parsed.error) {
			assistantMessage.proactiveScheduleControlError = { ...parsed.error, processedAt: this.formatBeijing(now) };
			await this.agentMessagesRepository.save(assistantMessage);
			return;
		}
		if (!session.timeAwarenessEnabled || !session.scheduledProactiveEnabled || !parsed.actions) {
			assistantMessage.proactiveScheduleControlError = {
				code: 'SCHEDULE_MODE_DISABLED',
				message: 'Time awareness and scheduled proactive messages must both be enabled.',
				processedAt: this.formatBeijing(now),
			};
			await this.agentMessagesRepository.save(assistantMessage);
			return;
		}
		try {
			const managedSchedules = await this.listForUser(session.id);
			this.validateActions(parsed.actions, managedSchedules, now);
			await this.schedulesRepository.manager.transaction(async manager => {
				const repo = manager.getRepository('agent_proactive_schedule');
				for (const action of parsed.actions!) {
					if (action.op === 'create') {
						const normalized = this.normalizeTrigger(action.trigger, now);
						await repo.insert({
							id: this.agentService.newId(),
							sessionId: session.id,
							createdAt: now,
							updatedAt: now,
							status: 'active',
							description: action.description.trim(),
							trigger: normalized.trigger,
							nextRunAt: normalized.nextRunAt,
							lastRunAt: null,
							remainingRuns: normalized.remainingRuns,
						});
					} else if (action.op === 'update') {
						const schedule = managedSchedules.find(s => s.id === action.id)!;
						const patch: Record<string, unknown> = { updatedAt: now };
						if (action.description !== undefined) patch.description = action.description.trim();
						if (action.trigger) {
							const normalized = this.normalizeTrigger(action.trigger, now);
							patch.trigger = normalized.trigger;
							patch.nextRunAt = normalized.nextRunAt;
							patch.remainingRuns = normalized.remainingRuns;
						}
						await repo.update({ id: schedule.id, sessionId: session.id }, patch);
					} else {
						await repo.update({ id: action.id, sessionId: session.id }, { status: 'cancelled', updatedAt: now, nextRunAt: null });
					}
				}
			});
			assistantMessage.proactiveScheduleControlError = null;
		} catch (error) {
			assistantMessage.proactiveScheduleControlError = {
				code: error instanceof ScheduleControlError ? error.code : 'SCHEDULE_ACTION_FAILED',
				message: error instanceof Error ? error.message : 'The schedule action could not be applied.',
				processedAt: this.formatBeijing(now),
			};
		}
		await this.agentMessagesRepository.save(assistantMessage);
	}

	public async setStatus(schedule: MiAgentProactiveSchedule, status: 'active' | 'paused'): Promise<MiAgentProactiveSchedule> {
		const now = new Date();
		schedule.status = status;
		schedule.updatedAt = now;
		if (status === 'active') {
			if (schedule.trigger.type === 'once') {
				const at = parseBeijingLocalDate(schedule.trigger.at);
				// A paused one-time schedule keeps its original clock time. Do not apply
				// the creation-time five-minute rule when resuming it; only expire it
				// once that time has already passed.
				if (!at || at.getTime() <= now.getTime()) {
					schedule.status = 'completed';
					schedule.nextRunAt = null;
					schedule.remainingRuns = 0;
					return this.schedulesRepository.save(schedule);
				}
				schedule.nextRunAt = at;
				schedule.remainingRuns = 1;
				return this.schedulesRepository.save(schedule);
			}
			const normalized = this.normalizeTrigger(schedule.trigger, schedule.updatedAt);
			schedule.nextRunAt = normalized.nextRunAt;
			schedule.remainingRuns = normalized.remainingRuns;
		}
		return this.schedulesRepository.save(schedule);
	}

	public async pauseAll(sessionId: string): Promise<void> {
		await this.schedulesRepository.createQueryBuilder()
			.update()
			.set({ status: 'paused', updatedAt: new Date() })
			.where('sessionId = :sessionId AND status = :status', { sessionId, status: 'active' })
			.execute();
	}

	public async resumeAll(sessionId: string): Promise<void> {
		const schedules = await this.schedulesRepository.findBy({ sessionId, status: 'paused' });
		for (const schedule of schedules) {
			await this.setStatus(schedule, 'active');
		}
	}

	public armRandomAfterVisibleAssistant(session: MiAgentSession, endedAt: Date): void {
		if (!session.randomProactiveEnabled || !session.timeAwarenessEnabled) {
			session.randomProactiveAt = null;
			session.randomProactiveNeedsUserMessage = false;
			return;
		}
		const start = new Date(endedAt.getTime() + 30 * 60 * 1000);
		const candidateMinutes: { at: Date; weight: number }[] = [];
		for (let minute = 0; minute <= 23 * 60 + 30; minute += 5) {
			const at = new Date(start.getTime() + minute * 60 * 1000);
			const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: BEIJING_TIME_ZONE, hour: '2-digit', hourCycle: 'h23' }).format(at));
			candidateMinutes.push({ at, weight: hour >= 8 && hour <= 22 ? 3 : 1 });
		}
		const totalWeight = candidateMinutes.reduce((sum, candidate) => sum + candidate.weight, 0);
		let cursor = Math.random() * totalWeight;
		const selected = candidateMinutes.find(candidate => {
			cursor -= candidate.weight;
			return cursor < 0;
		}) ?? candidateMinutes[candidateMinutes.length - 1]!;
		session.randomProactiveAt = selected.at;
		session.randomProactiveNeedsUserMessage = false;
	}

	public async consumeScheduleRun(schedule: MiAgentProactiveSchedule, now: Date): Promise<void> {
		schedule.lastRunAt = now;
		schedule.updatedAt = now;
		if (schedule.trigger.type === 'once' || schedule.remainingRuns === 1) {
			schedule.remainingRuns = 0;
			schedule.nextRunAt = null;
			schedule.status = 'completed';
			await this.schedulesRepository.save(schedule);
			return;
		}
		if (schedule.remainingRuns != null) schedule.remainingRuns--;
		try {
			const interval = cronParser.parseExpression(schedule.trigger.cron, { currentDate: now, tz: BEIJING_TIME_ZONE });
			schedule.nextRunAt = interval.next().toDate();
			await this.schedulesRepository.save(schedule);
		} catch {
			schedule.status = 'paused';
			schedule.nextRunAt = null;
			await this.schedulesRepository.save(schedule);
		}
	}

	public formatBeijing(date: Date | null): string {
		if (!date) return '';
		const parts = new Intl.DateTimeFormat('en-US', {
			timeZone: BEIJING_TIME_ZONE,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hourCycle: 'h23',
		}).formatToParts(date).reduce<Record<string, string>>((result, part) => {
			if (part.type !== 'literal') result[part.type] = part.value;
			return result;
		}, {});
		return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
	}

	private validateActions(actions: ScheduleAction[], active: MiAgentProactiveSchedule[], now: Date): void {
		const ids = new Set(active.map(s => s.id));
		const actionIds = new Set<string>();
		let creates = 0;
		for (const action of actions) {
			if (action.op === 'create') {
				creates++;
				this.validateDescription(action.description);
				this.normalizeTrigger(action.trigger, now);
			} else if (action.op === 'update') {
				if (actionIds.has(action.id)) throw new ScheduleControlError('DUPLICATE_SCHEDULE_ACTION', 'Each schedule can only be changed once per action block.');
				actionIds.add(action.id);
				if (!ids.has(action.id)) throw new ScheduleControlError('SCHEDULE_NOT_FOUND', 'The schedule ID is not active in this conversation.');
				if (action.description !== undefined) this.validateDescription(action.description);
				if (action.trigger) this.normalizeTrigger(action.trigger, now);
			} else {
				if (actionIds.has(action.id)) throw new ScheduleControlError('DUPLICATE_SCHEDULE_ACTION', 'Each schedule can only be changed once per action block.');
				actionIds.add(action.id);
				if (!ids.has(action.id)) throw new ScheduleControlError('SCHEDULE_NOT_FOUND', 'The schedule ID is not active in this conversation.');
			}
		}
		const cancels = actions.filter(action => action.op === 'cancel').length;
		if (active.length - cancels + creates > MAX_ACTIVE_SCHEDULES) {
			throw new ScheduleControlError('ACTIVE_SCHEDULE_LIMIT', `No more than ${MAX_ACTIVE_SCHEDULES} active schedules are allowed.`);
		}
	}

	private validateDescription(description: string): void {
		const text = description.trim();
		if (text.length < 1 || text.length > 80 || !/[\u3400-\u9fff]/u.test(text)) {
			throw new ScheduleControlError('INVALID_DESCRIPTION', 'Schedule descriptions must be 1 to 80 characters and written in Simplified Chinese.');
		}
	}

	private normalizeTrigger(trigger: AgentProactiveScheduleTrigger, now: Date): { trigger: AgentProactiveScheduleTrigger; nextRunAt: Date; remainingRuns: number | null } {
		if (trigger.type === 'once') {
			const at = parseBeijingLocalDate(trigger.at);
			if (!at || at.getTime() < now.getTime() + MIN_ONCE_DELAY_MS) {
				throw new ScheduleControlError('INVALID_TIME', 'A one-time schedule must be at least five minutes in the future, using YYYY-MM-DD HH:mm Beijing time.');
			}
			return { trigger: { type: 'once', at: trigger.at }, nextRunAt: at, remainingRuns: 1 };
		}
		if (trigger.repeat.mode === 'count' && (trigger.repeat.count < 1 || trigger.repeat.count > 1000)) {
			throw new ScheduleControlError('INVALID_REPEAT_COUNT', 'A recurring schedule count must be between 1 and 1000, or use unlimited.');
		}
		let interval;
		try {
			interval = cronParser.parseExpression(trigger.cron, { currentDate: now, tz: BEIJING_TIME_ZONE });
		} catch {
			throw new ScheduleControlError('INVALID_CRON', 'The recurring schedule must use a valid five-field cron expression.');
		}
		const first = interval.next().toDate();
		const second = interval.next().toDate();
		if (second.getTime() - first.getTime() < MIN_RECURRING_INTERVAL_MS) {
			throw new ScheduleControlError('SCHEDULE_INTERVAL_TOO_SHORT', 'Recurring schedules must run at least 30 minutes apart.');
		}
		return {
			trigger: { type: 'recurring', cron: trigger.cron.trim(), repeat: trigger.repeat },
			nextRunAt: first,
			remainingRuns: trigger.repeat.mode === 'count' ? trigger.repeat.count : null,
		};
	}
}

class ScheduleControlError extends Error {
	constructor(
		public code: string,
		message: string,
	) {
		super(message);
	}
}
