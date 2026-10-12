const { test } = require('node:test');
const assert   = require('node:assert/strict');
const fs       = require('fs');
const path     = require('path');
const vm       = require('vm');

function makeOutputEnv() {
    const context = vm.createContext({ Transformation: { CENTER: 'center' } });
    for (const rel of ['lib/config.jsx', 'lib/utils.jsx', 'lib/sheet_layout.jsx', 'lib/output_parts.jsx']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'), context);
    }
    return context;
}

// An Illustrator-like collection: indexable, with getByName.
function collection(items) {
    const c = items.slice();
    c.getByName = (n) => {
        const found = c.find((x) => x.name === n);
        if (!found) throw new Error('No such element');
        return found;
    };
    return c;
}

// A fake printed part: group {name} with {name}_OUTLINE (box w × h, top-left at x, y in
// document units, y up). Moving the group moves the outline; rotating it 180° about its
// center keeps the box and is recorded.
function part(name, x, y, w, h) {
    const outline = { name: name + '_OUTLINE', visibleBounds: [x, y, x + w, y - h] };
    const group = {
        name, typename: 'GroupItem', rotated: 0,
        pageItems: collection([outline, { name: name + '_FINAL' }]),
        get position() { return [outline.visibleBounds[0], outline.visibleBounds[1]]; },
        set position(p) {
            const [l, t, r, b] = outline.visibleBounds, dx = p[0] - l, dy = p[1] - t;
            outline.visibleBounds = [l + dx, t + dy, r + dx, b + dy];
        },
        rotate(angle) { this.rotated += angle; }
    };
    return group;
}

function fakeDoc(groups, artboardNames) {
    const artboards = [];
    artboards.add = (rect) => { const ab = { artboardRect: rect, name: '' }; artboards.push(ab); return ab; };
    artboards.remove = (k) => artboards.splice(k, 1);
    artboardNames.forEach((n, i) => artboards.add([1000 + i * 100, 5000, 1100 + i * 100, 4500]).name = n);
    const layer = { name: 'PRINT_OUTPUT', pageItems: collection(groups) };
    return { name: 'page.ai', layers: collection([layer]), artboards };
}

test('parseInstanceName reads {size}_{n}_{side} and ignores anything else', function () {
    const env = makeOutputEnv();
    assert.deepEqual({ ...env.parseInstanceName('2XL_12_LEFT_PANT_1') }, { sz: '2XL', n: 12, side: 'LEFT_PANT_1' });
    assert.deepEqual({ ...env.parseInstanceName('1_3_FRONT') }, { sz: '1', n: 3, side: 'FRONT' });
    assert.equal(env.parseInstanceName('M_FRONT'), null);        // a Step-1 master, no order number
    assert.equal(env.parseInstanceName('M_1_COLLAR'), null);     // unknown side
    assert.equal(env.parseInstanceName('XXL_1_FRONT'), null);    // unknown size
});

test('sortPrintOrder: per size, every order\'s shirt parts, then every order\'s pant parts', function () {
    const env = makeOutputEnv();
    const names = ['M_1_LEFT_PANT', 'S_2_FRONT', 'M_1_BACK', 'S_1_RIGHT_PANT', 'S_1_BACK', 'S_1_FRONT',
                   'S_2_LEFT_SLEEVE', 'M_2_FRONT', 'S_1_LEFT_PANT'];
    const sorted = env.sortPrintOrder(names.map((n) => Object.assign({ name: n }, env.parseInstanceName(n))));
    assert.deepEqual(Array.from(sorted, (it) => it.name), [
        'S_1_FRONT', 'S_1_BACK', 'S_2_FRONT', 'S_2_LEFT_SLEEVE', 'S_1_LEFT_PANT', 'S_1_RIGHT_PANT',
        'M_1_BACK', 'M_2_FRONT', 'M_1_LEFT_PANT'
    ]);
});

test('renumberedSheetName carries on from the first artboard\'s number and width', function () {
    const env = makeOutputEnv();
    assert.equal(env.renumberedSheetName('13', 0), '13');
    assert.equal(env.renumberedSheetName('13', 2), '15');
    assert.equal(env.renumberedSheetName('007', 5), '012');
    assert.equal(env.renumberedSheetName('Artboard 1', 1), '02');
});

test('readOutputParts measures real sizes; applyLayout moves, turns and re-sheets', function () {
    const env = makeOutputEnv();
    const scale = 10;
    const groups = [part('M_1_LEFT_PANT', 1200, 4900, 60, 50), part('M_1_FRONT', 1010, 4990, 50, 65),
                    { name: 'stray', typename: 'PathItem' }];
    const doc = fakeDoc(groups, ['13', '14']);

    const items = env.readOutputParts(doc, scale);
    assert.deepEqual(Array.from(items, (it) => it.label), ['M_1_FRONT', 'M_1_LEFT_PANT']);
    assert.deepEqual([items[0].key, items[0].w, items[0].h], ['M_FRONT', 500, 650]);

    const sheets = [{ index: 0 }, { index: 1 }, { index: 2 }];
    env.applyLayout(doc, {
        sheets,
        placements: [{ sheet: sheets[2], x: 100, y: 200, rot: 180, data: items[1] },
                     { sheet: sheets[0], x: 0, y: 0, rot: 0, data: items[0] }]
    }, scale);

    // Sheet 1 starts where the first artboard was; sheet 3 is two columns to the right.
    const col = (env.SHEET_W + env.SHEET_GAP) / scale;
    assert.deepEqual(Array.from(items[0].outline.visibleBounds.slice(0, 2)), [1000, 5000]);
    const pant = items[1].outline.visibleBounds;
    assert.ok(Math.abs(pant[0] - (1000 + 2 * col + 10)) < 1e-9 && Math.abs(pant[1] - (5000 - 20)) < 1e-9);
    assert.equal(items[1].group.rotated, 180);
    assert.equal(items[0].group.rotated, 0);

    assert.deepEqual(Array.from(doc.artboards, (a) => a.name), ['13', '14', '15']);
    assert.deepEqual(Array.from(doc.artboards[2].artboardRect.slice(0, 2)), [1000 + 2 * col, 5000]);
});

test('sheets beyond one row continue on the rows below', function () {
    const env = makeOutputEnv();
    assert.deepEqual({ ...env.sheetSlot(env.SHEETS_PER_ROW + 1) }, { col: 1, row: 1 });
    assert.deepEqual({ ...env.sheetSlot(2 * env.SHEETS_PER_ROW) }, { col: 0, row: 2 });
});
