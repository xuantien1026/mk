#!/usr/bin/env node
// node nester/cli.js <job.json> <outDir>
//
// How Illustrator runs the nester: it writes job.json, starts this, then polls outDir.
// While running, outDir/progress.json holds the best layout so far ({ generation,
// evaluations, sheets, fitness, elapsedMs }); at the end outDir/result.json holds the
// result, or outDir/error.txt the error. Files are written whole (temp file + rename),
// so a poller never reads half a file.
//
// On Windows a rename onto a file fails (EPERM) while someone has it open — Illustrator
// reading progress.json at that moment, or an antivirus scan. So progress updates are
// best effort (the next generation writes a fresh one), and the final files retry.
const fs = require('fs');
const path = require('path');
const { nest } = require('./index');
const { nfpView } = require('./nfp_view');

const LOCKED = new Set(['EPERM', 'EBUSY', 'EACCES']);

function sleep(ms) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function writeAtomic(file, text, retries = 0) {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, text);
    for (let attempt = 0; ; attempt++) {
        try {
            fs.renameSync(tmp, file);
            return;
        } catch (e) {
            if (!LOCKED.has(e.code) || attempt >= retries) throw e;
            sleep(100);
        }
    }
}

function writeProgress(file, text) {
    try {
        writeAtomic(file, text);
    } catch (e) {
        if (!LOCKED.has(e.code)) throw e; // being read right now — skip this update
    }
}

async function main() {
    const [jobFile, outDir] = process.argv.slice(2);
    if (!jobFile || !outDir) throw new Error('usage: cli.js <job.json> <outDir>');
    const job = JSON.parse(fs.readFileSync(jobFile, 'utf8'));
    // A job with nfp asks for one no-fit polygon to draw (tools/show_nfp.jsx), not a nest.
    const result = job.nfp ? nfpView(job) : await nest(job, {
        onProgress: ({ generation, evaluations, best, elapsedMs }) => {
            writeProgress(path.join(outDir, 'progress.json'), JSON.stringify({
                generation, evaluations, sheets: best.sheets, fitness: best.fitness, elapsedMs
            }));
        }
    });
    writeAtomic(path.join(outDir, 'result.json'), JSON.stringify(result), 50);
}

main().catch((e) => {
    const outDir = process.argv[3];
    const text = (e && e.stack) || String(e);
    if (outDir) {
        try { writeAtomic(path.join(outDir, 'error.txt'), text, 50); } catch (_) { /* nowhere to report */ }
    }
    console.error(text);
    process.exit(1);
});
