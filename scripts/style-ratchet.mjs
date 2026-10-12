#!/usr/bin/env node
// Style ratchet (docs/design-system.md). Tabs use the kit in src/ui; this check keeps them from drifting back.
//
// 1. Counts the local makeStyles entries outside src/ui that redo a kit piece (a section title, a table cell, a
//    label/value pair, an empty note, a card, a banner, a headline number, a hand-rolled sky link, a radius off the
//    6/4 scale). A count may go down, never up. When it goes down, run with --update and commit the new baseline.
// 2. Lists `classes.x` uses whose sheet (local, or a hook exported from another file) has no `x`. Those render with
//    no style at all and tsc cannot see them (the class map is loosely typed). Known false positives (a variable name
//    reused for two sheets) are in the baseline; a new entry fails.
//
// Usage: node scripts/style-ratchet.mjs [--update]
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const BASELINE = join(ROOT, 'scripts/style-ratchet.json');

const FAMILIES = {
  sectionTitle: /^(sectionTitle|sectionHead|sectionSub|panelTitle|title|subTitle|heading|cardTitle|blockTitle)$/,
  table: /^(table|th|td|tr|row|headRow|thead|headCell)$/,
  fact: /^(kv|kvLabel|kvValue|kvRow|kvK|kvV|metaLabel|metaValue|metaItem|label|value|k|v|statLabel|statValue)$/,
  note: /^(note|empty|emptyRow|hint|emptyNote|warnNote|detailNote|overflowNote|countNote)$/,
  card: /^(card|panel|metaCard|deck)$/,
  banner: /^(banner|callout|opBanner|condition|warn|notifCard)$/,
  stat: /^(stat|statVal|big|kpi)$/,
};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/** Top-level entries of every makeStyles sheet in a file: [{ hook, name, body }]. */
function sheets(src) {
  const out = [];
  const re = /(?:export )?const (\w+) = makeStyles(?:<[^>]*>)?\(\s*(?:\(\)\s*=>\s*\()?\{/g;
  let m;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length;
    const start = i;
    let depth = 1;
    while (depth && i < src.length) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
      i++;
    }
    const body = src.slice(start, i - 1);
    const entries = [];
    let d = 0;
    let cur;
    for (const line of body.split('\n')) {
      if (d === 0) {
        const km = /^\s{2}['"]?([\w$-]+)['"]?\s*:/.exec(line);
        if (km) {
          cur = { name: km[1], body: '' };
          entries.push(cur);
        }
      }
      if (cur) cur.body += `${line}\n`;
      d += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
    }
    out.push({ hook: m[1], exported: m[0].startsWith('export'), entries });
  }
  return out;
}

const files = walk(join(ROOT, 'src'));
const sources = Object.fromEntries(files.map(f => [relative(ROOT, f), readFileSync(f, 'utf8')]));

// 1. family counts
const counts = Object.fromEntries([...Object.keys(FAMILIES), 'handRolledLink', 'offScaleRadius'].map(k => [k, 0]));
const where = Object.fromEntries(Object.keys(counts).map(k => [k, []]));
for (const [file, src] of Object.entries(sources)) {
  if (file.startsWith('src/ui/')) continue;
  for (const sheet of sheets(src)) {
    for (const { name, body } of sheet.entries) {
      for (const [family, re] of Object.entries(FAMILIES)) {
        if (re.test(name)) {
          counts[family]++;
          where[family].push(`${file}:${name}`);
        }
      }
      if (/t\.sky\b/.test(body) && /textDecoration|cursor: 'pointer'/.test(body) && !/skySoft/.test(body)) {
        counts.handRolledLink++;
        where.handRolledLink.push(`${file}:${name}`);
      }
      const r = /borderRadius: (\d+)\b/.exec(body);
      if (r && /border/.test(body.replace(/borderRadius/g, '')) && /t\.(panel|panelAlt|bg)\b/.test(body)) {
        const v = Number(r[1]);
        if (![0, 2, 3, 4, 6].includes(v) && v < 11) {
          counts.offScaleRadius++;
          where.offScaleRadius.push(`${file}:${name}`);
        }
      }
    }
  }
}

// 2. dangling class references
const exported = {};
for (const src of Object.values(sources)) {
  for (const s of sheets(src)) if (s.exported) exported[s.hook] = new Set(s.entries.map(e => e.name));
}
const dangling = [];
for (const [file, src] of Object.entries(sources)) {
  const all = { ...exported };
  for (const s of sheets(src)) all[s.hook] = new Set(s.entries.map(e => e.name));
  const vars = {};
  const bind = (v, hook) => {
    if (!all[hook]) return;
    vars[v] ??= new Set();
    for (const k of all[hook]) vars[v].add(k);
  };
  for (const m of src.matchAll(/const (\w+) = (use\w+)\(\{/g)) bind(m[1], m[2]);
  for (const m of src.matchAll(/(\w+)\??: ReturnType<typeof (use\w+)>/g)) bind(m[1], m[2]);
  for (const [v, keys] of Object.entries(vars)) {
    const used = new Set([...src.matchAll(new RegExp(`\\b${v}\\.(\\w+)\\b`, 'g'))].map(m => m[1]));
    for (const u of used) if (!keys.has(u)) dangling.push(`${file}: ${v}.${u}`);
  }
}
dangling.sort();

const current = { counts, dangling };
if (process.argv.includes('--update')) {
  writeFileSync(BASELINE, `${JSON.stringify(current, null, 2)}\n`);
  console.log('style-ratchet: baseline written', counts);
  process.exit(0);
}

const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
let failed = false;
for (const [k, v] of Object.entries(counts)) {
  const was = base.counts[k] ?? 0;
  if (v > was) {
    failed = true;
    console.error(`style-ratchet: ${k} went up ${was} -> ${v}. Use the kit (docs/design-system.md). Current:\n  ${where[k].join('\n  ')}`);
  } else if (v < was) {
    console.log(`style-ratchet: ${k} went down ${was} -> ${v}; run with --update and commit the baseline.`);
  }
}
const known = new Set(base.dangling);
const fresh = dangling.filter(d => !known.has(d));
if (fresh.length) {
  failed = true;
  console.error(`style-ratchet: class names used but not defined in their sheet (they render unstyled):\n  ${fresh.join('\n  ')}`);
}
if (failed) process.exit(1);
console.log('style-ratchet: ok', counts);
