<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions">
	<div class="_spacer" style="--MI_SPACER-w: 960px;">
		<div class="_gaps">
			<section :class="$style.hero">
				<div :class="$style.heroIcon"><i class="ti ti-user-question"></i></div>
				<div :class="$style.heroBody">
					<div :class="$style.kicker">智能体创作帮助</div>
					<h1 :class="$style.title">把角色、记忆、绘图和对话规则放在正确的位置</h1>
					<p :class="$style.lead">一个好智能体不只是“人设写得长”。更重要的是：角色知道自己是谁、怎么说话、什么时候引用世界书、什么时候绘图，以及哪些行为不该做。</p>
				</div>
			</section>

			<div :class="$style.quickGrid">
				<section v-for="item in quickCards" :key="item.title" :class="$style.quickCard">
					<i :class="item.icon"></i>
					<div>
						<div :class="$style.quickTitle">{{ item.title }}</div>
						<div :class="$style.quickText">{{ item.text }}</div>
					</div>
				</section>
			</div>

			<MkFolder :defaultOpen="true">
				<template #icon><i class="ti ti-route"></i></template>
				<template #label>推荐创作流程</template>
				<div :class="$style.stepList">
					<div v-for="(step, index) in creationSteps" :key="step.title" :class="$style.stepItem">
						<div :class="$style.stepNo">{{ index + 1 }}</div>
						<div>
							<div :class="$style.blockTitle">{{ step.title }}</div>
							<p>{{ step.text }}</p>
						</div>
					</div>
				</div>
			</MkFolder>

			<MkFolder :defaultOpen="true">
				<template #icon><i class="ti ti-id"></i></template>
				<template #label>基础信息怎么写</template>
				<div class="_gaps_s">
					<div :class="$style.guideBlock">
						<div :class="$style.blockTitle">名称与简介</div>
						<p>名称用于识别角色；简介主要给用户看，适合写角色卖点、聊天主题和适合场景。简介不要堆后台设定，也不要写必须严格执行的规则。</p>
					</div>
					<div :class="$style.exampleBox">
						<div :class="$style.exampleLabel">简介示例</div>
						<pre>温柔但敏锐的旧书店店主，擅长陪你拆解梦境、写信和整理复杂心情。</pre>
					</div>
					<div :class="$style.guideBlock">
						<div :class="$style.blockTitle">公开角色提示词</div>
						<p>开启后，广场详情页会展示角色提示词，方便别人参考你的设计。默认建议关闭；如果角色包含私设、剧情谜底、隐藏规则或不想公开的写法，请保持关闭。</p>
					</div>
				</div>
			</MkFolder>

			<MkFolder :defaultOpen="true">
				<template #icon><i class="ti ti-brain"></i></template>
				<template #label>人设字段怎么写</template>
				<div class="_gaps_s">
					<div :class="$style.fieldGrid">
						<div v-for="field in personaFields" :key="field.name" :class="$style.fieldCard">
							<div :class="$style.fieldName">{{ field.name }}</div>
							<p>{{ field.text }}</p>
						</div>
					</div>
					<div :class="$style.tipBox">
						<i class="ti ti-bulb"></i>
						<span>人设里优先写清晰规则。模型更容易遵守“遇到 X 时做 Y”，而不是一长串抽象形容词。</span>
					</div>
					<div :class="$style.exampleBox">
						<div :class="$style.exampleLabel">人设片段示例</div>
						<pre>你是旧书店“雨灯”的店主。你说话温和、克制，会先确认用户的情绪，再给出建议。
