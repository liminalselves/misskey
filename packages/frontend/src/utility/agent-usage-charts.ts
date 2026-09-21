/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Chart } from 'chart.js';
import type { Plugin } from 'chart.js';
import { i18n } from '@/i18n.js';

export type AgentUsageBucket = {
	bucketStart: string;
	total: number;
	success: number;
	failed: number;
	aborted: number;
	freeCalls: number;
	paidCalls: number;
	creditsCharged: number;
	promptTokens: number;
	completionTokens: number;
	avgDurationMs: number | null;
};

export type AgentUsageKindRow = {
	usageKind: string;
	total: number;
	freeCalls: number;
	paidCalls: number;
	creditsCharged: number;
};

export function agentUsageKindLabel(kind: string): string {
	const t = i18n.ts._agents;
	switch (kind) {
		case 'chat': return t.usageLogKindChat;
		case 'compression': return t.usageLogKindCompression;
		case 'image_generation': return t.usageLogKindImageGeneration;
		case 'vision': return t.usageLogKindVision;
		case 'sticker_description': return t.usageLogKindStickerDescription;
		case 'proactive_random': return t.usageLogKindProactiveRandom;
		case 'proactive_scheduled': return t.usageLogKindProactiveScheduled;
		default: return kind;
	}
}

function cssColor(name: string, fallback: string): string {
	const v = getComputedStyle(window.document.documentElement).getPropertyValue(name).trim();
	return v || fallback;
}

function fmtTokenTick(v: number): string {
	if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
	if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
	return String(Math.round(v));
}

// 用途构成环形图配色：与状态色（成功绿/失败红/中断黄）拉开，chat 用主题色突出主用途
const USAGE_KIND_COLORS: Record<string, string> = {
	chat: '#7cb342',
	compression: '#9fb3c8',
	image_generation: '#f2a03d',
	vision: '#4db6ac',
	sticker_description: '#b085cc',
	proactive_random: '#64b5f6',
	proactive_scheduled: '#e08bb5',
};
const USAGE_KIND_FALLBACK_COLORS = ['#90a4ae', '#a1887f', '#9575cd', '#4dd0e1', '#dce775'];

export type AgentUsageChartElements = {
	requests?: HTMLCanvasElement | null;
	credits?: HTMLCanvasElement | null;
	tokens?: HTMLCanvasElement | null;
	usageKind?: HTMLCanvasElement | null;
};

/**
 * 智能体用量图表组（请求趋势 / 扣费趋势 / Token 趋势 / 用途构成），
 * 用户侧「我的用量」与管理端用户用量 tab 共用。
 * 首次 render 按需建图，后续 render 原地更新数据；组件卸载时 destroy。
 */
export class AgentUsageCharts {
	private requestsChart: Chart | null = null;
	private creditsChart: Chart | null = null;
	private tokensChart: Chart | null = null;
	private usageKindChart: Chart | null = null;
	private readonly usageKindCenterText = { total: 0, label: '' };

	private readonly usageKindCenterTextPlugin: Plugin<'doughnut'> = {
		id: 'usageKindCenterText',
		afterDraw: (chart) => {
			// chart.js 类型未标 undefined，但数据为空时第一个扇区并不存在
			const first = chart.getDatasetMeta(0).data[0] as { x: number; y: number } | undefined;
			if (first == null) return;
			const { x, y } = first;
			const ctx = chart.ctx;
			ctx.save();
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillStyle = cssColor('--MI_THEME-fg', '#5f6c7b');
			ctx.font = '700 20px sans-serif';
			ctx.fillText(String(this.usageKindCenterText.total), x, y - 7);
			ctx.globalAlpha = 0.56;
			ctx.font = '11px sans-serif';
			ctx.fillText(this.usageKindCenterText.label, x, y + 12);
			ctx.restore();
		},
	};

	constructor(private els: AgentUsageChartElements) {}

