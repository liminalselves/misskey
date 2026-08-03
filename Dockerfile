# syntax = docker/dockerfile:1.20

ARG NODE_VERSION=22.21.1-bookworm

# build assets & compile TypeScript

FROM --platform=$BUILDPLATFORM node:${NODE_VERSION} AS native-builder

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
	--mount=type=cache,target=/var/lib/apt,sharing=locked \
	rm -f /etc/apt/apt.conf.d/docker-clean \
	; echo 'Binary::apt::APT::Keep-Downloaded-Packages "true";' > /etc/apt/apt.conf.d/keep-cache \
	&& apt-get update \
	&& apt-get install -yqq --no-install-recommends \
	build-essential

WORKDIR /misskey

COPY --link ["pnpm-lock.yaml", "pnpm-workspace.yaml", "package.json", "./"]
COPY --link ["scripts", "./scripts"]
COPY --link ["patches", "./patches"]
COPY --link ["packages/backend/package.json", "./packages/backend/"]
COPY --link ["packages/frontend-shared/package.json", "./packages/frontend-shared/"]
COPY --link ["packages/frontend/package.json", "./packages/frontend/"]
COPY --link ["packages/frontend-embed/package.json", "./packages/frontend-embed/"]
COPY --link ["packages/frontend-builder/package.json", "./packages/frontend-builder/"]
COPY --link ["packages/i18n/package.json", "./packages/i18n/"]
COPY --link ["packages/icons-subsetter/package.json", "./packages/icons-subsetter/"]
COPY --link ["packages/sw/package.json", "./packages/sw/"]
COPY --link ["packages/misskey-js/package.json", "./packages/misskey-js/"]
COPY --link ["packages/misskey-reversi/package.json", "./packages/misskey-reversi/"]
COPY --link ["packages/misskey-bubble-game/package.json", "./packages/misskey-bubble-game/"]

ARG NODE_ENV=production

RUN node -e "console.log(JSON.parse(require('node:fs').readFileSync('./package.json')).packageManager)" | xargs npm install -g

RUN --mount=type=cache,target=/root/.local/share/pnpm/store,sharing=locked \
	pnpm i --frozen-lockfile --aggregate-output

COPY --link . ./

RUN git submodule update --init
RUN pnpm build
RUN rm -rf .git/

# 预下载 Gemini gemma3 分词器词表，供生产环境离线使用（生产服务器无法访问 raw.githubusercontent.com）。
# 缓存路径与 @google/genai LocalTokenizer 一致：${TMPDIR:-/tmp}/vertexai_tokenizer_model/sha1(modelUrl)。
# 下载后校验 sha256，失败则中断构建，避免生成损坏缓存。
RUN mkdir -p /tmp/vertexai_tokenizer_model \
	&& node -e "const fs=require('fs');const crypto=require('crypto');fetch('https://raw.githubusercontent.com/google/gemma_pytorch/014acb7ac4563a5f77c76d7ff98f31b568c16508/tokenizer/gemma3_cleaned_262144_v2.spiece.model').then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.arrayBuffer()}).then(b=>{const buf=Buffer.from(b);const h=crypto.createHash('sha256').update(buf).digest('hex');if(h!=='1299c11d7cf632ef3b4e11937501358ada021bbdf7c47638d13c0ee982f2e79c')throw new Error('gemma3 vocab sha256 mismatch: '+h);fs.writeFileSync('/tmp/vertexai_tokenizer_model/df5c78e8def68e67515aeca297169a4f6c7f5920',buf);console.log('gemma3 tokenizer vocab pre-downloaded OK')})"

