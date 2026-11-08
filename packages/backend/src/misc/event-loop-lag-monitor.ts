/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { monitorEventLoopDelay } from 'node:perf_hooks';

export type EventLoopLagSnapshot = { maxMs: number; p99Ms: number };

const CHECK_INTERVAL_MS = 10_000;
/** 最大延迟超过该值才记录；正常运行时不产生任何输出。 */
export const EVENT_LOOP_LAG_WARN_MS = 1000;

/**
 * 周期性检查事件循环阻塞。生产上出现过多条互不相关的主键查询在同一毫秒返回、耗时都约 4 秒，
 * 指向 Node 被同步计算堵住而非数据库慢；该告警让这类停顿在日志里直接可见。
 * 返回停止函数；定时器 unref，不阻止进程退出。
 */
export function startEventLoopLagMonitor(warn: (message: string, snapshot: EventLoopLagSnapshot) => void): () => void {
	const histogram = monitorEventLoopDelay({ resolution: 20 });
	histogram.enable();

	const timer = setInterval(() => {
		const snapshot = {
			maxMs: Math.round(histogram.max / 1e6),
			p99Ms: Math.round(histogram.percentile(99) / 1e6),
		};
		histogram.reset();
		if (snapshot.maxMs >= EVENT_LOOP_LAG_WARN_MS) {
			warn(`Event loop blocked: max ${snapshot.maxMs}ms, p99 ${snapshot.p99Ms}ms in the last ${CHECK_INTERVAL_MS / 1000}s`, snapshot);
		}
	}, CHECK_INTERVAL_MS);
	timer.unref();

	return () => {
		clearInterval(timer);
		histogram.disable();
	};
}
