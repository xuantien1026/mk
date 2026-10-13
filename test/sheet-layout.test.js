const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { makeSheetEnv } = require('./helpers/helper');

const CM = 10 * 2.83465;

test('makeSheet fills the grid row by row, as many rows as needed', function () {
    const env = makeSheetEnv();
    env.SHEETS_PER_ROW = 3;
    const pos = [0, 1, 2, 3, 4, 5, 6].map(function (n) {
        const s = env.makeSheet(n);
        return [s.index, s.row, s.col];
    });
    assert.deepEqual(pos, [
        [0, 0, 0], [1, 0, 1], [2, 0, 2],
        [3, 1, 0], [4, 1, 1], [5, 1, 2],
        [6, 2, 0]
    ]);
});

test('products stack in one sheet with PRODUCT_GAP between them', function () {
    const env = makeSheetEnv();
    const packer = env.createSheetPacker();
    const a = packer.place(100 * CM);
    const b = packer.place(100 * CM);
    assert.equal(a.sheet, b.sheet);
    assert.equal(a.offset, 0);
    assert.equal(b.offset, 100 * CM + env.PRODUCT_GAP);
    assert.equal(packer.sheets.length, 1);
});

test('a product that does not fit starts a new sheet at offset 0', function () {
    const env = makeSheetEnv();
    const packer = env.createSheetPacker();
    packer.place(300 * CM);
    const b = packer.place(250 * CM);          // 300 + gap + 250 > 500
    assert.equal(packer.sheets.length, 2);
    assert.equal(b.sheet.index, 1);
    assert.equal(b.offset, 0);
});

test('a product filling the rest of a sheet exactly still fits', function () {
    const env = makeSheetEnv();
    const packer = env.createSheetPacker();
    packer.place(200 * CM);
    packer.place(env.SHEET_H - 200 * CM - env.PRODUCT_GAP);
    assert.equal(packer.sheets.length, 1);
});

test('packed sheets fill the grid row by row', function () {
    const env = makeSheetEnv();
    env.SHEETS_PER_ROW = 3;
    const packer = env.createSheetPacker();
    for (let i = 0; i < 7; i++) packer.place(env.SHEET_H); // one full sheet each
    const pos = Array.from(packer.sheets).map(function (s) { return [s.row, s.col]; });
    assert.deepEqual(pos, [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0]]);
});

test('unionBounds covers every box', function () {
    const env = makeSheetEnv();
    const u = env.unionBounds([
        { left: 0,  top: 100, width: 50, height: 40 },
        { left: 60, top: 80,  width: 20, height: 70 }
    ]);
    assert.deepEqual({ ...u }, { left: 0, top: 100, width: 80, height: 90 });
});

