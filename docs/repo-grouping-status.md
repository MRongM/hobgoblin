# Repo Tab Grouping - Implementation Status

## 📋 Overview

Chrome-style tab grouping for repository tabs in Hobgoblin. Users can manually create named, colored groups, collapse them to save space, and drag repos between groups.

## ✅ Completed (Core Foundation - 100%)

### 1. Data Layer
- **Types**: `RepoGroupMeta`, `RepoGroupColor`, SessionState extensions
- **Store**: 
  - `repoGroups: Record<string, RepoGroupMeta>` - group metadata
  - `groupOf: Record<string, string>` - repo → group mapping
  - 6 actions: create/update/delete/add/remove/toggleCollapsed
- **Persistence**: 
  - SessionState serialization/deserialization
  - useSessionPersistence hook integration
  - useAppBootstrap restoration on launch
- **Auto-cleanup**: Empty groups deleted when last repo is removed/closed

### 2. UI Components (Base)
- **`group-colors.ts`**: 8-color palette (gray/blue/red/yellow/green/pink/purple/cyan) with Tailwind classes
- **`GroupChip.tsx`**: Collapsed group chip component (color dot + name + active indicator + collapse icon)
- **`group-helpers.ts`**: `buildTabStripItems()` transforms flat order into grouped structure
- **`CreateGroupDialog.tsx`**: Dialog for creating groups (name input + color picker)
- **`useRepoGrouping.ts`**: Hook to manage grouping state and dialog flow

### 3. Quality
- ✅ All typechecks pass
- ✅ Tests updated and passing
- ✅ ADR documentation (0001, 0002)
- ✅ CONTEXT.md updated with glossary

## 🚧 Remaining Work (Integration - ~35%)

### Phase 1: Basic Integration (High Priority)
**Goal**: Users can see and interact with basic grouping

1. **Integrate into RepoTabStrip.tsx**
   - Use `buildTabStripItems()` instead of flat repos array
   - Render `GroupChip` for collapsed groups
   - Hide group member tabs when collapsed
   - Show member tabs when expanded
   - Keep small-screen mode unchanged (ignore groups)

2. **Basic Click Interactions**
   - GroupChip onClick → toggle collapsed state
   - Ensure activeRepo visibility (expand group if active repo inside)

**Estimated effort**: 2-3 hours

### Phase 2: Drag & Drop (Medium Priority)
**Goal**: Users can organize repos via dragging

1. **Update DndContext**
   - Support both repo IDs and group IDs in sortable items
   - Handle drag repo → group chip (add to group)
   - Handle drag group chip (move entire group block)
   - Handle drag repo out of group (remove from group)

2. **Auto-expand on Hover** (ADR 0001)
   - Drag repo over collapsed group chip → wait 200-300ms → auto-expand
   - Show drop indicator inside group
   - Collapse back after 500ms if drag leaves

**Estimated effort**: 3-4 hours

### Phase 3: Context Menus (Medium Priority)
**Goal**: Users can manage groups via right-click

1. **Repo Tab Context Menu**
   ```
   Add to New Group...
   Add to Existing Group ▸ [group list]
   Remove from Group
   ───────────────
   [existing menu items]
   ```

2. **Group Chip Context Menu**
   ```
   Rename...
   Change Color...
   ───────────────
   Ungroup
   Close All in Group
   ```

3. **Dialogs**
   - Rename group dialog
   - Change color dialog

**Estimated effort**: 2-3 hours

### Phase 4: Polish (Low Priority)
**Goal**: Production-ready experience

1. **Internationalization**
   - Add translation keys to `src/shared/locales/`
   - Use `useT()` in all UI strings

2. **Keyboard Navigation**
   - Arrow keys work across groups
   - Escape to close group dialogs

3. **Accessibility**
   - ARIA labels for GroupChip
   - Screen reader announcements

4. **Visual Polish**
   - Smooth expand/collapse animation
   - Hover states refinement
   - Focus ring consistency

**Estimated effort**: 2-3 hours

## 🎯 Integration Strategy

### Option A: Feature Flag (Recommended)
Add a setting to enable/disable grouping:
```ts
// src/shared/settings.ts
export interface SettingsPrefs {
  // ...
  enableRepoGrouping?: boolean // default: false
}
```

- Ship core foundation now
- Enable in dev/dogfood
- Collect feedback before GA
- Allows safe iteration

### Option B: Direct Integration
Integrate into RepoTabStrip immediately:
- Faster user feedback
- Higher risk if edge cases found
- Requires thorough testing

**Recommendation**: Start with Option A, flip to true after Phase 1 + Phase 2 complete.

## 📁 Key Files

### Data Layer
- `src/shared/rpc.ts` - SessionState types
- `src/web/stores/repos/types.ts` - Store types
- `src/web/stores/repos/group-actions.ts` - Store actions
- `src/web/stores/repos/lifecycle-write-paths.ts` - Empty group cleanup

### Persistence
- `src/web/restorable-workspace-state.ts` - Serialization
- `src/web/hooks/useSessionPersistence.ts` - Auto-save
- `src/web/hooks/useAppBootstrap.ts` - Restore on launch

### UI Components
- `src/web/components/repo-tabs/GroupChip.tsx`
- `src/web/components/repo-tabs/CreateGroupDialog.tsx`
- `src/web/components/repo-tabs/group-colors.ts`
- `src/web/components/repo-tabs/group-helpers.ts`
- `src/web/components/repo-tabs/useRepoGrouping.ts`

### Target for Integration
- `src/web/components/repo-tabs/RepoTabStrip.tsx` - Main component
- `src/web/components/RepoTabs.tsx` - Parent container

### Documentation
- `docs/adr/0001-repo-tab-grouping-model.md` - Architecture decisions
- `docs/adr/0002-collapsed-group-active-indicator.md` - UX decision
- `CONTEXT.md` - Glossary terms

## 🧪 Testing

### Current Coverage
- ✅ Type safety (all typechecks pass)
- ✅ Store actions (unit tests updated)
- ✅ Persistence (session state round-trip)

### Needed Coverage
- [ ] UI component tests (GroupChip, CreateGroupDialog)
- [ ] Integration tests (RepoTabStrip with groups)
- [ ] E2E scenarios:
  - Create group → add repos → collapse → reopen
  - Close last repo in group → group auto-deletes
  - Drag repo between groups
  - Session restore preserves groups

## 🚀 Next Steps

1. **Immediate**: Integrate Phase 1 into RepoTabStrip
2. **Short-term**: Add Phase 2 drag & drop
3. **Medium-term**: Add Phase 3 context menus
4. **Long-term**: Polish (Phase 4) based on user feedback

## 📊 Metrics

- **Code added**: ~800 lines (types, store, persistence, base UI)
- **Core completion**: 100%
- **UI integration**: 35%
- **Overall completion**: ~65%
- **Estimated time to MVP**: 4-6 hours
- **Estimated time to full polish**: 10-12 hours total

## 💡 Design Decisions

See ADR documents for rationale:
- Flat order + groupOf mapping (vs nested tree)
- Global persistence (vs per-window)
- Empty group auto-delete (vs preserve)
- Active repo stays visible in collapsed group (vs auto-switch)
- Small screen ignores groups (vs nested dropdown)

---

**Last updated**: 2026-07-14
**Status**: Core foundation complete, ready for UI integration