	render(buckets: AgentUsageBucket[], unit: 'hour' | 'day', byUsageKind: AgentUsageKindRow[]): void {
		// 宿主用 v-if 切换空数据占位时会卸载 canvas：引用已脱离文档的旧实例销毁重建
		if (this.requestsChart != null && !this.requestsChart.canvas.isConnected) { this.requestsChart.destroy(); this.requestsChart = null; }
		if (this.creditsChart != null && !this.creditsChart.canvas.isConnected) { this.creditsChart.destroy(); this.creditsChart = null; }
		if (this.tokensChart != null && !this.tokensChart.canvas.isConnected) { this.tokensChart.destroy(); this.tokensChart = null; }
		if (this.usageKindChart != null && !this.usageKindChart.canvas.isConnected) { this.usageKindChart.destroy(); this.usageKindChart = null; }

		const colors = {
			success: cssColor('--MI_THEME-success', '#4caf50'),
			error: cssColor('--MI_THEME-error', '#ec4137'),
			warn: cssColor('--MI_THEME-warn', '#ecb637'),
			accent: cssColor('--MI_THEME-accent', '#86b300'),
			fg: cssColor('--MI_THEME-fg', '#5f6c7b'),
		};
		const gridColor = 'rgba(128, 128, 128, 0.15)';
		// 成功率折线用对比蓝：与成功绿/失败红/中断黄及主题 accent 都拉开
		const rateColor = '#64b5f6';

		// 全部桶在同一天时 X 标签只显示时刻
		const bucketDates = buckets.map(b => new Date(b.bucketStart));
		const sameDay = unit === 'hour' && bucketDates.length > 0 && bucketDates.every(dt =>
			dt.getFullYear() === bucketDates[0].getFullYear() &&
			dt.getMonth() === bucketDates[0].getMonth() &&
			dt.getDate() === bucketDates[0].getDate());
		const labels = buckets.map(b => {
			const d = new Date(b.bucketStart);
			if (unit === 'day') return `${d.getMonth() + 1}/${d.getDate()}`;
			const hh = `${d.getHours().toString().padStart(2, '0')}:00`;
			return sameDay ? hh : `${d.getMonth() + 1}/${d.getDate()} ${hh}`;
		});

		this.renderRequests(labels, buckets, colors, gridColor, rateColor);
		this.renderCredits(labels, buckets, colors, gridColor);
		this.renderTokens(labels, buckets, colors, gridColor);
		this.renderUsageKind(byUsageKind, colors);
	}

	private renderRequests(labels: string[], buckets: AgentUsageBucket[], colors: Record<string, string>, gridColor: string, rateColor: string): void {
		if (this.requestsChart == null && this.els.requests != null) {
			this.requestsChart = new Chart(this.els.requests, {
				data: {
					labels: [],
					datasets: [
						{ type: 'bar', label: i18n.ts._agents.adminReportsSuccess, backgroundColor: colors.success, data: [], stack: 'status', pointStyle: 'rect' },
						{ type: 'bar', label: i18n.ts._agents.myStatsStatusFailed, backgroundColor: colors.error, data: [], stack: 'status', pointStyle: 'rect' },
						{ type: 'bar', label: i18n.ts._agents.myStatsStatusAborted, backgroundColor: colors.warn, data: [], stack: 'status', pointStyle: 'rect' },
						{
							type: 'line',
							label: i18n.ts._agents.adminReportsSuccessRate,
							borderColor: rateColor,
							backgroundColor: rateColor,
							pointRadius: 2,
							pointHoverRadius: 4,
							borderWidth: 2,
							tension: 0.3,
							spanGaps: true,
							yAxisID: 'y1',
							pointStyle: 'line',
							// chart.js 按 order 升序排序后倒序绘制：order 越小越后画（越上层），折线置顶不被柱子遮挡
							order: -1,
							data: [],
						},
					],
				},
				options: {
					aspectRatio: 2.6,
					scales: {
						x: {
							stacked: true,
							grid: { display: false },
							ticks: { color: colors.fg, maxTicksLimit: 12, maxRotation: 0 },
						},
						y: {
							stacked: true,
							beginAtZero: true,
							ticks: { color: colors.fg, precision: 0 },
							grid: { color: gridColor },
						},
						y1: {
							position: 'right',
							min: 0,
							max: 100,
							grid: { drawOnChartArea: false },
							ticks: { color: rateColor, callback: (v) => `${v}%` },
						},
					},
					plugins: {
						legend: { position: 'bottom', labels: { color: colors.fg, boxWidth: 12, usePointStyle: true } },
					},
				},
			});
		}
		if (this.requestsChart != null) {
			this.requestsChart.data.labels = labels;
			this.requestsChart.data.datasets[0].data = buckets.map(b => b.success);
			this.requestsChart.data.datasets[1].data = buckets.map(b => b.failed);
			this.requestsChart.data.datasets[2].data = buckets.map(b => b.aborted);
			this.requestsChart.data.datasets[3].data = buckets.map(b => b.total > 0 ? Math.round((b.success / b.total) * 1000) / 10 : null);
			this.requestsChart.update();
		}
	}

	private renderCredits(labels: string[], buckets: AgentUsageBucket[], colors: Record<string, string>, gridColor: string): void {
		if (this.creditsChart == null && this.els.credits != null) {
			this.creditsChart = new Chart(this.els.credits, {
				type: 'bar',
				data: {
					labels: [],
					datasets: [{ label: i18n.ts._agents.adminReportsCreditsCharged, backgroundColor: colors.accent, data: [] }],
				},
				options: {
					aspectRatio: 2.6,
					scales: {
						x: {
							grid: { display: false },
							ticks: { color: colors.fg, maxTicksLimit: 12, maxRotation: 0 },
						},
						y: {
							beginAtZero: true,
							ticks: { color: colors.fg },
							grid: { color: gridColor },
						},
					},
					plugins: {
						legend: { display: false },
					},
				},
			});
		}
		if (this.creditsChart != null) {
			this.creditsChart.data.labels = labels;
			this.creditsChart.data.datasets[0].data = buckets.map(b => b.creditsCharged);
			this.creditsChart.update();
		}
	}