# 预置 GLM / DeepSeek 真分词器词表（与上方 Gemini 词表同思路），供 AgentTokenService 精确计数、生产离线可用。
# 运行时若词表缺失会自动回退 cl100k 兼容近似（approx），故此处获取/转换失败不阻断构建。
# 国内构建可以 --build-arg HF_ENDPOINT=https://hf-mirror.com 覆盖下载源。
# 同系列词表同源（GLM 全系 tiktoken 格式 ~151k 词表；DeepSeek 全系 byte-level BPE 129280 词表），
# 新型号（如 GLM-5.x / DeepSeek-V4）若确认词表格式不变，可用 build-arg 切换词表仓库：
#   --build-arg GLM_TOKENIZER_REPO=THUDM/glm-5.5 --build-arg DEEPSEEK_TOKENIZER_REPO=deepseek-ai/DeepSeek-V4
# - GLM 的 tokenizer.model 原生即 tiktoken 格式（每行 "base64 rank"），直接用作 glm.tiktoken；
# - DeepSeek 的 tokenizer.json 为 HF BPE，用随附脚本转换为 deepseek.tiktoken + deepseek.json。
ARG HF_ENDPOINT=https://huggingface.co
ARG GLM_TOKENIZER_REPO=THUDM/glm-4-9b-chat
ARG DEEPSEEK_TOKENIZER_REPO=deepseek-ai/DeepSeek-V3
RUN mkdir -p /tmp/agent_tokenizers \
	&& node -e "(async()=>{const fs=require('fs');try{const r=await fetch('${HF_ENDPOINT}/${GLM_TOKENIZER_REPO}/resolve/main/tokenizer.model');if(!r.ok)throw new Error('HTTP '+r.status);const t=await r.text();const n=t.split('\n').filter(l=>l.trim());if(n.length<100000)throw new Error('glm vocab too small: '+n.length);if(!/^[A-Za-z0-9+/=]+ \d+\s*$/.test(n[0]))throw new Error('glm vocab bad format');fs.writeFileSync('/tmp/agent_tokenizers/glm.tiktoken',t);console.log('GLM tokenizer vocab pre-provisioned ('+n.length+' tokens)')}catch(e){console.warn('WARN: GLM vocab skipped (runtime falls back to cl100k approx): '+e.message)}})()" \
	&& node -e "(async()=>{const fs=require('fs');try{const r=await fetch('${HF_ENDPOINT}/${DEEPSEEK_TOKENIZER_REPO}/resolve/main/tokenizer.json');if(!r.ok)throw new Error('HTTP '+r.status);fs.writeFileSync('/tmp/agent_tokenizers/deepseek_src.json',Buffer.from(await r.arrayBuffer()));console.log('DeepSeek tokenizer.json downloaded')}catch(e){console.warn('WARN: DeepSeek vocab download skipped (runtime falls back to cl100k approx): '+e.message)}})()" \
	&& if [ -f /tmp/agent_tokenizers/deepseek_src.json ]; then \
		node scripts/convert-hf-tokenizer-to-tiktoken.mjs /tmp/agent_tokenizers/deepseek_src.json /tmp/agent_tokenizers/deepseek \
		|| { echo 'WARN: DeepSeek vocab convert failed (runtime falls back to cl100k approx)'; rm -f /tmp/agent_tokenizers/deepseek.tiktoken /tmp/agent_tokenizers/deepseek.json; }; \
		rm -f /tmp/agent_tokenizers/deepseek_src.json; \
	fi \
	&& ls -la /tmp/agent_tokenizers || true

# build native dependencies for target platform

FROM --platform=$TARGETPLATFORM node:${NODE_VERSION} AS target-builder

RUN apt-get update \
	&& apt-get install -yqq --no-install-recommends \
	build-essential

WORKDIR /misskey

COPY --link ["pnpm-lock.yaml", "pnpm-workspace.yaml", "package.json", "./"]
COPY --link ["scripts", "./scripts"]
COPY --link ["patches", "./patches"]
COPY --link ["packages/backend/package.json", "./packages/backend/"]
COPY --link ["packages/misskey-js/package.json", "./packages/misskey-js/"]
COPY --link ["packages/misskey-reversi/package.json", "./packages/misskey-reversi/"]
COPY --link ["packages/misskey-bubble-game/package.json", "./packages/misskey-bubble-game/"]

