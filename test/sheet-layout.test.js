const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { makeSheetEnv } = require('./helpers/helper');

const CM = 10 * 2.83465;

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

test('sheets fill a page row by row, then start a new page', function () {
    const env = makeSheetEnv();
    env.SHEETS_PER_ROW = 3;
    env.SHEET_ROWS     = 2;
    const packer = env.createSheetPacker();
    for (let i = 0; i < 7; i++) packer.place(env.SHEET_H); // one full sheet each
    const pos = Array.from(packer.sheets).map(function (s) { return [s.page, s.row, s.col]; });
    assert.deepEqual(pos, [
        [1, 0, 0], [1, 0, 1], [1, 0, 2],
        [1, 1, 0], [1, 1, 1], [1, 1, 2],
        [2, 0, 0]
    ]);
    assert.equal(packer.pageCount(), 2);
});

test('pageCount is 0 before anything is placed', function () {
    const env = makeSheetEnv();
    assert.equal(env.createSheetPacker().pageCount(), 0);
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
    env.SHEET_ROWS     = 1;
    const scale = 10;
    const grid  = env.sheetGrid([0, 1000, 1000, 0], scale); // center (500, 500)
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

test('unionBounds covers every box', function () {
    const env = makeSheetEnv();
    const u = env.unionBounds([
        { left: 0,  top: 100, width: 50, height: 40 },
        { left: 60, top: 80,  width: 20, height: 70 }
    ]);
    assert.deepEqual({ ...u }, { left: 0, top: 100, width: 80, height: 90 });
});

test('sheetName zero-pads to at least two digits and to the total width', function () {
    const env = makeSheetEnv();
    assert.equal(env.sheetName(3, 9), '03');
    assert.equal(env.sheetName(3, 120), '003');
    assert.equal(env.sheetName(120, 120), '120');
});