	private renderTokens(labels: string[], buckets: AgentUsageBucket[], colors: Record<string, string>, gridColor: string): void {
		const completionColor = '#f2a03d';
		if (this.tokensChart == null && this.els.tokens != null) {
			this.tokensChart = new Chart(this.els.tokens, {
				type: 'line',
				data: {
					labels: [],
					datasets: [
						{
							label: '输入 tokens',
							borderColor: colors.accent,
							backgroundColor: colors.accent,
							pointRadius: 0,
							borderWidth: 2,
							tension: 0.3,
							data: [],
						},
						{
							label: '输出 tokens',
							borderColor: completionColor,
							backgroundColor: completionColor,
							pointRadius: 0,
							borderWidth: 2,
							tension: 0.3,
							data: [],
						},
					],
				},
				options: {
					aspectRatio: 2.6,
					scales: {
						x: {
							grid: { display: false },
							ticks: { color: colors.fg, maxTicksLimit: 12, maxRotation: 0 },
						},
						y: {
							beginAtZero: true,
							ticks: { color: colors.fg, callback: (v) => fmtTokenTick(Number(v)) },
							grid: { color: gridColor },
						},
					},
					plugins: {
						legend: { position: 'bottom', labels: { color: colors.fg, boxWidth: 12, usePointStyle: true } },
						tooltip: {
							callbacks: {
								label: (ctx) => ` ${ctx.dataset.label}: ${Number(ctx.parsed.y).toLocaleString()}`,
							},
						},
					},
				},
			});
		}
		if (this.tokensChart != null) {
			this.tokensChart.data.labels = labels;
			this.tokensChart.data.datasets[0].data = buckets.map(b => b.promptTokens);
			this.tokensChart.data.datasets[1].data = buckets.map(b => b.completionTokens);
			this.tokensChart.update();
		}
	}

	private renderUsageKind(byUsageKind: AgentUsageKindRow[], colors: Record<string, string>): void {
		const rows = byUsageKind.filter(k => k.total > 0);
		// 首帧即带数据建图：先建空图再 update 会让 doughnut 在空数据首绘时崩（datasetIndex）
		if (this.usageKindChart == null) {
			if (this.els.usageKind == null || rows.length === 0) return;
			this.usageKindChart = new Chart(this.els.usageKind, {
				type: 'doughnut',
				data: {
					labels: rows.map(k => agentUsageKindLabel(k.usageKind)),
					datasets: [{
						data: rows.map(k => k.total),
						backgroundColor: rows.map((k, i) =>
							USAGE_KIND_COLORS[k.usageKind] ?? USAGE_KIND_FALLBACK_COLORS[i % USAGE_KIND_FALLBACK_COLORS.length]),
						borderWidth: 0,
					}],
				},
				options: {
					aspectRatio: 1.9,
					cutout: '62%',
					plugins: {
						legend: { position: 'bottom', labels: { color: colors.fg, boxWidth: 12, usePointStyle: true } },
						tooltip: {
							callbacks: {
								label: (ctx) => ` ${ctx.label}: ${Number(ctx.parsed).toLocaleString()}`,
							},
						},
					},
				},
				plugins: [this.usageKindCenterTextPlugin],
			});
			this.usageKindCenterText.total = rows.reduce((s, k) => s + k.total, 0);
			this.usageKindCenterText.label = i18n.ts._agents.adminReportsTotal;
			return;
		}
		this.usageKindChart.data.labels = rows.map(k => agentUsageKindLabel(k.usageKind));
		this.usageKindChart.data.datasets[0].data = rows.map(k => k.total);
		this.usageKindChart.data.datasets[0].backgroundColor = rows.map((k, i) =>
			USAGE_KIND_COLORS[k.usageKind] ?? USAGE_KIND_FALLBACK_COLORS[i % USAGE_KIND_FALLBACK_COLORS.length]);
		this.usageKindCenterText.total = rows.reduce((s, k) => s + k.total, 0);
		this.usageKindCenterText.label = i18n.ts._agents.adminReportsTotal;
		this.usageKindChart.update();
	}

	destroy(): void {
		this.requestsChart?.destroy();
		this.creditsChart?.destroy();
		this.tokensChart?.destroy();
		this.usageKindChart?.destroy();
		this.requestsChart = null;
		this.creditsChart = null;
		this.tokensChart = null;
		this.usageKindChart = null;
	}
}
