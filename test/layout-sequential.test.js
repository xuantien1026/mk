const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { makeSheetEnv } = require('./helpers/helper');

const CM = 10 * 2.83465;

function part(wCm, hCm, id) {
    return { w: wCm * CM, h: hCm * CM, label: id, data: id };
}

// Placement of the part whose data is id.
function at(layout, id) {
    return layout.placements.find(function (p) { return p.data === id; });
}

function near(a, b) {
    return Math.abs(a - b) < 1e-6;
}

// Every part inside its sheet, and any two parts on a sheet at least PRODUCT_GAP apart.
function assertValid(env, layout, sizes) {
    const ps = layout.placements;
    const eps = 1e-6;
    for (const p of ps) {
        const s = sizes[p.data];
        assert.ok(p.x >= -eps && p.y >= -eps, p.data + ' starts inside the sheet');
        assert.ok(p.x + s.w <= env.SHEET_W + eps && p.y + s.h <= env.SHEET_H + eps, p.data + ' ends inside the sheet');
    }
    for (let i = 0; i < ps.length; i++) {
        for (let j = i + 1; j < ps.length; j++) {
            const a = ps[i], b = ps[j];
            if (a.sheet !== b.sheet) continue;
            const sa = sizes[a.data], sb = sizes[b.data], g = env.PRODUCT_GAP - eps;
            const apart = a.x + sa.w + g <= b.x || b.x + sb.w + g <= a.x ||
                          a.y + sa.h + g <= b.y || b.y + sb.h + g <= a.y;
            assert.ok(apart, a.data + ' and ' + b.data + ' are at least a gap apart');
        }
    }
}

function sizesOf(parts, sleeves) {
    const sizes = {};
    for (const p of parts.concat(sleeves)) sizes[p.data] = p;
    return sizes;
}

test('main parts go left to right in order, wrapping onto a new shelf below the tallest', function () {
    const env = makeSheetEnv();
    const G = env.PRODUCT_GAP;
    const parts = [part(70, 80, 'S_FRONT'), part(70, 90, 'S_BACK'), part(40, 100, 'S_PANT')];
    const layout = env.layoutSequential(parts, []);
    assert.equal(layout.sheets.length, 1);
    assert.deepEqual([at(layout, 'S_FRONT').x, at(layout, 'S_FRONT').y], [0, 0]);
    assert.ok(near(at(layout, 'S_BACK').x, 70 * CM + G));
    assert.equal(at(layout, 'S_BACK').y, 0);
    // 70 + 70 + 40 (+ gaps) > 159 → next shelf, below the 90cm back.
    assert.equal(at(layout, 'S_PANT').x, 0);
    assert.ok(near(at(layout, 'S_PANT').y, 90 * CM + G));
});

test('a part filling the rest of a row or sheet exactly still fits', function () {
    const env = makeSheetEnv();
    const G = env.PRODUCT_GAP;
    const parts = [part(100, 200, 'a'), { w: env.SHEET_W - 100 * CM - G, h: 200 * CM, label: 'b', data: 'b' },
                   { w: 10 * CM, h: env.SHEET_H - 200 * CM - G, label: 'c', data: 'c' }];
    const layout = env.layoutSequential(parts, []);
    assert.equal(layout.sheets.length, 1);
    assert.equal(at(layout, 'b').y, 0);
    assert.ok(near(at(layout, 'c').y, 200 * CM + G));
});

test('a shelf that does not fit the sheet starts a new sheet', function () {
    const env = makeSheetEnv();
    const parts = [part(150, 300, 'a'), part(150, 250, 'b')];
    const layout = env.layoutSequential(parts, []);
    assert.equal(layout.sheets.length, 2);
    assert.equal(at(layout, 'b').sheet, layout.sheets[1]);
    assert.deepEqual([at(layout, 'b').x, at(layout, 'b').y], [0, 0]);
});

test('sleeves fill the gap under a shorter part, one after another', function () {
    const env = makeSheetEnv();
    const G = env.PRODUCT_GAP;
    // Shelf: a 100cm-tall pant then a 40cm-tall piece → a 60cm gap under the short one.
    const parts = [part(60, 100, 'tall'), part(90, 40, 'short'), part(150, 300, 'next')];
    const sleeves = [part(30, 50, 'L'), part(30, 50, 'R')];
    const layout = env.layoutSequential(parts, sleeves);
    assertValid(env, layout, sizesOf(parts, sleeves));
    assert.equal(layout.sheets.length, 1);
    const L = at(layout, 'L'), R = at(layout, 'R');
    assert.ok(near(L.x, 60 * CM + G));
    assert.ok(near(L.y, 40 * CM + G));
    assert.ok(near(R.x, L.x + 30 * CM + G), 'next topmost-leftmost spot: right of L');
    assert.equal(R.y, L.y);
});

