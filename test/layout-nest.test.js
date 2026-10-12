const { test } = require('node:test');
const assert   = require('node:assert/strict');
const fs       = require('fs');
const os       = require('os');
const path     = require('path');
const vm       = require('vm');
const { execFileSync } = require('child_process');
const { assertValidResult } = require('./helpers/shapes');

const ROOT = path.join(__dirname, '..');

function makeNestEnv() {
    const context = vm.createContext({});
    for (const rel of ['lib/config.jsx', 'lib/utils.jsx', 'lib/sheet_layout.jsx', 'lib/json.jsx',
                       'lib/export_shapes.jsx', 'lib/layout_nest.jsx']) {
        vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), context);
    }
    return context;
}

test('every .jsx file parses as ES3-era JavaScript (after its # directives)', function () {
    const files = ['nhap_ten_so.jsx', 'nhay_size.jsx']
        .concat(fs.readdirSync(path.join(ROOT, 'lib')).filter((f) => f.endsWith('.jsx')).map((f) => 'lib/' + f))
        .concat(fs.readdirSync(path.join(ROOT, 'tools')).filter((f) => f.endsWith('.jsx')).map((f) => 'tools/' + f));
    for (const f of files) {
        const code = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/^#.*$/gm, '');
        assert.doesNotThrow(() => new vm.Script(code, { filename: f }), f);
    }
});

test('nestResultToLayout maps parts back to their items and sheets to the page grid', function () {
    const env = makeNestEnv();
    env.SHEETS_PER_ROW = 2;
    env.SHEET_ROWS = 1;
    const items = [{ key: 'S_FRONT', data: 'a' }, { key: 'S_BACK', data: 'b' }, { key: 'S_FRONT', data: 'c' }];
    const layout = env.nestResultToLayout({
        sheets: 3,
        placements: [{ part: 0, sheet: 0, x: 1, y: 2, rot: 0 }, { part: 1, sheet: 2, x: 3, y: 4, rot: 180 },
                     { part: 2, sheet: 1, x: 5, y: 6, rot: 0 }]
    }, items);
    assert.equal(layout.sheets.length, 3);
    assert.deepEqual(Array.from(layout.sheets, (s) => [s.page, s.col]), [[1, 0], [1, 1], [2, 0]]);
    const b = layout.placements[1];
    assert.equal(b.data, 'b');
    assert.equal(b.sheet, layout.sheets[2]);
    assert.deepEqual([b.x, b.y, b.rot], [3, 4, 180]);
});

// The engine-2 path minus Illustrator: buildNestJob (as layoutNest calls it) on fake
// outlines → JSON on disk → the nester CLI (as runNester starts it) → layout.
test('end to end: export → nester CLI → layout', function () {
    const env = makeNestEnv();
    const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/shirt-shorts-SML.job.json'), 'utf8'));
    // Fake Step-1 outlines rebuilt from the real exported shapes (y up in the document).
    const outlines = {};
    for (const key of ['M_FRONT', 'M_LEFT_PANT']) {
        const s = fixture.shapes[key], ring = s.rings[0], pts = [];
        for (let i = 0; i < ring.length; i += 2) {
            const p = [ring[i], 1000 - ring[i + 1]];
            pts.push({ anchor: p, leftDirection: p, rightDirection: p });
        }
        outlines[key + '_OUTLINE'] = {
            typename: 'PathItem', closed: true, pathPoints: pts,
            stroked: true, strokeWidth: 2 * s.pad, strokeMiterLimit: s.miter,
            visibleBounds: [0, 1000, s.w, 1000 - s.h]
        };
    }
    const doc = { name: 'step1.ai', pageItems: { getByName: (n) => outlines[n] } };
    const items = [];
    for (let q = 0; q < 3; q++) for (const key of ['M_FRONT', 'M_LEFT_PANT']) items.push({ key, data: key + '#' + q });

    const job = env.buildNestJob(doc, items.map((it) => it.key), 1);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mk-nest-'));
    fs.writeFileSync(path.join(dir, 'job.json'), env.toJSON(job));
    execFileSync(process.execPath, [path.join(ROOT, 'nester/cli.js'), path.join(dir, 'job.json'), dir]);
    const result = JSON.parse(fs.readFileSync(path.join(dir, 'result.json'), 'utf8'));
    fs.rmSync(dir, { recursive: true, force: true });

    assertValidResult(JSON.parse(env.toJSON(job)), result);
    const layout = env.nestResultToLayout(result, items);
    assert.equal(layout.placements.length, items.length);
    assert.deepEqual(Array.from(layout.placements, (p) => p.data).sort(), items.map((it) => it.data).sort());
    assert.ok(Array.from(layout.placements).every((p) => p.rot === 0 || p.rot === 180));
});
