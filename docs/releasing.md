# Fork 发布与镜像

发布只由人类发起。版本号格式和当前上游基线见项目规范；本页说明发布 tag、镜像命名及操作顺序。

## 命名

| 项目 | 示例 |
| --- | --- |
| 两处 package.json 的版本号 | `2025.12.2-liminalselves.4` |
| CHANGELOG 版本标题 | `2025.12.2-liminalselves.4` |
| Git 发布 tag | `release-v2025.12.2-liminalselves.4` |
| ACR / GHCR 镜像 tag | `2025.12.2-liminalselves.4` |

`release-v` 是触发构建的固定前缀，不属于软件版本号。Git tag 去掉此前缀后，必须与两处 package.json、CHANGELOG 标题和镜像 tag 一致。只推当次发布 tag，不使用 `git push --tags`。

## 构建渠道

### 阿里云 ACR：生产镜像

使用控制台已有的**内置规则**，不是在“添加构建规则”表单中另填变量或正则：

- Branch/Tag 显示：`tags:release-v$version`。
- 构建上下文目录：`/`。
- Dockerfile 文件名：`Dockerfile`。
- 镜像版本显示：`$version`。

原始实践文章的完整截图标注“内置规则”，展示了推送 `release-v0.82.0` 后，镜像 `0.82.0` 构建成功的记录：[文章及截图](https://www.cnblogs.com/xiaochina/p/17453307.html)。不要将其推广为自定义表单支持任意 `$version`、`${TAG}` 或正则。

生产拉取 ACR 中的明确版本，不依赖 `latest`。本项目完整 fork 版本号在 ACR 上的构建尚未验收；首次发布须检查实际产出的镜像版本和构建结果。

### GitHub Actions / GHCR：版本镜像存档

实际配置见 [`docker.yml`](../.github/workflows/docker.yml)：

- 推送 `release-v*-liminalselves.*` tag 时触发；普通分支推送和发布 GitHub Release 不触发该镜像发布工作流。
- 前置校验要求正式版本 tag 格式、所指提交属于 master 历史、两处 package.json 与去掉前缀后的版本一致；失败则不构建发布镜像。
- GHCR 仅发布去掉 `release-v` 的完整版本 tag，不生成 `latest`、主版本或次版本别名。
- 手动强制重建必须选择已有发布 tag，仍经过相同校验；`no_cache` 只用于禁用构建缓存。

**GitHub 的检查不控制 ACR 的独立构建。** 发布流程必须在推 tag 前确认它指向 master 的发布 merge commit。ACR 按 tag 命名触发，不能将 GitHub 的 master 校验当成 ACR 的校验。

TCR 镜像复制链路已废弃，develop 镜像发布工作流已删除。其他 CI 中用于测试或扫描的本地镜像构建不属于发布渠道。

## 发布顺序

1. 获得当次发布授权，确认上游基线及本次版本号；在 develop 同步修改两处 package.json，将 CHANGELOG 顶部 `unreleased` 定名为本次版本并新开空 `unreleased`。
2. 按当次 Git 授权提交并推送 develop，经 PR 合入 master，使用 merge commit，不直推 master。
3. 本地拉取 master，核对合入结果、两处版本和 CHANGELOG；CI 修改必须已包含在这次提交中。
4. 在 master 发布 merge commit 上创建附注 tag `release-v<version>`，单独推送这个 tag。推送会启动 ACR 和 GitHub 两条独立构建。
5. 分别确认两边构建结果、镜像 tag 和来源提交；ACR 构建成功后，生产从 ACR 拉取该完整版本。不得只看 GitHub 构建成功就认为生产镜像已就绪。
6. GitHub Release 可选，用同一个发布 tag 创建，仅作版本记录。

以下命令仅示范一次已获授权的发布，`2025.12.2-liminalselves.4` 必须替换为当次确认的版本：

```bash
version='2025.12.2-liminalselves.4'

gh pr create -R liminalselves/misskey --base master --head develop --title "release $version"
# 查看 PR 后，用实际编号执行：
# gh pr merge -R liminalselves/misskey <PR编号> --merge

git switch master && git pull --ff-only
# 核对 HEAD 为本次发布 merge commit，版本与日志一致后：
git tag -a "release-v$version" -m "发布 $version"
git push origin "release-v$version"

# 可选：创建发布记录，禁止用不存在的 tag 隐式创建新 tag。
gh release create "release-v$version" -R liminalselves/misskey --verify-tag --title "$version"
```

## Hotfix

从 master 切出 `hotfix/<slug>`，按同基线 N+1 更新两处版本和 CHANGELOG，经 PR 合回 master；再按上述规则打附注 tag、推送并验收镜像。完成后必须 back-merge 回 develop，避免后续发布遗漏修复。Hotfix 同样需要当次发布授权。