你不会替用户做重大决定；当用户要求你保证未来结果时，你会提醒“不确定性仍然存在”。
你喜欢用书页、雨声、灯光作比喻，但不要每句话都使用比喻。</pre>
					</div>
				</div>
			</MkFolder>

			<MkFolder :defaultOpen="true">
				<template #icon><i class="ti ti-photo-spark"></i></template>
				<template #label>生图相关设定怎么写</template>
				<div class="_gaps_s">
					<MkInfo>请在角色设定里补充稳定的视觉资料，例如外貌、服饰、常见场景和画风偏好。用户聊天时，智能体会结合这些资料和当时剧情来组织生图。</MkInfo>
					<div :class="$style.guideBlock">
						<div :class="$style.blockTitle">把“画面稳定要素”写进人设或世界书</div>
						<p>如果希望智能体经常生成角色插图，请在人设或世界书里写清角色外貌、服饰、常见场景和画风偏好。不要只写“可爱少女”“帅气青年”，要写成角色长期稳定的视觉设定。</p>
					</div>
					<div :class="$style.fieldGrid">
						<div v-for="item in drawingFields" :key="item.name" :class="$style.fieldCard">
							<div :class="$style.fieldName">{{ item.name }}</div>
							<p>{{ item.text }}</p>
						</div>
					</div>
					<div :class="$style.exampleBox">
						<div :class="$style.exampleLabel">适合写进人设的视觉设定示例</div>
						<pre>视觉设定：
外貌：浅栗色齐肩短发，发尾微卷，琥珀色眼睛，左眼下有一颗小泪痣。
服饰：常穿米白色针织开衫、深绿色长裙和棕色短靴，胸前挂着黄铜钥匙项链。
气质：安静、亲切、带一点旧书店店主的书卷气。
常见场景：雨天书店、暖黄色台灯、木质书架、窗边茶杯。
生图偏好：优先生成半身或近景构图，氛围温柔安静，避免夸张动作和过度暴露服饰。</pre>
					</div>
					<div :class="$style.exampleBox">
						<div :class="$style.exampleLabel">适合写进世界书的视觉条目示例</div>
						<pre>标题：苏的外观
