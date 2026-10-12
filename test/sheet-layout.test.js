const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { makeSheetEnv } = require('./helpers/helper');

const CM = 10 * 2.83465;

test('makeSheet fills a page row by row, then starts a new page', function () {
    const env = makeSheetEnv();
    env.SHEETS_PER_ROW = 3;
    env.SHEET_ROWS     = 2;
    const pos = [0, 1, 2, 3, 4, 5, 6].map(function (n) {
        const s = env.makeSheet(n);
        return [s.index, s.page, s.row, s.col];
    });
    assert.deepEqual(pos, [
        [0, 1, 0, 0], [1, 1, 0, 1], [2, 1, 0, 2],
        [3, 1, 1, 0], [4, 1, 1, 1], [5, 1, 1, 2],
        [6, 2, 0, 0]
    ]);
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

test('sheetName zero-pads to at least two digits and to the total width', function () {
    const env = makeSheetEnv();
    assert.equal(env.sheetName(3, 9), '03');
    assert.equal(env.sheetName(3, 120), '003');
    assert.equal(env.sheetName(120, 120), '120');
});
