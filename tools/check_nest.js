#!/usr/bin/env node
// node tools/check_nest.js [dir]   (dir defaults to debug/last_nest)
//
// Find which stage of a layout engine 2 run (xep_toi_uu.jsx) put parts on top of each
// other, from the record lib/nest_record.jsx writes:
//   1. export   every part has the shape the nester was given for its key (job.json
//               traces one part per {size}_{side} and reuses it for the others)
//   2. nester   the nester's own layout keeps the parts apart, as it sees them
//   3. apply    each part landed where, and turned the way, the result asked — and the
//               real outlines on the sheets don't overlap
const fs = require('fs');
const path = require('path');
const g = require('../nester/geometry');

const dir = process.argv[2] || path.join(__dirname, '..', 'debug', 'last_nest');
const read = (name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
const job = read('job.json'), result = read('result.json');
const before = read('before.json').parts, after = read('after.json').parts;

const MM2 = g.UNITS_PER_MM ** 2;
const OVERLAP_MM2 = 1;      // ignore overlaps smaller than this (rounding)
const MISMATCH = 0.02;      // shapes differing by more than this fraction are different
const POSITION_MM = 0.5;    // placement error worth reporting
const TOL = Math.round(0.5 * g.UNITS_PER_MM);
const gap = g.ptToUnits(job.gap);

// A shape prepared like the nester does (grown by grow/2), once per shape, rot and grow.
const cache = new WeakMap();
function prepared(shape, rot, grow) {
    if (!cache.has(shape)) cache.set(shape, new Map());
    const byShape = cache.get(shape), k = rot + '/' + grow;
    if (!byShape.has(k)) byShape.set(k, g.prepareShape(shape, { gap: grow, rot, tol: TOL }));
    return byShape.get(k);
}

// Fraction of two outlines (prepared, normalized) that isn't shared.
function mismatch(a, b) {
    const common = g.intersection([a.poly], [b.poly]).reduce((s, p) => s + Math.abs(g.area(p)), 0);
    return 1 - 2 * common / (Math.abs(a.area) + Math.abs(b.area));
}

// Pairs of placed polygons ({ label, sheet, poly }) overlapping by more than OVERLAP_MM2.
function overlaps(placed) {
    const out = [];
    const boxes = placed.map((p) => g.bounds([p.poly]));
    for (let i = 0; i < placed.length; i++) {
        for (let j = i + 1; j < placed.length; j++) {
            if (placed[i].sheet !== placed[j].sheet) continue;
            const a = boxes[i], b = boxes[j];
            if (a.maxX <= b.minX || b.maxX <= a.minX || a.maxY <= b.minY || b.maxY <= a.minY) continue;
            const area = g.intersection([placed[i].poly], [placed[j].poly]).reduce((s, p) => s + Math.abs(g.area(p)), 0) / MM2;
            if (area > OVERLAP_MM2) out.push({ a: placed[i].label, b: placed[j].label, sheet: placed[i].sheet, area });
        }
    }
    return out.sort((x, y) => y.area - x.area);
}

function report(title, lines) {
    console.log(`\n${lines.length ? '✖' : '✔'} ${title}${lines.length ? ` — ${lines.length} problem(s)` : ''}`);
    for (const l of lines.slice(0, 20)) console.log('    ' + l);
    if (lines.length > 20) console.log(`    … and ${lines.length - 20} more`);
}

const mm = (pt) => (pt / g.PT_PER_MM).toFixed(1);

// 1. export
const exportIssues = [];
before.forEach((part, i) => {
    const key = job.parts[i].shape;
    const own = prepared(part.shape, 0, 0), given = prepared(job.shapes[key], 0, 0);
    const m = mismatch(own, given);
    if (m <= MISMATCH) return;
    const turned = mismatch(own, prepared(job.shapes[key], 180, 0));
    exportIssues.push(`${part.label}: differs from shape ${key} by ${(m * 100).toFixed(0)}%`
        + (turned <= MISMATCH ? ' — it is that shape turned 180° (already rotated on the page)' : '')
        + ` [own ${mm(part.shape.w)}×${mm(part.shape.h)}mm, given ${mm(job.shapes[key].w)}×${mm(job.shapes[key].h)}mm]`);
});
report('1. export: every part has its key\'s shape', exportIssues);

// 2. nester — a placement is where the visible box's top-left (the shape frame's origin)
// goes, which sits (shiftX, shiftY) into the grown polygon (nester/place.js toResult).
const nested = result.placements.map((pl) => {
    const s = prepared(job.shapes[job.parts[pl.part].shape], pl.rot, gap);
    const x = g.ptToUnits(pl.x) - s.shiftX, y = g.ptToUnits(pl.y) - s.shiftY;
    return { label: before[pl.part].label, sheet: pl.sheet, poly: g.translate(s.poly, x, y) };
});
report('2. nester: its layout keeps the gap (grown polygons apart)',
    overlaps(nested).map((o) => `sheet ${o.sheet + 1}: ${o.a} × ${o.b} overlap ${o.area.toFixed(0)}mm²`));

// 3. apply
const applyIssues = [];
result.placements.forEach((pl, i) => {
    const a = after[i], key = job.parts[pl.part].shape;
    const dx = Math.abs(a.x - pl.x) / g.PT_PER_MM, dy = Math.abs(a.y - pl.y) / g.PT_PER_MM;
    if (a.sheet !== pl.sheet || dx > POSITION_MM || dy > POSITION_MM) {
        applyIssues.push(`${a.label}: sheet ${a.sheet + 1} at (${mm(a.x)}, ${mm(a.y)})mm, `
            + `asked sheet ${pl.sheet + 1} at (${mm(pl.x)}, ${mm(pl.y)})mm`);
    }
    const m = mismatch(prepared(a.shape, 0, 0), prepared(job.shapes[key], pl.rot, 0));
    if (m > MISMATCH) {
        const other = mismatch(prepared(a.shape, 0, 0), prepared(job.shapes[key], pl.rot === 180 ? 0 : 180, 0));
        applyIssues.push(`${a.label}: placed outline differs from shape ${key} at ${pl.rot}° by ${(m * 100).toFixed(0)}%`
            + (other <= MISMATCH ? ` — it matches ${pl.rot === 180 ? 0 : 180}° instead` : ''));
    }
});
report('3a. apply: each part landed where and how the result asked', applyIssues);

const real = after.map((a) => {
    const s = prepared(a.shape, 0, 0);
    return { label: a.label, sheet: a.sheet, poly: g.translate(s.poly, g.ptToUnits(a.x) - s.shiftX, g.ptToUnits(a.y) - s.shiftY) };
});
report('3b. apply: the real outlines on the sheets don\'t overlap',
    overlaps(real).map((o) => `sheet ${o.sheet + 1}: ${o.a} × ${o.b} overlap ${o.area.toFixed(0)}mm²`));
