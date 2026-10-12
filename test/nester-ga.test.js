const { test } = require('node:test');
const assert   = require('node:assert/strict');
const fs       = require('fs');
const os       = require('os');
const path     = require('path');
const { execFileSync } = require('child_process');
const g        = require('../nester/geometry');
const { nest } = require('../nester/index');
const { crossover, mutate, seeds, makeRandom } = require('../nester/ga');
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