test('sleeves stack down a narrow gap', function () {
    const env = makeSheetEnv();
    const G = env.PRODUCT_GAP;
    // Leaves a 39cm-wide column at the end of the shelf: room for one sleeve across.
    const parts = [part(120, 200, 'wide'), part(150, 290, 'next')];
    const sleeves = [part(30, 80, 'L'), part(30, 80, 'R')];
    const layout = env.layoutSequential(parts, sleeves);
    assertValid(env, layout, sizesOf(parts, sleeves));
    assert.equal(layout.sheets.length, 1);
    const L = at(layout, 'L'), R = at(layout, 'R');
    assert.ok(near(L.x, 120 * CM + G));
    assert.equal(L.y, 0);
    assert.equal(R.x, L.x);
    assert.ok(near(R.y, 80 * CM + G), 'R right below L');
});

test('sleeves go to the earliest sheet with room, and to a new sheet when none has', function () {
    const env = makeSheetEnv();
    const full = { w: env.SHEET_W, h: env.SHEET_H, label: 'full', data: 'full' };
    const parts = [full, part(150, 100, 'half')];
    const sleeves = [part(40, 60, 'L1'), part(40, 60, 'R1')];
    let layout = env.layoutSequential(parts, sleeves);
    assert.equal(layout.sheets.length, 2);
    assert.equal(at(layout, 'L1').sheet, layout.sheets[1]);

    layout = env.layoutSequential([full], sleeves);
    assert.equal(layout.sheets.length, 2);
    assert.deepEqual([at(layout, 'L1').sheet.index, at(layout, 'L1').x, at(layout, 'L1').y], [1, 0, 0]);
    assert.equal(at(layout, 'R1').sheet, layout.sheets[1], 'the new sheet takes the next sleeve too');
});

test('sleeves alone (no main parts) still get a sheet', function () {
    const env = makeSheetEnv();
    const layout = env.layoutSequential([], [part(40, 60, 'L'), part(40, 60, 'R')]);
    assert.equal(layout.sheets.length, 1);
    assert.equal(layout.placements.length, 2);
});

test('an oversized part or sleeve throws with its label', function () {
    const env = makeSheetEnv();
    assert.throws(() => env.layoutSequential([part(160, 10, 'Áo size M (FRONT)')], []), /Áo size M \(FRONT\)/);
    assert.throws(() => env.layoutSequential([], [part(10, 501, 'Áo size M (LEFT_SLEEVE)')]), /LEFT_SLEEVE/);
});

test('sheets carry their page grid position', function () {
    const env = makeSheetEnv();
    env.SHEETS_PER_ROW = 2;
    env.SHEET_ROWS     = 1;
    const parts = [];
    for (let i = 0; i < 3; i++) parts.push({ w: env.SHEET_W, h: env.SHEET_H, label: 'p' + i, data: 'p' + i });
    const layout = env.layoutSequential(parts, []);
    const pos = Array.from(layout.sheets).map(function (s) { return [s.page, s.col]; });
    assert.deepEqual(pos, [[1, 0], [1, 1], [2, 0]]);
});

test('a realistic order mix never overlaps or leaves the sheet', function () {
    const env = makeSheetEnv();
    const parts = [], sleeves = [];
    // Deterministic pseudo-random sizes around real garment parts.
    let seed = 42;
    function rnd(lo, hi) { seed = (seed * 1103515245 + 12345) % 2147483648; return lo + (hi - lo) * seed / 2147483648; }
    for (let n = 0; n < 40; n++) {
        parts.push(part(rnd(50, 75), rnd(65, 85), 'F' + n), part(rnd(50, 75), rnd(65, 85), 'B' + n));
        for (let k = 0; k < 4; k++) parts.push(part(rnd(25, 35), rnd(90, 110), 'P' + n + '_' + k));
        sleeves.push(part(rnd(35, 45), rnd(45, 60), 'L' + n), part(rnd(35, 45), rnd(45, 60), 'R' + n));
    }
    const layout = env.layoutSequential(parts, sleeves);
    assertValid(env, layout, sizesOf(parts, sleeves));
    assert.equal(layout.placements.length, parts.length + sleeves.length);
});
