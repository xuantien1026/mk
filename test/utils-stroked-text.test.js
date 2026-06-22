const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { makeUtilsEnv, textFrame, groupItem, container } = require('./helpers/helper');

// Regression guard for the "SO loses its black border after nhay_size" bug.
// Illustrator's resize() collapses point-text character stroke weights to ~1/100,
// wiping the SO border; nhay_size now snapshots each stroked text frame's weight via
// collectStrokedTextFrames and restores it after the resize. These tests pin down
// exactly which frames get snapshotted and that the captured weight is correct.

test('captures a stroked text frame with its current weight', function () {
    const { collectStrokedTextFrames } = makeUtilsEnv();
    const so  = textFrame('SO', 9, 'CMYKColor');
    const out = collectStrokedTextFrames(container([so]));
    assert.equal(out.length, 1);
    assert.equal(out[0].frame, so);
    assert.equal(out[0].weight, 9);
});

test('skips text frames whose glyphs have no stroke', function () {
    const { collectStrokedTextFrames } = makeUtilsEnv();
    const ten = textFrame('TEN', 0, 'NoColor');
    assert.equal(collectStrokedTextFrames(container([ten])).length, 0);
});

test('skips non-text page items', function () {
    const { collectStrokedTextFrames } = makeUtilsEnv();
    const path = { name: 'border', typename: 'PathItem' };
    assert.equal(collectStrokedTextFrames(container([path])).length, 0);
});

test('recurses into nested groups', function () {
    const { collectStrokedTextFrames } = makeUtilsEnv();
    const so   = textFrame('SO', 7, 'CMYKColor');
    const deep = groupItem('THAN_SAU', [groupItem('inner', [so])]);
    const out  = collectStrokedTextFrames(container([deep]));
    assert.equal(out.length, 1);
    assert.equal(out[0].frame, so);
    assert.equal(out[0].weight, 7);
});

test('collects only the stroked frames from a mixed container', function () {
    const { collectStrokedTextFrames } = makeUtilsEnv();
    const so   = textFrame('SO', 9, 'CMYKColor');
    const ten  = textFrame('TEN', 0, 'NoColor');
    const path = { name: 'p', typename: 'PathItem' };
    const out  = collectStrokedTextFrames(container([so, ten, path]));
    assert.equal(out.length, 1);
    assert.equal(out[0].frame, so);
});

test('returns empty when the container has no pageItems', function () {
    const { collectStrokedTextFrames } = makeUtilsEnv();
    assert.equal(collectStrokedTextFrames({}).length, 0);
});

test('does not throw when a character attribute lookup fails', function () {
    const { collectStrokedTextFrames } = makeUtilsEnv();
    const broken = { name: 'SO', typename: 'TextFrame', get textRange() { throw new Error('no chars'); } };
    assert.doesNotThrow(() => collectStrokedTextFrames(container([broken])));
    assert.equal(collectStrokedTextFrames(container([broken])).length, 0);
});

test('restore math scales the snapshotted weight by the vertical scale', function () {
    // Mirrors what nhay_size applies after resize: weight * (scaleY / 100).
    const { collectStrokedTextFrames } = makeUtilsEnv();
    const so   = textFrame('SO', 9, 'CMYKColor');
    const [snap] = collectStrokedTextFrames(container([so]));
    const scaleY = 95;
    assert.ok(Math.abs(snap.weight * (scaleY / 100) - 8.55) < 1e-9);
});
