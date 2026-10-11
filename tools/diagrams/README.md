# Diagram generator

Builds the break-glass diagrams in `docs/break-glass/diagrams/` with the diagram-design skill's grammar and the Hangar
profile. `lib.py` is a copy of hangar's `tools/diagrams/lib.py` (nodes, rounded right-angle connectors, zones, legends,
the page shell with light and dark themes). Python standard library only.

```bash
python3 tools/diagrams/breakglass.py   # writes the .html sources
python3 tools/diagrams/png.py          # renders each diagram's SVG to a 2x PNG beside it (needs Google Chrome)
```

The docs embed the PNGs: TechDocs cannot link a standalone `.html` page. Check a page with the skill's
`scripts/self_check.py` and the diagram-design repo's `scripts/verify-geometry.py` before rendering.
