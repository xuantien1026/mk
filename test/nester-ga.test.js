const { test } = require('node:test');
const assert   = require('node:assert/strict');
const fs       = require('fs');
const os       = require('os');
const path     = require('path');
const { execFileSync } = require('child_process');
const g        = require('../nester/geometry');
const { nest } = require('../nester/index');
const { crossover, mutate, seeds, makeRandom, search } = require('../nester/ga');
const { partnersOf } = require('../nester/pairs');
const { createContext, placeAll } = require('../nester/place');
const { CM, pant, shirt, sleeve, assertValidResult } = require('./helpers/shapes');

const GAP = 3 * g.PT_PER_MM;

function mixJob(orders) {
    const shapes = { F: shirt(62, 78), B: shirt(62, 80), P1: pant(32, 22, 105), P2: pant(30, 20, 100),
                     L: sleeve(42, 58), R: sleeve(42, 58) };
    const parts = [];
    for (let n = 0; n < orders; n++) for (const s of ['F', 'B', 'P1', 'P2', 'P1', 'P2', 'L', 'R']) parts.push({ shape: s });
    return { sheet: { w: 159 * CM, h: 500 * CM }, gap: GAP, shapes, parts };
}

const partsOf = (genes) => genes.map((x) => x.part).sort((a, b) => a - b);

test('crossover and mutation keep every part exactly once', function () {
    const job = mixJob(3);
    const random = makeRandom(7);
    const [a, b] = seeds(job.parts, (i) => i, [0, 180]);
    const all = job.parts.map((_, i) => i);
    for (let k = 0; k < 50; k++) {
        const child = mutate(crossover(a, b, random), job.parts, 0.3, [0, 180], random);
        assert.deepEqual(partsOf(child), all);
        assert.ok(child.every((x) => x.rot === 0 || x.rot === 180));
    }
});

// Every order's front (F) and back (B) as a pair.
function pairedJob(orders) {
    const job = mixJob(orders);
    job.pairs = [];
    for (let n = 0; n < orders; n++) job.pairs.push([8 * n, 8 * n + 1]);
    return job;
}

function assertPairsAdjacent(job, genes) {
    const at = new Map(genes.map((x, i) => [x.part, i]));
    for (const [a, b] of job.pairs) assert.equal(Math.abs(at.get(a) - at.get(b)), 1, 'pair ' + a + '/' + b);
}

test('seeds, crossover and mutation keep each pair one right after the other', function () {
    const job = pairedJob(4);
    const partner = partnersOf(job);
    const random = makeRandom(11);
    const all = job.parts.map((_, i) => i);
    const initial = seeds(job.parts, (i) => i, [0, 180], partner);
    for (const genes of initial) assertPairsAdjacent(job, genes);
    let first = 0;
    for (let k = 0; k < 200; k++) {
        const [a, b] = [initial[k % 3], initial[(k + 1) % 3]];
        const child = mutate(crossover(a, b, random, partner), job.parts, 0.3, [0, 180], random, partner);
        assert.deepEqual(partsOf(child), all);
        assertPairsAdjacent(job, child);
        if (child.findIndex((x) => x.part === 0) < child.findIndex((x) => x.part === 1)) first++;
    }
    assert.ok(first > 0 && first < 200, 'either part of a pair can go first');
});

test('the search keeps pairs together and the second never goes on an earlier sheet', async function () {
    const job = pairedJob(6);
    const ctx = createContext(job);
    const evaluate = async (list) => list.map((genes) => placeAll(ctx, genes));
    const areaOf = (i) => ctx.shapes[job.parts[i].shape + '@0'].area;
    const best = await search(job, { evaluate, areaOf, timeLimitMs: 1000, seed: 3 });
    assertPairsAdjacent(job, best.genes);
    const sheetOf = new Map(best.placements.map((p) => [p.part, p.sheet]));
    for (let i = 1; i < best.genes.length; i++) {
        const prev = best.genes[i - 1].part, cur = best.genes[i].part;
        if (ctx.partner.get(cur) === prev) assert.ok(sheetOf.get(cur) >= sheetOf.get(prev));
    }
});