触发方式：常驻，或关键词“苏、店主、画像、插图”
内容：苏的固定外观是浅栗色齐肩短发、琥珀色眼睛、左眼下小泪痣。她常穿米白色针织开衫、深绿色长裙、棕色短靴，佩戴黄铜钥匙项链。生成她的插图时，应优先保留这些识别特征。</pre>
					</div>
					<div :class="$style.warningBox">
						<i class="ti ti-alert-triangle"></i>
						<span>不要在角色设定里写一次性的命令式生图提示词，例如“请画出……”。这里应写长期设定：角色长什么样、常穿什么、适合什么氛围、哪些视觉特征必须保留。</span>
					</div>
				</div>
			</MkFolder>

			<MkFolder :defaultOpen="true">
				<template #icon><i class="ti ti-message"></i></template>
				<template #label>对话、问候语与示例</template>
				<div class="_gaps_s">
					<div :class="$style.guideBlock">
						<div :class="$style.blockTitle">问候语</div>
						<p>问候语是用户第一次进入会话时看到的开场。它应该给用户一个能接住的话题，而不是只说“你好”。</p>
					</div>
					<div :class="$style.exampleBox">
						<div :class="$style.exampleLabel">问候语示例</div>
						<pre>店门铃响了一声。我从书堆后抬头：“你来得正好。今天想找一本书，还是想把某件事先放在这里？”</pre>
					</div>
					<div :class="$style.guideBlock">
						<div :class="$style.blockTitle">示例对话</div>
						<p>示例对话用于给模型参考文风和互动方式，不会被当作真实历史。建议写 2 到 6 轮，覆盖角色如何安慰、拒绝、追问和推进话题。</p>
					</div>
				</div>
			</MkFolder>

			<MkFolder :defaultOpen="true">
				<template #icon><i class="ti ti-book"></i></template>
				<template #label>世界书、记忆与长上下文</template>
				<div class="_gaps_s">
					<p :class="$style.paragraph">世界书适合放“不需要每句话都出现，但命中时必须知道”的设定，例如地点、组织、人物关系、专有名词、剧情阶段、角色外观细节。</p>
					<div :class="$style.modeGrid">
						<div v-for="mode in worldbookModes" :key="mode.name" :class="$style.modeCard">
							<div :class="$style.modeName"><i :class="mode.icon"></i>{{ mode.name }}</div>
							<p>{{ mode.text }}</p>
						</div>
					</div>
					<div :class="$style.tipBox">
						<i class="ti ti-pin"></i>
						<span>常驻条目适合核心规则；关键词条目适合地点、人物、道具；手动条目适合作者主动触发的剧情阶段或隐藏设定。</span>
					</div>
				</div>
			</MkFolder>

			<MkFolder :defaultOpen="false">
				<template #icon><i class="ti ti-file-zip"></i></template>
				<template #label>压缩、长期记忆和上下文管理</template>
				<div class="_gaps_s">
					<p :class="$style.paragraph">长对话会逐渐超过模型上下文。压缩功能会把旧对话整理成摘要，长期记忆会保存更稳定的用户偏好和重要事实。</p>
					<div :class="$style.fieldGrid">
						<div :class="$style.fieldCard">
							<div :class="$style.fieldName">不要把所有设定都塞进问候语</div>
							<p>问候语只负责开场。稳定设定放人设，条件触发信息放世界书，长期事实交给记忆。</p>
						</div>
						<div :class="$style.fieldCard">
							<div :class="$style.fieldName">重要规则写得短而明确</div>
							<p>越核心的规则越要靠前、越短。复杂背景拆进世界书，减少每轮上下文压力。</p>
						</div>
					</div>
				</div>
			</MkFolder>

			<MkFolder :defaultOpen="false">
				<template #icon><i class="ti ti-markdown"></i></template>
				<template #label>对话输出支持的语法</template>
				<div class="_gaps_s">
					<p :class="$style.paragraph">智能体在对话界面输出时支持 Markdown 和部分 MFM 语法，例如标题、加粗、列表、引用、代码块、表格，以及 MFM 的放大、旋转、颜色等效果。</p>
					<div :class="$style.syntaxPreview">
						<div>
							<div :class="$style.exampleLabel">角色可输出</div>
							<pre>**重点提示**
- 第一条
- 第二条
> 这是一段引用</pre>
						</div>
						<div>
							<div :class="$style.exampleLabel">适合用在</div>
							<p>教学型角色、跑团主持、代码助手、占卜/报告类角色、需要分步骤输出的角色。</p>
						</div>
					</div>
					<MkButton rounded @click="goSyntaxGuide"><i class="ti ti-external-link"></i> 查看语法指南</MkButton>
				</div>
			</MkFolder>

			<MkFolder :defaultOpen="false">
				<template #icon><i class="ti ti-shield-check"></i></template>
				<template #label>安全、发布与版本</template>
				<div class="_gaps_s">
					<p :class="$style.paragraph">角色提交审核后，广场展示使用已发布版本。草稿里的新内容不会立刻影响广场，直到你发布包含这些内容的新版本。</p>
					<p :class="$style.paragraph">AI 每次输出都会经过外部安全审查。设计角色时请避免诱导违法、暴力、仇恨、骚扰、露骨色情、自伤鼓励、隐私侵犯等不安全内容。</p>
					<p :class="$style.paragraph">如果你的角色会处理敏感主题，请在人设里写清边界：保持克制、不给危险操作步骤、不鼓励伤害行为，必要时引导用户寻求现实帮助。</p>
				</div>
			</MkFolder>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import MkButton from '@/components/MkButton.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkInfo from '@/components/MkInfo.vue';
import { definePage } from '@/page.js';
import { useRouter } from '@/router.js';
import type { PageHeaderItem } from '@/types/page-header.js';

const router = useRouter();

