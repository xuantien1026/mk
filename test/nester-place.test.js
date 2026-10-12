const { test } = require('node:test');
const assert   = require('node:assert/strict');
const g        = require('../nester/geometry');
const { createContext, placeAll, toResult } = require('../nester/place');
const { CM, shape, pant, shirt, sleeve, assertValidResult } = require('./helpers/shapes');
const { makeSheetEnv } = require('./helpers/helper');

const GAP = 3 * g.PT_PER_MM;
const SHEET = { w: 159 * CM, h: 500 * CM };

function job(shapes, partShapes, sheet = SHEET) {
    return { sheet, gap: GAP, shapes, parts: partShapes.map((s) => ({ shape: s })) };
}

const genes = (n, rot = 0) => Array.from({ length: n }, (_, i) => ({ part: i, rot }));

test('prepareShape grows the outline by half the gap plus half the stroke', function () {
    const s = shape([[0, 0], [50, 0], [50, 80], [0, 80]]);
    const p = g.prepareShape(s, { gap: g.ptToUnits(GAP), rot: 0, tol: 0 });
    // Visible box = geometry + stroke; grown polygon = geometry + stroke + gap.
    const margin = 0;
    assert.ok(Math.abs(p.w - g.ptToUnits(s.w + GAP) - 2 * margin) <= 2);
    assert.ok(Math.abs(p.h - g.ptToUnits(s.h + GAP) - 2 * margin) <= 2);
    assert.ok(Math.abs(p.shiftX - g.ptToUnits(GAP / 2) - margin) <= 2);
});

test('the printed stroke gets pointed corners only up to the miter limit', function () {
    const thick = (miter) => Object.assign(shape([[0, 0], [100, 0], [50, 20]]), { pad: 7, miter });
    // A ~22° tip: its miter is ~5× the half-stroke long — drawn pointed with limit 10,
    // squared off with limit 2.
    const pointed = g.prepareShape(thick(10), { gap: 0, rot: 0, tol: 0 });
    const squared = g.prepareShape(thick(2), { gap: 0, rot: 0, tol: 0 });
    assert.ok(pointed.w > squared.w + g.ptToUnits(2 * 7 * 2), pointed.w + ' vs ' + squared.w);
});

test('rotating 180° turns the shape about its visible box center', function () {
    const s = pant(40, 20, 100);
    const p0 = g.prepareShape(s, { gap: 0, rot: 0, tol: 0 });
    const p1 = g.prepareShape(s, { gap: 0, rot: 180, tol: 0 });
    assert.equal(p1.w, p0.w);
    assert.equal(p1.h, p0.h);
    // Rot 0: the 40cm waist is at the top; rot 180: at the bottom.
    const widthAt = (poly, y) => {
        const xs = g.intersection([poly], [[{ X: -1e6, Y: y - 1 }, { X: 1e6, Y: y - 1 }, { X: 1e6, Y: y + 1 }, { X: -1e6, Y: y + 1 }]])
            .flat().map((q) => q.X);
        return Math.max(...xs) - Math.min(...xs);
    };
    assert.ok(widthAt(p0.poly, 10) > widthAt(p0.poly, p0.h - 10));
    assert.ok(widthAt(p1.poly, 10) < widthAt(p1.poly, p1.h - 10));
});

test('the first part sits at the sheet top-left, stroke on the edge', function () {
    const j = job({ A: shape([[0, 0], [60, 0], [60, 75], [0, 75]]) }, ['A']);
    const ctx = createContext(j, { tol: 0 });
    const r = toResult(ctx, placeAll(ctx, genes(1)));
    assert.equal(r.sheets, 1);
    assert.ok(Math.abs(r.placements[0].x) < 0.05 && Math.abs(r.placements[0].y) < 0.05, JSON.stringify(r.placements[0]));
});

test('turning every other pant piece 180° nests them head to toe', function () {
    // Two 40cm-waist / 20cm-hem pieces: side by side they need 80cm + gap, nested 70cm + gap.
    const narrow = { w: 72 * CM, h: 500 * CM };
    const j = job({ P: pant(40, 20, 100) }, ['P', 'P'], narrow);
    const ctx = createContext(j);

    const upright = toResult(ctx, placeAll(ctx, genes(2, 0)));
    assert.ok(upright.placements[1].y > 50 * CM, 'upright: the second piece can only go (mostly) below');

    const nested = toResult(ctx, placeAll(ctx, [{ part: 0, rot: 0 }, { part: 1, rot: 180 }]));
    assertValidResult(j, nested);
    assert.ok(nested.placements[1].y < 1 * CM, 'nested: the turned piece sits beside the first');
    assert.ok(nested.fitness < upright.fitness);
});

test('a small part drops into the space beside a shirt\'s neckline and armhole', function () {
    const j = job({ S: shirt(60, 75), L: sleeve(40, 55) }, ['S', 'S', 'L']);
    const ctx = createContext(j);
    const r = toResult(ctx, placeAll(ctx, genes(3)));
    assertValidResult(j, r);
    assert.equal(r.sheets, 1);
});

test('a realistic order mix: valid, and fewer sheets than engine 1', function () {
    const shapes = { F: shirt(62, 78), B: shirt(62, 80), P1: pant(32, 22, 105), P2: pant(30, 20, 100),
                     L: sleeve(42, 58), R: sleeve(42, 58) };
    const kinds = ['F', 'B', 'P1', 'P2', 'P1', 'P2', 'L', 'R'];
    const parts = [];
    for (let n = 0; n < 12; n++) parts.push(...kinds);
    const j = job(shapes, parts);
    const ctx = createContext(j);
    // Largest first, alternating rotations — a typical GA starting point.
    const order = parts.map((s, i) => i).sort((a, b) => ctx.shapes[parts[b] + '@0'].area - ctx.shapes[parts[a] + '@0'].area);
    const r = toResult(ctx, placeAll(ctx, order.map((part, i) => ({ part, rot: i % 2 ? 180 : 0 }))));
    assertValidResult(j, r);
    assert.equal(r.placements.length, parts.length);

    // Engine 1 on the same parts' boxes, sleeves into the gaps.
    const env = makeSheetEnv();
    const main = [], sleeves = [];
    parts.forEach((s, i) => (s === 'L' || s === 'R' ? sleeves : main).push({ w: shapes[s].w, h: shapes[s].h, label: s, data: i }));
    const engine1 = env.layoutSequential(main, sleeves).sheets.length;
    assert.ok(r.sheets < engine1, r.sheets + ' sheets vs engine 1\'s ' + engine1);
});

test('a part bigger than the sheet throws', function () {
    const j = job({ X: shape([[0, 0], [170, 0], [170, 10], [0, 10]]) }, ['X']);
    const ctx = createContext(j);
    assert.throws(() => placeAll(ctx, genes(1)), /does not fit/);
});
