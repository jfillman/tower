# Design system

The plugin's shared look lives in `src/ui/` and `src/brand/tokens.ts`. It is taken from the Environments
mockup (board F of the design canvas) and is what every tab should use. Before it existed each tab redeclared
its own title, chip, table header and button styles with slightly different numbers (page and section titles at
14.5, 15, 16 and 20px; primary buttons with three different text colours, one of them unreadable on amber).

## Rules

- **Tokens, never hex.** Colours come from `useHangarTokens()`. Text on a solid amber fill is `onAmber`; `amberInk`
  is for text on `amberSoft`, not on amber.
- **Fonts.** Condensed display (`fontDisplay`) for titles, names and sub-tabs; Plex Sans for body; Plex Mono for
  labels, values, paths and chips.
- **Surfaces.** A `Panel` is a 1px `line` border, 6px radius, `panel` background. An accented panel (amber line)
  is for the pending-changes panel only.
- **Labels.** `SectionLabel` (mono, uppercase, 11px) names a block; `ColumnLabel` (10.5px) heads a column.
- **Buttons.** One amber `primary` per view. `default` for the rest, `danger` for destructive actions. Use the kit's
  `Button` and `IconButton` (they already prevent the focus-scroll jump in the nested-scroll layout).
- **Chips.** `TierChip` for Ground (sky) and Flight (amber); `Chip tone="ok" | "bad"` for staged state.
- **Sub-tabs** (`Subtabs`) split a long form into logical sections; **`Segmented`** filters a list.
- **Fields.** `Field` = label, optional source tag ("set here" / "app-level"), then the input.

## Kit

`PageHeader`, `Panel`, `SectionLabel`, `ColumnLabel`, `Button`, `IconButton`, `Chip`, `TierChip`, `Segmented`,
`Subtabs`, `StatusDot`, `Field`, `PendingPanel` (`src/ui/PendingPanel.tsx`), `healthColor`, `HEALTH_LABEL` (`src/ui/index.tsx`); the class set is in
`src/ui/styles.ts`.

## Migration status

Done: Environments tab (and its dialogs), the values form's sub-tabs, sections and pending panel, the platform file editor. The values form's individual inputs still use the older MUI controls. Everything else still declares its own styles
and moves onto the kit tab by tab; see the table below. A tab is done when it declares no title, chip, table-header,
panel or button style of its own.

| Tab | Own style declarations | Status |
|---|---|---|
| Environments | none | done |
| Overview, Pipelines, Deployments, Releases, Images, SLOs, Pull requests, Topology, Notifications, Cloud deployments | title / section title / chip / table / panel | not started |
| App Configuration, Glidepath | own `sectionTitle`, `btn`, `submitBtn`, fields | to be restructured into sub-tabs with the shared pending-changes panel |