const quickCards = [
	{ icon: 'ti ti-id', title: '简介给用户看', text: '用一句话说明角色卖点和适合场景，不负责约束模型行为。' },
	{ icon: 'ti ti-brain', title: '人设给模型看', text: '身份、目标、边界、说话方式和行为规则应该写在人设字段。' },
	{ icon: 'ti ti-book', title: '知识放世界书', text: '大量设定拆成条目，通过关键词、常驻或手动方式注入。' },
	{ icon: 'ti ti-photo-spark', title: '绘图要写视觉信息', text: '外貌、服饰、姿势、表情、场景、光线和构图越具体，出图越稳定。' },
];

const creationSteps = [
	{ title: '先定角色核心', text: '用三句话确定角色是谁、想做什么、不能做什么。' },
	{ title: '再写说话方式', text: '明确称呼、语气、句子长度、是否主动追问、是否使用特殊口癖。' },
	{ title: '把长设定拆进世界书', text: '地点、组织、角色关系、道具和剧情阶段不要全塞进人设。' },
	{ title: '需要绘图时补视觉设定', text: '把角色外貌、服饰和常见场景写成可被画出来的描述。' },
	{ title: '最后用示例对话校准', text: '示例对话能让模型学到你想要的节奏、边界和文风。' },
];

const personaFields = [
	{ name: '人格', text: '写角色是什么样的人、重视什么、会如何判断和回应。' },
	{ name: '背景', text: '写角色经历、世界观位置、重要关系和长期目标。' },
	{ name: '说话风格', text: '写语气、句长、称呼、是否使用比喻、是否主动追问。' },
	{ name: '禁止行为', text: '写角色不应该做什么，例如剧透、越界承诺、脱离设定。' },
];

const drawingFields = [
	{ name: '外貌', text: '发色、发型、眼睛、年龄感、体型、明显特征，例如泪痣、伤疤、耳饰。' },
	{ name: '服饰', text: '衣服款式、颜色、材质、配饰、鞋子。服饰越稳定，角色越容易被识别。' },
	{ name: '表情与动作', text: '微笑、侧头、看向镜头、拿书、站在窗边等，会直接影响画面叙事。' },
	{ name: '场景与光线', text: '室内/室外、时间、天气、背景物件、冷暖光、逆光、柔光等。' },
	{ name: '构图', text: '头像、半身、全身、近景、俯视、背影、双人构图等。' },
	{ name: '风格', text: '动漫、厚涂、水彩、电影感、写实、Q 版等。不要同时堆太多互相冲突的风格。' },
];

const worldbookModes = [
	{ icon: 'ti ti-key', name: '关键词', text: '用户消息命中关键词时注入。适合地点、人物、组织、道具和专有名词。' },
	{ icon: 'ti ti-hand-click', name: '手动', text: '只有出现 [[wb:标题或ID]] 时命中。适合隐藏设定或作者控制的剧情阶段。' },
	{ icon: 'ti ti-pin', name: '常驻', text: '每轮都参与注入候选。适合核心世界规则，但不建议放太多。' },
];

const headerActions = computed<PageHeaderItem[]>(() => [{
	icon: 'ti ti-markdown',
	text: '语法指南',
	handler: () => {
		goSyntaxGuide();
	},
}]);

function goSyntaxGuide() {
	router.push('/agents/syntax-guide' as const);
}

definePage(() => ({
	title: '智能体创作帮助',
	icon: 'ti ti-help-circle',
}));
</script>

<style lang="scss" module>
.hero {
	display: grid;
	grid-template-columns: auto minmax(0, 1fr);
	gap: 18px;
	align-items: center;
	padding: 22px;
	border-radius: var(--MI-radius);
	border: solid 1px color-mix(in srgb, var(--MI_THEME-accent) 24%, var(--MI_THEME-divider));
	background:
		linear-gradient(135deg, color-mix(in srgb, var(--MI_THEME-accent) 14%, transparent), transparent 58%),
		color-mix(in srgb, var(--MI_THEME-panel) 94%, transparent);
}

