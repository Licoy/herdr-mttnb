# herdr-mttnb

[English](README.md) | 中文

Herdr 桌面版的布局与主题：左侧固定一栏写代码的 Agent，右侧照常开终端，旁边可以展开 Git 提交图。

![mttnb](preview.png)

## 功能

- **左侧 Coding 栏**：默认列出 Herdr 支持的所有 Agent（已安装的在前，未安装的置灰），点一下或按 `1`–`9` 就在当前目录启动。
- **每个 tab 各有一组 Agent**：新开的 tab 左栏是空的选择列表；同一个 tab 可以开多个 Agent，在栏顶的标签之间切换，`+` 再开一个，「结束」点两次关掉当前这个。
- **关分屏不影响左栏**：左栏的 Agent 不挂在任何终端分屏下面，关掉右侧的分屏或终端都不会把它带走；关掉它所在的 tab 时才一起结束。
- **侧边栏 Agents 列表**也会列出左栏的 Agent，点击直接跳过去。
- **Graph 面板**：tab 栏右侧的 Files / Changes / Graph 按钮在右边展开对应面板，再点一次收起。Graph 需要另外安装 Git Graph mod（见下文），没装时不显示这个按钮。
- **配色**：暖色深色主题 `mttnb-dark` 和浅色主题 `mttnb-light`，跟随系统外观自动切换。

## 安装

需要 Herdr 桌面版 0.1.11 及以上。

```sh
git clone https://github.com/Licoy/herdr-mttnb
sh herdr-mttnb/install.sh
```

脚本会把 `layouts/`、`themes/`、`mods/` 复制到 `~/.config/herdr-app`（设置了 `HERDR_APP_HOME` 时用它），把快捷键合并进 `keys.json`（原文件备份为 `keys.json.bak`），然后切换到 mttnb 布局。

手动安装：把 `layouts`、`themes`、`mods` 三个目录复制进 Herdr 目录，把 `keys.json` 里的 `layout:mttnb` 一段加进你自己的 `keys.json`，再执行：

```sh
herdr-app do layout.switch '{"name":"mttnb"}'
```

### Graph 面板（可选）

```sh
git clone https://github.com/rabeeh-ta/herdr-git-graph
cp -R herdr-git-graph/mods/git-graph ~/.config/herdr-app/mods/
```

Git Graph 只在你的仓库里执行 `git`，只有点 Fetch / Push 时才联网。

## 快捷键

仅在 mttnb 布局下生效。

| 按键 | 作用 |
| --- | --- |
| `Ctrl+Shift+A` | 回到左栏的 Agent（没有时打开选择列表） |
| `Ctrl+Alt+N` | 再开一个 Agent |
| `Ctrl+Alt+↑` / `Ctrl+Alt+↓` | 切换左栏的上一个 / 下一个 Agent |
| `Ctrl+Alt+←` / `Ctrl+Alt+→` | 在左栏和右侧终端之间移动 |
| `Cmd+G` | 展开 / 收起 Graph |
| `Ctrl+Shift+F` | 展开 / 收起 Files |
| `Ctrl+Shift+G` | 展开 / 收起 Changes |

## 说明

- 左栏的 Agent 是用 `hc run --no-parent` 启动的后台终端，带有 `mttnb.role=desk`、`mttnb.space`、`mttnb.tab`、`mttnb.agent` 标签，可以用 `hc ls` 查看。
- 远程机器上的空间暂不支持在左栏启动 Agent。
- `mods/mttnb-tabs` 和 `mods/mttnb-agents` 由 Herdr 自带的 `tabs`、`agents` mod 克隆后修改而来。
- 图标来自 [Remix Icon](https://remixicon.com)（Apache-2.0）。

## 卸载

删除 `~/.config/herdr-app` 下的这些文件，并去掉 `keys.json` 里的 `layout:mttnb` 一段：

```
layouts/mttnb.json
layouts/mttnb.svg
themes/mttnb-dark.json
themes/mttnb-light.json
mods/mttnb-desk/
mods/mttnb-tabs/
mods/mttnb-agents/
```

## 许可

[MIT](LICENSE)
