const { test } = require('node:test');
const assert   = require('node:assert/strict');
const fs       = require('fs');
const path     = require('path');
const vm       = require('vm');
const { nest } = require('../nester/index');
const { assertValidResult } = require('./helpers/shapes');

function makeExportEnv() {
    const context = vm.createContext({});
    for (const rel of ['lib/config.jsx', 'lib/utils.jsx', 'lib/sheet_layout.jsx', 'lib/json.jsx', 'lib/export_shapes.jsx']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'), context);
    }
    return context;
}

// A fake Illustrator PathItem. pts: [[anchor, left, right], ...] in doc coords (y up);
// a point given as just an anchor has no handles.
function pathItem(pts, closed = true) {
    return {
        typename: 'PathItem',
        closed,
        pathPoints: pts.map((p) => (typeof p[0] === 'number'
            ? { anchor: p, leftDirection: p, rightDirection: p }
            : { anchor: p[0], leftDirection: p[1], rightDirection: p[2] }))
    };
}

test('toJSON round-trips through JSON.parse, escaping strings', function () {
    const env = makeExportEnv();
    const v = { a: [1, 2.5, -3e-4], s: 'Áo "M"\\\n\t', t: true, n: null, o: { x: [] } };
    assert.deepEqual(JSON.parse(env.toJSON(v)), v);
    assert.equal(env.toJSON(NaN), 'null');
});

test('straight segments keep only their corners', function () {
    const env = makeExportEnv();
    const ring = env.flattenPath(pathItem([[0, 0], [100, 0], [100, 50], [0, 50]]));
    assert.deepEqual(Array.from(ring), [0, 0, 100, 0, 100, 50, 0, 50]);
});

test('curves are traced with chords no longer than TRACE_STEP, through the curve', function () {
    const env = makeExportEnv();
    // A quarter-circle-ish arc of radius 100pt from (100, 0) to (0, 100), then back.
    const k = 55.23;
    const ring = Array.from(env.flattenPath(pathItem([
        [[100, 0], [100, 0], [100, k]],
        [[0, 100], [k, 100], [0, 100]],
        [0, 0]
    ])));
    const pts = [];
    for (let i = 0; i < ring.length; i += 2) pts.push([ring[i], ring[i + 1]]);
    assert.ok(pts.length > 20, 'curve is subdivided');
    for (let i = 0; i + 1 < pts.length - 2; i++) {
        const d = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
        assert.ok(d <= env.TRACE_STEP + 1e-9, 'chord ' + i + ' is ' + d);
    }
    for (const [x, y] of pts.slice(1, -2)) {
        assert.ok(Math.abs(Math.hypot(x, y) - 100) < 0.1, 'on the arc: ' + x + ',' + y);
    }
});

test('exportShape and buildNestJob produce a job the nester can nest', async function () {
    const env = makeExportEnv();
    // Outline with a 1pt stroke: geometry 0..200 × 0..300 (y up), visible box 0.5pt larger.
    const outline = Object.assign(pathItem([[0, 300], [200, 300], [150, 0], [50, 0]]), {
        name: 'S_LEFT_PANT_OUTLINE',
        stroked: true, strokeWidth: 1, strokeMiterLimit: 4,
        geometricBounds: [0, 300, 200, 0],
        visibleBounds: [-0.5, 300.5, 200.5, -0.5]
    });
    const doc = {
        name: 'design.ai',
        pageItems: { getByName: (n) => { if (n === outline.name) return outline; throw new Error('missing'); } }
    };
    const shape = env.exportShape(doc, 'S_LEFT_PANT');
    assert.equal(shape.w, 201);
    assert.equal(shape.h, 301);
    assert.equal(shape.pad, 0.5);
    assert.equal(shape.miter, 4);
    // y flipped to point down, origin at the visible box's top-left.
    assert.deepEqual(Array.from(shape.rings[0]), [0.5, 0.5, 200.5, 0.5, 150.5, 300.5, 50.5, 300.5]);

    const job = JSON.parse(env.toJSON(env.buildNestJob(doc, ['S_LEFT_PANT', 'S_LEFT_PANT', 'S_LEFT_PANT'], 1)));
    assert.equal(Object.keys(job.shapes).length, 1);
    assert.equal(job.parts.length, 3);
    const result = await nest(job, { threads: 0, timeLimitMs: 300 });
    assertValidResult(job, result);
});
