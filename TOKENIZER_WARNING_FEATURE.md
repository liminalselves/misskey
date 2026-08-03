# 分词器词表缺失告警功能

## 功能概述

当系统检测到 GLM 或 DeepSeek 分词器词表文件缺失时，在智能体管理页面的总览标签页显示告警信息，提醒管理员配置词表文件。

## 实现细节

### 1. 后端改动

#### 1.1 词表状态检查函数
**文件**: `packages/backend/src/misc/agent-custom-tokenizers.ts`

新增 `checkTokenizerVocabStatus()` 函数，检查所有自定义分词器系列的词表可用性：

```typescript
export interface TokenizerVocabStatus {
  family: CustomTokenizerFamily;  // 'glm' | 'deepseek'
  available: boolean;              // 词表是否可用
  vocabPath?: string;              // 词表文件路径（如果可用）
  configPath?: string;             // 配置文件路径（如果可用）
}

export function checkTokenizerVocabStatus(): TokenizerVocabStatus[]
```

#### 1.2 API 端点
**文件**: `packages/backend/src/server/api/endpoints/agents/tokenizer-status.ts`

新增管理员 API 端点 `admin/agents/tokenizer-status`，返回词表状态：

- **权限**: 需要管理员权限（`requireAdmin: true`）
- **方法**: GET
- **响应**: 
  ```json
  {
    "tokenizers": [
      {
        "family": "glm",
        "available": false,
        "vocabPath": null,
        "configPath": null
      },
      {
        "family": "deepseek",
        "available": true,
        "vocabPath": "/path/to/deepseek.tiktoken",
        "configPath": "/path/to/deepseek.json"
      }
    ]
  }
  ```

### 2. 前端改动

#### 2.1 状态管理
**文件**: `packages/frontend/src/pages/admin/agents-settings.vue`

- 新增 `tokenizerStatuses` 响应式状态
- 新增 `loadTokenizerStatus()` 异步函数，在组件挂载时调用 API
- 新增 `missingTokenizers` 计算属性，过滤出缺失的词表
- 新增 `tokenizerFamilyLabel()` 辅助函数，提供友好的系列名称

#### 2.2 UI 展示
在总览标签页的统计卡片下方显示告警信息：

```vue
<div v-if="missingTokenizers.length > 0" class="_gaps_s">
  <MkInfo v-for="t in missingTokenizers" :key="t.family" warn>
    <i class="ti ti-alert-triangle"></i>
    <strong>{{ tokenizerFamilyLabel(t.family) }}</strong> 分词器词表缺失，将回退到兼容近似计数（≈）。
    <br>
    <small>请将词表文件放入 <code>data/tokenizers/</code> 目录（开发环境）或通过 Docker 构建时自动下载。</small>
  </MkInfo>
</div>
```

## 使用场景

### 开发环境
如果 `data/tokenizers/` 目录下缺少词表文件，管理页面会显示告警：

```
⚠️ GLM（智谱）分词器词表缺失，将回退到兼容近似计数（≈）。
请将词表文件放入 data/tokenizers/ 目录（开发环境）或通过 Docker 构建时自动下载。

⚠️ DeepSeek 分词器词表缺失，将回退到兼容近似计数（≈）。
请将词表文件放入 data/tokenizers/ 目录（开发环境）或通过 Docker 构建时自动下载。
```

### 生产环境
Docker 镜像构建时会自动下载词表文件到 `/tmp/agent_tokenizers/`，运行时通过 `resolveTokenizerDirs()` 查找。如果下载失败或文件丢失，同样会显示告警。

## 词表文件说明

### GLM（智谱）
- **词表文件**: `glm.tiktoken`
- **来源**: GLM-4 官方 tokenizer.model（已是 tiktoken 格式）
- **下载**: 从 HuggingFace `THUDM/glm-4-9b-chat` 仓库下载 `tokenizer.model`，重命名为 `glm.tiktoken`
- **配置文件**: 可选 `glm.json`（包含 `pat_str` 和 `special_tokens`）

### DeepSeek
- **词表文件**: `deepseek.tiktoken`
- **配置文件**: `deepseek.json`（包含 `pat_str` 和 `special_tokens`）
- **生成方式**: 使用转换脚本从 HuggingFace tokenizer.json 转换
  ```bash
  node scripts/convert-hf-tokenizer-to-tiktoken.mjs \
    /path/to/tokenizer.json \
    data/tokenizers/deepseek
  ```
- **来源**: 从 HuggingFace `deepseek-ai/DeepSeek-V3` 仓库下载 `tokenizer.json`

## 回退机制

当词表缺失时，系统会自动回退到兼容近似计数（cl100k_base），不会影响功能正常使用，但 token 计数精度会降低（显示 ≈ 前缀）。

## 测试验证

1. **删除词表文件**: 删除 `data/tokenizers/` 下的文件
2. **访问管理页面**: 打开 `/admin/agents-settings`
3. **查看总览标签页**: 应显示词表缺失告警
4. **恢复词表文件**: 重新下载或转换词表
5. **刷新页面**: 告警应消失

## 相关文件

- `packages/backend/src/misc/agent-custom-tokenizers.ts` - 词表加载与检查
- `packages/backend/src/server/api/endpoints/agents/tokenizer-status.ts` - API 端点
- `packages/frontend/src/pages/admin/agents-settings.vue` - 管理页面 UI
- `scripts/convert-hf-tokenizer-to-tiktoken.mjs` - DeepSeek 词表转换脚本
- `Dockerfile` - 构建期词表下载
