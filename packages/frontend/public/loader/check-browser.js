/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/*
 * ブラウザ互換性チェック / Browser compatibility gate
 *
 * このファイルは boot.js より前に、いかなる古いブラウザでも「構文解析できて実行できる」必要があるため、
 * ES5 の範囲のみで記述する（アロー関数・テンプレートリテラル・const/let・async/await・分割代入などは使わない）。
 * フロントエンド本体は chrome116 / firefox116 / safari16 を最低ターゲットとしてビルドされているため、
 * それらに満たないブラウザでは本体スクリプト(boot.js)が構文解析すらできずに白画面になりうる。
 * ここで先回りして機能検出を行い、非対応なら「どのブラウザでも表示できる」非対応ページを描画して本体の起動を止める。
 */
(function () {
	'use strict';

	// すでに別経路で非対応判定済みなら何もしない
	if (window.__misskeyBrowserChecked) return;
	window.__misskeyBrowserChecked = true;

	// 機能検出。chrome116 / firefox116 / safari16 のいずれにも存在し、
	// かつ本当に古いブラウザ（IE・旧Android WebView・旧Safari 等）には存在しない API を選ぶ。
	// 検出自体が例外を投げた場合は「対応」とみなす（誤判定で締め出さない = fail open）。
	function isSupported() {
		try {
			// 動的 import などを使う ES Module 形式のスクリプト対応
			var script = document.createElement('script');
			if (!('noModule' in script)) return false;

			if (typeof window.Promise === 'undefined' || typeof window.Promise.any !== 'function') return false;
			if (typeof window.BigInt === 'undefined') return false;
			if (typeof window.WeakRef === 'undefined') return false;
			if (typeof window.structuredClone !== 'function') return false;
			if (typeof window.ResizeObserver === 'undefined') return false;
			if (typeof window.IntersectionObserver === 'undefined') return false;
			if (typeof window.queueMicrotask !== 'function') return false;

			if (typeof Object.hasOwn !== 'function') return false;
			if (typeof Object.fromEntries !== 'function') return false;

			if (typeof Array.prototype.at !== 'function') return false;
			if (typeof Array.prototype.flat !== 'function') return false;
			if (typeof Array.prototype.findLast !== 'function') return false;

			if (typeof String.prototype.at !== 'function') return false;
			if (typeof String.prototype.replaceAll !== 'function') return false;

			return true;
		} catch (e) {
			return true;
		}
	}

	if (isSupported()) return;

	// ここから先は非対応確定。本体の起動を止める。
	window.__misskeyUnsupportedBrowser = true;

	// 多言語の文言（最小限。未知の言語は英語にフォールバック）
	var STRINGS = {
		'en': {
			title: 'Your browser is not supported',
			lead: 'This server runs Misskey, which requires a modern browser to work properly.',
			desc: 'Your current browser is too old or lacks the features Misskey needs, so it cannot be displayed correctly.',
			how: 'What you can do',
			s1: 'Update your browser and operating system to the latest version',
			s2: 'Use a recent version of Chrome, Firefox, Edge or Safari',
			s3: 'Avoid opening this page inside an in-app browser (open it in a real browser instead)',
			req: 'Recommended: Chrome 116+, Firefox 116+, Safari 16+ (or newer).',
		},
		'zh-CN': {
			title: '您的浏览器不受支持',
			lead: '本服务器运行的是 Misskey，需要使用较新的浏览器才能正常工作。',
			desc: '您当前的浏览器过旧，或缺少 Misskey 所需的功能，因此无法正常显示页面。',
			how: '您可以尝试',
			s1: '将浏览器及操作系统更新到最新版本',
			s2: '使用较新版本的 Chrome、Firefox、Edge 或 Safari',
			s3: '不要在 App 内置浏览器中打开本页（请改用独立浏览器打开）',
			req: '推荐：Chrome 116+、Firefox 116+、Safari 16+（或更新版本）。',
		},
		'zh-TW': {
			title: '您的瀏覽器不受支援',
			lead: '本伺服器執行的是 Misskey，需要使用較新的瀏覽器才能正常運作。',
			desc: '您目前的瀏覽器過舊，或缺少 Misskey 所需的功能，因此無法正常顯示頁面。',
			how: '您可以嘗試',
			s1: '將瀏覽器與作業系統更新到最新版本',
			s2: '使用較新版本的 Chrome、Firefox、Edge 或 Safari',
			s3: '請勿在 App 內建瀏覽器中開啟本頁（請改用獨立瀏覽器開啟）',
			req: '建議：Chrome 116+、Firefox 116+、Safari 16+（或更新版本）。',
		},
		'ja': {
			title: 'お使いのブラウザには対応していません',
			lead: 'このサーバーは Misskey で動作しており、正しく利用するには新しいブラウザが必要です。',
			desc: 'お使いのブラウザは古すぎるか、Misskey が必要とする機能を備えていないため、正しく表示できません。',
			how: '対処方法',
			s1: 'ブラウザとOSを最新バージョンに更新してください',
			s2: '新しいバージョンの Chrome・Firefox・Edge・Safari をご利用ください',
			s3: 'アプリ内ブラウザではなく、通常のブラウザで開いてください',
			req: '推奨: Chrome 116+ / Firefox 116+ / Safari 16+ （またはそれ以降）。',
		},
		'ko': {
			title: '지원되지 않는 브라우저입니다',
			lead: '이 서버는 Misskey로 동작하며, 정상적으로 사용하려면 최신 브라우저가 필요합니다.',
			desc: '현재 브라우저가 너무 오래되었거나 Misskey가 필요로 하는 기능이 없어 페이지를 올바르게 표시할 수 없습니다.',
			how: '해결 방법',
			s1: '브라우저와 운영체제를 최신 버전으로 업데이트하세요',
			s2: '최신 버전의 Chrome, Firefox, Edge 또는 Safari를 사용하세요',
			s3: '앱 내장 브라우저가 아닌 일반 브라우저에서 열어 주세요',
			req: '권장: Chrome 116+, Firefox 116+, Safari 16+ (또는 이후 버전).',
		}
	};

	function pickLang() {
		var lang = '';
		try {
			lang = window.localStorage.getItem('lang') || '';
		} catch (e) {
			lang = '';
		}
		if (!lang && navigator && navigator.language) lang = navigator.language;
		if (!lang) return 'en';
		if (STRINGS[lang]) return lang;
		var base = lang.split('-')[0];
		if (base === 'zh') return 'zh-CN';
		if (STRINGS[base]) return base;
		return 'en';
	}

	var t = STRINGS[pickLang()];

	// スプラッシュや本体UIが一瞬でも見えないように、即座にCSSを差し込む（headは既に存在する）
	function injectHideStyle() {
		try {
			var hide = document.createElement('style');
			hide.setAttribute('data-misskey-unsupported', 'true');
			hide.appendChild(document.createTextNode(
				'#splash,#misskey_app{display:none !important;}' +
				'html,body{margin:0;padding:0;background-color:#172813;}'
			));
			(document.head || document.documentElement).appendChild(hide);
		} catch (e) { /* noop */ }
	}
	injectHideStyle();

	function escapeHtml(s) {
		return String(s)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');
	}

	function buildHtml() {
		return '' +
			'<div class="mk-unsupported-wrap">' +
				'<div class="mk-unsupported-card">' +
					'<div class="mk-unsupported-icon" aria-hidden="true">' +
						'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="#dec340" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
							'<path d="M12 9v4"></path><path d="M12 17h.01"></path>' +
							'<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>' +
						'</svg>' +
					'</div>' +
					'<h1 class="mk-unsupported-title">' + escapeHtml(t.title) + '</h1>' +
					'<p class="mk-unsupported-lead">' + escapeHtml(t.lead) + '</p>' +
					'<p class="mk-unsupported-desc">' + escapeHtml(t.desc) + '</p>' +
					'<h2 class="mk-unsupported-how">' + escapeHtml(t.how) + '</h2>' +
					'<ul class="mk-unsupported-list">' +
						'<li>' + escapeHtml(t.s1) + '</li>' +
						'<li>' + escapeHtml(t.s2) + '</li>' +
						'<li>' + escapeHtml(t.s3) + '</li>' +
					'</ul>' +
					'<p class="mk-unsupported-req">' + escapeHtml(t.req) + '</p>' +
				'</div>' +
			'</div>';
	}

	function buildPageStyle() {
		return '' +
			'.mk-unsupported-wrap{box-sizing:border-box;min-height:100vh;display:block;padding:24px;' +
				'background-color:#172813;background-image:linear-gradient(160deg,#1f3a1a,#0d160b);' +
				'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Hiragino Sans","Noto Sans CJK SC","Microsoft YaHei",sans-serif;' +
				'color:#dfddcc;line-height:1.7;}' +
			'.mk-unsupported-card{max-width:560px;margin:8vh auto 0 auto;background:rgba(0,0,0,0.35);' +
				'border:1px solid rgba(134,179,0,0.35);border-radius:14px;padding:28px 24px;text-align:center;}' +
			'.mk-unsupported-icon{margin-bottom:8px;}' +
			'.mk-unsupported-title{font-size:22px;margin:8px 0 14px 0;color:#fff;}' +
			'.mk-unsupported-lead{font-size:15px;margin:0 0 8px 0;}' +
			'.mk-unsupported-desc{font-size:14px;margin:0 0 20px 0;color:#bdbba9;}' +
			'.mk-unsupported-how{font-size:15px;margin:0 0 8px 0;color:#a6d83a;text-align:left;}' +
			'.mk-unsupported-list{text-align:left;margin:0 0 18px 0;padding-left:20px;font-size:14px;}' +
			'.mk-unsupported-list li{margin:6px 0;}' +
			'.mk-unsupported-req{font-size:13px;color:#9aa08c;margin:0;border-top:1px solid rgba(255,255,255,0.08);padding-top:14px;}';
	}

	var rendered = false;
	function render() {
		if (rendered) return;
		if (!document.body) return;
		rendered = true;

		try {
			var pageStyle = document.createElement('style');
			pageStyle.setAttribute('data-misskey-unsupported-page', 'true');
			pageStyle.appendChild(document.createTextNode(buildPageStyle()));
			(document.head || document.documentElement).appendChild(pageStyle);
		} catch (e) { /* noop */ }

		try {
			document.title = t.title;
		} catch (e) { /* noop */ }

		document.body.innerHTML = buildHtml();
	}

	if (document.body) {
		render();
	} else if (document.addEventListener) {
		document.addEventListener('DOMContentLoaded', render, false);
		// 念のため readystatechange でも試みる（古いブラウザ対策）
		document.addEventListener('readystatechange', function () {
			if (document.readyState !== 'loading') render();
		}, false);
	} else if (window.attachEvent) {
		// 非常に古いブラウザ向けフォールバック
		window.attachEvent('onload', render);
	}
})();