test('a pair’s second part skips earlier sheets with room', function () {
    // A small part placed second would drop into sheet 0's leftover space; as the
    // partner of a part on sheet 1 it must stay on sheet 1 or later.
    const job = { sheet: { w: 100 * CM, h: 100 * CM }, gap: GAP,
                  shapes: { BIG: sleeve(95, 70), SMALL: sleeve(20, 20) },
                  parts: [{ shape: 'BIG' }, { shape: 'BIG' }, { shape: 'SMALL' }] };
    const genes = [0, 1, 2].map((part) => ({ part, rot: 0 }));
    assert.equal(placeAll(createContext(job), genes).placements[2].sheet, 0);
    job.pairs = [[1, 2]];
    const layout = placeAll(createContext(job), genes);
    assert.equal(layout.placements[1].sheet, 1);
    assert.equal(layout.placements[2].sheet, 1);
});

test('upright-only jobs never get turned', function () {
    const job = mixJob(1);
    const random = makeRandom(3);
    const genes = seeds(job.parts, (i) => i, [0])[1];
    assert.ok(mutate(genes, job.parts, 1, [0], random).every((x) => x.rot === 0));
});

test('the search returns a valid layout no worse than its best seed', async function () {
    const job = mixJob(6);
    const ctx = createContext(job);
    const areaOf = (i) => ctx.shapes[job.parts[i].shape + '@0'].area;
    const seedBest = Math.min(...seeds(job.parts, areaOf, [0, 180]).map((genes) => placeAll(ctx, genes).fitness));

    const progress = [];
    const result = await nest(job, { threads: 0, timeLimitMs: 1500, seed: 5, onProgress: (p) => progress.push(p) });
    assertValidResult(job, result);
    assert.equal(result.placements.length, job.parts.length);
    assert.deepEqual(result.placements.map((p) => p.part), job.parts.map((_, i) => i), 'sorted by part');
    assert.ok(result.fitness <= seedBest + 1e-9);
    assert.ok(progress.length >= 2, 'reports progress every generation');
});

test('worker threads give the same kind of result', async function () {
    const job = mixJob(4);
    const result = await nest(job, { threads: 2, timeLimitMs: 1500 });
    assertValidResult(job, result);
    assert.equal(result.placements.length, job.parts.length);
});

test('the CLI writes progress.json and result.json, or error.txt', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mk-nest-'));
    const cli = path.join(__dirname, '../nester/cli.js');
    const job = Object.assign(mixJob(2), { timeLimit: 1 });
    fs.writeFileSync(path.join(dir, 'job.json'), JSON.stringify(job));
    execFileSync(process.execPath, [cli, path.join(dir, 'job.json'), dir]);
    const result = JSON.parse(fs.readFileSync(path.join(dir, 'result.json'), 'utf8'));
    assertValidResult(job, result);
    assert.ok(fs.existsSync(path.join(dir, 'progress.json')));

    fs.writeFileSync(path.join(dir, 'bad.json'), '{ not json');
    assert.throws(() => execFileSync(process.execPath, [cli, path.join(dir, 'bad.json'), dir], { stdio: 'ignore' }));
    assert.ok(fs.existsSync(path.join(dir, 'error.txt')));
    fs.rmSync(dir, { recursive: true, force: true });
});

// Illustrator (ExtendScript) opens files without delete-sharing, so a rename onto
// progress.json fails with EPERM while it is reading it. That must not kill the run.
test('the CLI survives progress.json being held open by a reader', { skip: process.platform !== 'win32' }, async function () {
    const { spawn } = require('child_process');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mk-nest-'));
    const progress = path.join(dir, 'progress.json');
    fs.writeFileSync(progress, '{}');
    fs.writeFileSync(path.join(dir, 'job.json'), JSON.stringify(Object.assign(mixJob(3), { timeLimit: 2 })));

    const locked = path.join(dir, 'locked');
    const holder = spawn('powershell', ['-NoProfile', '-Command',
        `$f = [System.IO.File]::Open('${progress}', 'Open', 'Read', 'ReadWrite'); `
        + `New-Item '${locked}' | Out-Null; Start-Sleep 3; $f.Close()`]);
    while (!fs.existsSync(locked)) await new Promise((r) => setTimeout(r, 50));

    execFileSync(process.execPath, [path.join(__dirname, '../nester/cli.js'), path.join(dir, 'job.json'), dir]);
    assert.ok(fs.existsSync(path.join(dir, 'result.json')), 'result written');
    assert.ok(!fs.existsSync(path.join(dir, 'error.txt')), 'no error');
    await new Promise((r) => holder.on('exit', r));
    fs.rmSync(dir, { recursive: true, force: true });
});
