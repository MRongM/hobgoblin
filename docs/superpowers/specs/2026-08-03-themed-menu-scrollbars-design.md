# 菜单主题化滚动条设计

## 目标

让 Web/Desktop 的全部共享下拉菜单和右键菜单在内容溢出时，使用当前有效主题的滚动条颜色与交互状态。

## 现状与原因

`src/web/theme/contract.css` 已定义 `--color-scrollbar-thumb`、`--color-scrollbar-thumb-hover` 和
`--color-scrollbar-thumb-active`，但原生滚动条规则只作用于 `.project-navigation-tone` 与
`.project-file-area-tone`。Radix 菜单内容通过 Portal 挂载到根节点外层，因此不会命中这些局部选择器，
最终显示浏览器或操作系统默认滚动条。

## 设计

在主题契约中以共享组件已有的稳定 `data-slot` 为边界，覆盖：

- `[data-slot='dropdown-menu-content']`
- `[data-slot='context-menu-content']`

两类菜单均复用现有三态语义 token。Firefox 使用 `scrollbar-color` 与 `scrollbar-width`；
Electron/WebKit 使用透明 track/corner、10px 宽纵向轨道、透明边框裁出的胶囊 thumb，
并在 hover/active 时切换对应主题色。

不修改 React 组件、Portal 结构、菜单尺寸和 overflow 行为，不增加主题分支、依赖、设置项或逐主题色板。
终端滚动条、导航/文件区滚动条以及非菜单滚动容器保持现状。

## 验证

先扩展 `src/web/theme/theme-contract.test.ts`，验证两个菜单 slot 均包含 Firefox 与 WebKit/Electron
主题化规则，并运行测试确认在生产 CSS 修改前失败。随后增加最小 CSS 实现并确认聚焦测试通过。

最终运行：

- `bun run typecheck`
- `bun run test`
- `bun run check:architecture`
