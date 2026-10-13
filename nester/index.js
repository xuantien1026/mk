// Layout engine 2: nest parts by their real outlines (no-fit polygons + bottom-left
// placement), searching part order and 0°/180° rotation with a genetic algorithm.
//
// Job (pt, y down — written by Illustrator, see lib/export_shapes.jsx):
//   { sheet: { w, h }, gap, rotations?: [0, 180], timeLimit?: seconds,
//     shapes: { key: { w, h, pad, rings } }, parts: [{ shape: key }],
//     pairs?: [[a, b], ...] — parts placed one right after the other,
//     stages?: [stage, ...] — one per part, placed lowest stage first, see pairs.js }
// Result: { sheets, fitness, evaluations (layouts tried), placements: [{ part, sheet, x, y, rot }] } — (x, y) is the
// top-left of the part's visible box on its sheet after turning it rot° about the box's
// center.
const { createContext, placeAll, toResult } = require('./place');
const { search } = require('./ga');
const { createPool } = require('./pool');

async function nest(job, opts = {}) {
    const ctx = createContext(job, opts);
    const areaOf = (i) => ctx.shapes[job.parts[i].shape + '@0'].area;
    const threads = opts.threads ?? undefined;
    const pool = threads === 0 ? null : createPool(job, { tol: opts.tol }, threads);
    const evaluate = pool ? pool.evaluate : async (list) => list.map((genes) => placeAll(ctx, genes));
    try {
        const best = await search(job, {
            evaluate, areaOf,
            timeLimitMs: opts.timeLimitMs ?? (job.timeLimit ?? 60) * 1000,
            seed: opts.seed ?? 1,
            patience: opts.patience,
            onProgress: opts.onProgress
        });
        return Object.assign(toResult(ctx, best), { evaluations: best.evaluations });
    } finally {
        if (pool) await pool.close();
    }
}

module.exports = { nest };