.heroIcon {
	width: 58px;
	height: 58px;
	border-radius: 18px;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 1.9rem;
	background: color-mix(in srgb, var(--MI_THEME-accent) 18%, transparent);
	color: var(--MI_THEME-accent);
	border: solid 1px color-mix(in srgb, var(--MI_THEME-accent) 35%, transparent);
}

.heroBody {
	min-width: 0;
}

.kicker {
	font-size: 0.82rem;
	font-weight: 800;
	color: var(--MI_THEME-accent);
	margin-bottom: 4px;
}

.title {
	margin: 0;
	font-size: 1.45rem;
	line-height: 1.25;
}

.lead {
	margin: 8px 0 0;
	line-height: 1.6;
	color: var(--MI_THEME-fgTransparentWeak);
}

.quickGrid,
.fieldGrid,
.modeGrid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
}

.quickCard,
.fieldCard,
.modeCard,
.guideBlock,
.tipBox,
.warningBox,
.exampleBox,
.syntaxPreview,
.stepItem {
	border: solid 1px var(--MI_THEME-divider);
	border-radius: var(--MI-radius);
	background: color-mix(in srgb, var(--MI_THEME-panel) 92%, transparent);
}

.quickCard {
	display: grid;
	grid-template-columns: auto minmax(0, 1fr);
	gap: 10px;
	padding: 14px;
	align-items: start;

	> i {
		color: var(--MI_THEME-accent);
		font-size: 1.25rem;
		margin-top: 2px;
	}
}

.quickTitle,
.blockTitle,
.fieldName,
.modeName {
	font-weight: 800;
}

.quickText,
.fieldCard p,
.modeCard p,
.guideBlock p,
.paragraph,
.syntaxPreview p,
.stepItem p {
	margin: 6px 0 0;
	line-height: 1.6;
	color: var(--MI_THEME-fgTransparentWeak);
}

.fieldCard,
.modeCard,
.guideBlock,
.exampleBox,
.syntaxPreview {
	padding: 14px;
}

.stepList {
	display: grid;
	gap: 10px;
}

.stepItem {
	display: grid;
	grid-template-columns: auto minmax(0, 1fr);
	gap: 12px;
	padding: 14px;
}

.stepNo {
	width: 30px;
	height: 30px;
	border-radius: 999px;
	display: flex;
	align-items: center;
	justify-content: center;
	background: var(--MI_THEME-accent);
	color: var(--MI_THEME-accentFg);
	font-weight: 800;
}

.modeName {
	display: flex;
	align-items: center;
	gap: 6px;
	color: var(--MI_THEME-accent);
}

.tipBox,
.warningBox {
	display: flex;
	align-items: flex-start;
	gap: 10px;
	padding: 12px 14px;
	line-height: 1.55;
	color: var(--MI_THEME-fgTransparentWeak);

	i {
		margin-top: 3px;
	}
}

.tipBox i {
	color: var(--MI_THEME-accent);
}

.warningBox {
	border-color: color-mix(in srgb, var(--MI_THEME-warn) 45%, var(--MI_THEME-divider));
	background: color-mix(in srgb, var(--MI_THEME-warn) 12%, var(--MI_THEME-panel));

	i {
		color: var(--MI_THEME-warn);
	}
}

.exampleLabel {
	font-size: 0.82rem;
	font-weight: 800;
	color: var(--MI_THEME-accent);
	margin-bottom: 8px;
}

.exampleBox pre,
.syntaxPreview pre {
	margin: 0;
	white-space: pre-wrap;
	word-break: break-word;
	font-family: var(--MI-fontMono, monospace);
	line-height: 1.55;
	color: var(--MI_THEME-fg);
}

.syntaxPreview {
	display: grid;
	grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
	gap: 14px;
}

@container (max-width: 620px) {
	.hero,
	.quickGrid,
	.fieldGrid,
	.modeGrid,
	.syntaxPreview {
		grid-template-columns: 1fr;
	}
}
</style>