ARG NODE_ENV=production

RUN node -e "console.log(JSON.parse(require('node:fs').readFileSync('./package.json')).packageManager)" | xargs npm install -g

RUN --mount=type=cache,target=/root/.local/share/pnpm/store,sharing=locked \
	pnpm i --frozen-lockfile --aggregate-output

FROM --platform=$TARGETPLATFORM node:${NODE_VERSION}-slim AS runner

ARG UID="991"
ARG GID="991"

RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
	ffmpeg tini curl libjemalloc-dev libjemalloc2 \
	&& ln -s /usr/lib/$(uname -m)-linux-gnu/libjemalloc.so.2 /usr/local/lib/libjemalloc.so \
	&& groupadd -g "${GID}" misskey \
	&& useradd -l -u "${UID}" -g "${GID}" -m -d /misskey misskey \
	&& find / -type d -path /sys -prune -o -type d -path /proc -prune -o -type f -perm /u+s -ignore_readdir_race -exec chmod u-s {} \; \
	&& find / -type d -path /sys -prune -o -type d -path /proc -prune -o -type f -perm /g+s -ignore_readdir_race -exec chmod g-s {} \; \
	&& apt-get clean \
	&& rm -rf /var/lib/apt/lists

# add package.json to add pnpm
COPY ./package.json ./package.json
RUN node -e "console.log(JSON.parse(require('node:fs').readFileSync('./package.json')).packageManager)" | xargs npm install -g

USER misskey
WORKDIR /misskey

COPY --chown=misskey:misskey --from=target-builder /misskey/node_modules ./node_modules
COPY --chown=misskey:misskey --from=target-builder /misskey/packages/backend/node_modules ./packages/backend/node_modules
COPY --chown=misskey:misskey --from=target-builder /misskey/packages/misskey-js/node_modules ./packages/misskey-js/node_modules
COPY --chown=misskey:misskey --from=target-builder /misskey/packages/misskey-reversi/node_modules ./packages/misskey-reversi/node_modules
COPY --chown=misskey:misskey --from=target-builder /misskey/packages/misskey-bubble-game/node_modules ./packages/misskey-bubble-game/node_modules
COPY --chown=misskey:misskey --from=native-builder /misskey/built ./built
COPY --chown=misskey:misskey --from=native-builder /misskey/packages/misskey-js/built ./packages/misskey-js/built
COPY --chown=misskey:misskey --from=native-builder /misskey/packages/misskey-reversi/built ./packages/misskey-reversi/built
COPY --chown=misskey:misskey --from=native-builder /misskey/packages/misskey-bubble-game/built ./packages/misskey-bubble-game/built
COPY --chown=misskey:misskey --from=native-builder /misskey/packages/backend/built ./packages/backend/built
COPY --chown=misskey:misskey --from=native-builder /misskey/packages/backend/src-js ./packages/backend/src-js
COPY --chown=misskey:misskey --from=native-builder /misskey/packages/i18n/built ./packages/i18n/built
COPY --chown=misskey:misskey --from=native-builder /misskey/fluent-emojis /misskey/fluent-emojis
# 预下载的 Gemini 分词器词表缓存（让 LocalTokenizer 无需联网即可精确计数）
COPY --chown=misskey:misskey --from=native-builder /tmp/vertexai_tokenizer_model /tmp/vertexai_tokenizer_model
# 预置的 GLM/DeepSeek 真分词器词表（让 AgentTokenService 离线精确计数；缺失时运行期回退 cl100k 近似）
COPY --chown=misskey:misskey --from=native-builder /tmp/agent_tokenizers /tmp/agent_tokenizers
COPY --chown=misskey:misskey . ./

ENV LD_PRELOAD=/usr/local/lib/libjemalloc.so
ENV NODE_ENV=production
HEALTHCHECK --interval=5s --retries=20 CMD ["/bin/bash", "/misskey/healthcheck.sh"]
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["pnpm", "run", "migrateandstart"]
