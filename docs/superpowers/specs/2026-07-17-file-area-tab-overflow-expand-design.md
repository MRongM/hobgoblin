# 文件区隐藏 tab 向右展开与收缩 — 设计

日期:2026-07-17
状态:已确认(会话内记住展开状态;收缩时沿用现状单独显示激活的隐藏 tab)

## 背景

文件区(`RepoExplorerPane.tsx` 中的 `ExplorerTabs`)当前只平铺前 4 个 tab,
其余 tab(Local、Remote Branches、远程仓库的 Ports 等)收进一个 ChevronDown
下拉菜单。用户希望改为:点击后隐藏的 tab 直接向右平铺展开,再点收缩回去。

## 需求

- 收缩态(默认):显示前 4 个 tab + 展开按钮(`ChevronsRight` 图标)。
  若当前激活的 tab 属于隐藏区,则在展开按钮旁单独平铺该激活 tab(与现有
  下拉触发器显示激活项的行为一致)。
- 展开态:全部 tab 向右平铺,末尾为收缩按钮(`ChevronsLeft` 图标)。
- 展开/收缩状态会话内记住:切换项目或组件重挂载后保持,页面刷新后恢复
  默认收缩。不写入持久化存储。
- 窄面板下展开溢出时沿用 `ToolbarTabStripBody` 已有的横向滚动。

## 方案取舍

- **A(采用)内联展开/收缩按钮替换下拉菜单** — 交互直接,样式与现有 tab
  统一,改动集中在 `ExplorerTabs` 一个函数内。
- B 保留下拉另加"展开全部"入口 — 两层交互冗余,弃。
- C 全部平铺不再隐藏 — 窄面板常驻拥挤,弃。

## 实现设计

只改 `src/web/components/repo-workspace/RepoExplorerPane.tsx` 的
`ExplorerTabs`,并新增 i18n key:

- 删除 `DropdownMenu` 相关代码与 import。
- 新增模块级变量 `lastOverflowExpanded = false`;组件内
  `useState(() => lastOverflowExpanded)`,toggle 时同步写回模块变量,
  实现"会话内记住"。
- 收缩态渲染:`primaryTabs` + 激活的隐藏 tab(若有)+ 展开按钮
  (`ChevronsRight`,`aria-expanded=false`)。
- 展开态渲染:全部 tab + 收缩按钮(`ChevronsLeft`,`aria-expanded=true`)。
- 切换按钮沿用现有 tab 的 ghost/border 风格,`h-7`,仅图标,带
  `aria-label`:新增 i18n key `file-tree.tabs.expand` /
  `file-tree.tabs.collapse`(zh/en 各一条)。
- tab 按钮渲染逻辑抽成局部渲染函数复用,避免收缩/展开两套重复 JSX。

## 可访问性

切换按钮使用 `aria-expanded` + `aria-label`;tab 按钮保持现有
`role="tab"` / `aria-selected` / `tabIndex` 约定。

## 测试

更新 `RepoExplorerPane.test.tsx`:

1. 默认收缩:隐藏 tab 不可见,展开按钮可见。
2. 点击展开:隐藏 tab 全部可见并可点击切换。
3. 点击收缩:隐藏 tab 重新隐藏。
4. 激活隐藏 tab 后收缩:该激活 tab 在收缩态仍单独显示。
5. 会话内记住:组件重挂载(切换 repo)后展开状态保持。

## 错误处理

纯前端同步交互,无异步/新数据流,无需额外错误处理。