test('checkFits rejects a block wider or taller than a sheet', function () {
    const env = makeSheetEnv();
    env.checkFits({ width: 159 * CM, height: 500 * CM }, 'ok');
    assert.throws(() => env.checkFits({ width: 160 * CM, height: 10 * CM }, 'Áo size M'), /Áo size M \(160cm/);
    assert.throws(() => env.checkFits({ width: 10 * CM, height: 501 * CM }, 'x'));
});

test('sheetGrid centers the grid on the artboard and scales to document units', function () {
    const env = makeSheetEnv();
    env.SHEETS_PER_ROW = 2;
    const scale = 10;
    const grid  = env.sheetGrid([0, 1000, 1000, 0], scale, 2); // center (500, 500)
    const r0 = grid.rect({ col: 0, row: 0 });
    const r1 = grid.rect({ col: 1, row: 0 });
    const w = env.SHEET_W / scale, h = env.SHEET_H / scale, gap = env.SHEET_GAP / scale;
    // Two sheets + one gap, centered on x = 500; one row centered on y = 500.
    assert.ok(Math.abs(r0[0] - (500 - (2 * w + gap) / 2)) < 1e-9);
    assert.ok(Math.abs(r0[1] - (500 + h / 2)) < 1e-9);
    assert.ok(Math.abs((r0[2] - r0[0]) - w) < 1e-9);
    assert.ok(Math.abs((r0[1] - r0[3]) - h) < 1e-9);
    assert.ok(Math.abs(r1[0] - (r0[2] + gap)) < 1e-9);
    assert.ok(Math.abs((r1[2] + r0[0]) / 2 - 500) < 1e-9); // symmetric about the center
});

test('sheetGrid sizes the grid to the sheets: fewer than a row, and rows down', function () {
    const env = makeSheetEnv();
    const scale = 10;
    const w = env.SHEET_W / scale, h = env.SHEET_H / scale, gap = env.SHEET_GAP / scale;
    // One sheet: centered on its own.
    const one = env.sheetGrid([0, 1000, 1000, 0], scale, 1).rect(env.makeSheet(0));
    assert.ok(Math.abs((one[0] + one[2]) / 2 - 500) < 1e-9 && Math.abs((one[1] + one[3]) / 2 - 500) < 1e-9);
    // Two rows (SHEETS_PER_ROW + 1 sheets): the grid's top and bottom are symmetric about y = 500.
    const n = env.SHEETS_PER_ROW + 1, grid = env.sheetGrid([0, 1000, 1000, 0], scale, n);
    const top = grid.rect(env.makeSheet(0))[1], bottom = grid.rect(env.makeSheet(n - 1))[3];
    assert.ok(Math.abs(top - (500 + (2 * h + gap) / 2)) < 1e-9);
    assert.ok(Math.abs(bottom - (500 - (2 * h + gap) / 2)) < 1e-9);
    assert.ok(Math.abs(grid.rect(env.makeSheet(0))[0] - (500 - (env.SHEETS_PER_ROW * (w + gap) - gap) / 2)) < 1e-9);
});

test('sheetGrid holds about 11 rows of a Large Canvas and refuses more', function () {
    const env = makeSheetEnv();
    const perRow = env.SHEETS_PER_ROW;
    env.sheetGrid([0, 1000, 1000, 0], 10, 11 * perRow);
    assert.throws(() => env.sheetGrid([0, 1000, 1000, 0], 10, 11 * perRow + 1), /tối đa 66 tấm/);
});

test('sheetName zero-pads to at least two digits and to the total width', function () {
    const env = makeSheetEnv();
    assert.equal(env.sheetName(3, 9), '03');
    assert.equal(env.sheetName(3, 120), '003');
    assert.equal(env.sheetName(120, 120), '120');
});

function box(left, top, w, h) { return { left: left * CM, top: top * CM, width: w * CM, height: h * CM }; }
function round(pos) { return Array.from(pos).map(function (p) { return [Math.round(p.x / CM), Math.round(p.y / CM)]; }); }

test('productLayout keeps the Step-1 layout when it fits the sheet width', function () {
    const env = makeSheetEnv();
    const l = env.productLayout([box(10, 100, 60, 80), box(80, 100, 60, 80), box(150, 90, 9, 30)]);
    assert.equal(Math.round(l.width / CM), 149);
    assert.equal(Math.round(l.height / CM), 80);
    assert.deepEqual(round(l.pos), [[0, 0], [70, 0], [140, 10]]);
});

test('productLayout wraps parts into rows when the Step-1 layout is too wide', function () {
    const env = makeSheetEnv();
    // front | back | sleeve | sleeve = 70 + 70 + 30 + 30 (+ gaps) > 159cm
    const boxes = [box(0, 0, 70, 90), box(80, 0, 70, 90), box(160, 0, 30, 50), box(200, 0, 30, 50)];
    const l = env.productLayout(boxes);
    const g = env.PRODUCT_GAP;
    assert.ok(l.width <= env.SHEET_W);
    assert.equal(l.pos[0].x, 0);
    assert.equal(l.pos[1].x, 70 * CM + g);
    assert.equal(l.pos[2].y, 90 * CM + g);      // first sleeve starts row 2
    assert.equal(l.pos[2].x, 0);
    assert.equal(l.pos[3].x, 30 * CM + g);
    assert.equal(l.pos[3].y, 90 * CM + g);
    assert.equal(l.height, 90 * CM + g + 50 * CM);
});
