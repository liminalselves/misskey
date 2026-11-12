<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.page">
	<UserUsageReport
		ref="reportEl"
		reportEndpoint="agents/usage/report"
		billingEndpoint="agents/billing-logs"
		logsEndpoint="agents/usage/logs"
		:baseParams="{}"
		storageKey="agentsMyUsage"
	>
		<template #afterOverview>
			<!-- 兑换卡密 -->
			<div :class="$style.redeemSection">
				<div :class="$style.redeemRow">
					<MkInput v-model="redeemCode" type="text" :class="$style.redeemInput" autocomplete="off">
						<template #label>{{ i18n.ts._agents.redeemCodeInput }}</template>
					</MkInput>
					<MkButton primary rounded :disabled="redeeming || !redeemCode.trim()" @click="redeem">
						<i class="ti ti-ticket"></i> {{ i18n.ts._agents.redeemCodeSubmit }}
					</MkButton>
				</div>
				<div v-if="redeemPurchaseUrl" :class="$style.redeemPurchaseHint">
					{{ i18n.ts._agents.redeemPurchaseHint }}
					<a :href="redeemPurchaseUrl" target="_blank" rel="noopener noreferrer" :class="$style.redeemPurchaseLink">{{ i18n.ts._agents.redeemPurchaseLink }}<i class="ti ti-external-link" :class="$style.redeemPurchaseLinkIcon"></i></a>
				</div>
			</div>
		</template>
	</UserUsageReport>
</div>
</template>

<script lang="ts" setup>
import { computed, ref, useTemplateRef } from 'vue';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import UserUsageReport from '@/components/agent-report/UserUsageReport.vue';
import { misskeyApi, formatApiError } from '@/utility/misskey-api.js';
import { instance } from '@/instance.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';

const reportEl = useTemplateRef('reportEl');
const redeemCode = ref('');
const redeeming = ref(false);

// 管理员配置的卡密购买链接；未配置时不展示购买入口
const redeemPurchaseUrl = computed(() => {
	const u = (instance as Record<string, unknown>).agentRedeemPurchaseUrl;
	return typeof u === 'string' && u.trim() !== '' ? u.trim() : null;
});

async function redeem() {
	const code = redeemCode.value.trim();
	if (!code) return;
	redeeming.value = true;
	try {
		const result = await misskeyApi('agents/redeem-code' as Parameters<typeof misskeyApi>[0], { code } as never) as unknown as { creditAmount: number; newBalance: number };
		redeemCode.value = '';
		os.toast(i18n.tsx._agents.redeemCodeSuccess({ amount: String(result.creditAmount) }));
		// Balance card and billing log both change after a redemption.
		reportEl.value?.reloadAll();
	} catch (err) {
		const errCode = (err as { code?: string } | null)?.code;
		os.alert({ type: 'error', text: redeemErrorMessage(errCode) ?? formatApiError(err) });
	} finally {
		redeeming.value = false;
	}
}

function redeemErrorMessage(code: string | undefined): string | null {
	if (!code) return null;
	const map: Record<string, string> = {
		INVALID_REDEEM_CODE: i18n.ts._agents.redeemErrInvalid,
		REDEEM_CODE_REVOKED: i18n.ts._agents.redeemErrRevoked,
		REDEEM_CODE_ALREADY_USED: i18n.ts._agents.redeemErrUsed,
		REDEEM_CODE_EXPIRED: i18n.ts._agents.redeemErrExpired,
	};
	return map[code] ?? null;
}
</script>

<style lang="scss" module>
.page {
	width: 100%;
	padding-bottom: 24px;
}

.redeemSection {
	box-sizing: border-box;
	padding: 16px 18px;
	border-radius: 12px;
	border: solid 1px var(--MI_THEME-divider);
	background: color-mix(in srgb, var(--MI_THEME-panel) 92%, var(--MI_THEME-accent) 2%);
	box-shadow: 0 1px 2px color-mix(in srgb, var(--MI_THEME-fg) 3%, transparent);
}

.redeemRow {
	display: flex;
	align-items: flex-end;
	gap: 10px;
}

.redeemInput {
	flex: 1;
	min-width: 0;
}

.redeemPurchaseHint {
	margin-top: 10px;
	font-size: 0.85em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.redeemPurchaseLink {
	display: inline-flex;
	align-items: center;
	gap: 0.25em;
	margin-left: 0.4em;
	color: var(--MI_THEME-accent);
	font-weight: 600;
	text-decoration: none;

	&:hover {
		text-decoration: underline;
	}
}

.redeemPurchaseLinkIcon {
	font-size: 0.85em;
}
</style>
