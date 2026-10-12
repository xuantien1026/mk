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
    const ring = env.flattenPath(pathItem([[0, 0], [100, 0], [100, 50], [0, 50]]), env.TRACE_STEP);
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
    ]), env.TRACE_STEP));
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

// A pant-like outline with a 1pt stroke, at 1/scale size (a Large Canvas document shows
// everything at 1/10): geometry 0..200 × 0..300 real pt (y up), visible box 0.5pt larger.
// strokeWidth is reported as given.
function pantOutline(scale, strokeWidth) {
    const k = (v) => v / scale;
    return Object.assign(pathItem([[0, 300], [200, 300], [150, 0], [50, 0]].map((p) => p.map(k))), {
        stroked: true, strokeWidth, strokeMiterLimit: 4,
        geometricBounds: [0, 300, 200, 0].map(k),
        visibleBounds: [-0.5, 300.5, 200.5, -0.5].map(k)
    });
}

test('exportShape and buildNestJob produce a job the nester can nest', async function () {
    const env = makeExportEnv();
    const outline = pantOutline(1, 1);
    const shape = env.exportShape(outline, 1);
    assert.equal(shape.w, 201);
    assert.equal(shape.h, 301);
    assert.equal(shape.pad, 0.5);
    assert.equal(shape.miter, 4);
    // y flipped to point down, origin at the visible box's top-left.
    assert.deepEqual(Array.from(shape.rings[0]), [0.5, 0.5, 200.5, 0.5, 150.5, 300.5, 50.5, 300.5]);

    const items = [1, 2, 3].map(() => ({ key: 'S_LEFT_PANT', outline }));
    const job = JSON.parse(env.toJSON(env.buildNestJob(items, 1, 1)));
    assert.equal(Object.keys(job.shapes).length, 1);
    assert.equal(job.parts.length, 3);
    const result = await nest(job, { threads: 0, timeLimitMs: 300 });
    assertValidResult(job, result);
});

test('a Large Canvas outline (1/10 size) exports at its real size', function () {
    const env = makeExportEnv();
    const real = JSON.parse(env.toJSON(env.exportShape(pantOutline(1, 1), 1)));
    // Stroke reported scaled like everything else, or unscaled: both give the real pad.
    for (const strokeWidth of [0.1, 1]) {
        const big = JSON.parse(env.toJSON(env.exportShape(pantOutline(10, strokeWidth), 10)));
        assert.equal(big.w, real.w);
        assert.equal(big.h, real.h);
        assert.ok(Math.abs(big.pad - 0.5) < 1e-6, 'pad ' + big.pad + ' with strokeWidth ' + strokeWidth);
        big.rings[0].forEach((v, i) => assert.ok(Math.abs(v - real.rings[0][i]) < 0.01));
    }
});
