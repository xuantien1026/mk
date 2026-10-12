// Bottom-left placement for the nester: put parts, in a given order and rotation, onto
// fixed-size sheets using no-fit polygons. One call = one candidate layout; the genetic
// algorithm (ga.js) searches over orders and rotations.
const g = require('./geometry');

// Everything placement needs about a job, computed once: each (shape, rotation) as a
// prepared polygon, and a shared NFP cache.
//   job: { sheet: { w, h }, gap, shapes: { key: shape }, parts: [{ shape }] } — pt
//   opts.tol: simplification tolerance in mm (default 0.5)
function createContext(job, opts = {}) {
    const gap = g.ptToUnits(job.gap);
    const tol = Math.round((opts.tol ?? 0.5) * g.UNITS_PER_MM);
    const rotations = job.rotations || [0, 180];
    const shapes = {};
    for (const key of Object.keys(job.shapes)) {
        for (const rot of rotations) {
            shapes[key + '@' + rot] = g.prepareShape(job.shapes[key], { gap, rot, tol });
        }
    }
    return {
        job, gap, rotations, shapes,
        // The grown sheet: the real sheet plus half a gap on each side, so a grown part
        // touching its edge keeps the real cut line exactly on the real edge.
        sheetW: g.ptToUnits(job.sheet.w) + gap,
        sheetH: g.ptToUnits(job.sheet.h) + gap,
        nfpCache: new Map()
    };
}

function nfpOf(ctx, fixedKey, movingKey) {
    const k = fixedKey + '|' + movingKey;
    let nfp = ctx.nfpCache.get(k);
    if (!nfp) {
        nfp = g.noFitPolygon(ctx.shapes[fixedKey].poly, ctx.shapes[movingKey].poly);
        ctx.nfpCache.set(k, nfp);
    }
    return nfp;
}

function newSheet(index) {
    // forbidden: per moving shape key, the union of the NFPs of every part placed so
    // far (`upto` of them) — extended lazily when that shape is next tried here.
    return { index, placed: [], forbidden: new Map(), usedArea: 0, maxY: 0 };
}

// The top-most (then left-most) position for shape key on sheet, or null.
function findPosition(ctx, sheet, key) {
    const s = ctx.shapes[key];
    const maxX = ctx.sheetW - s.w, maxY = ctx.sheetH - s.h;
    if (maxX < 0 || maxY < 0) return null;
    if (sheet.placed.length === 0) return { x: 0, y: 0 };

    let f = sheet.forbidden.get(key);
    if (!f) { f = { paths: [], upto: 0 }; sheet.forbidden.set(key, f); }
    if (f.upto < sheet.placed.length) {
        const add = [];
        for (let i = f.upto; i < sheet.placed.length; i++) {
            const p = sheet.placed[i];
            for (const path of nfpOf(ctx, p.key, key)) add.push(g.translate(path, p.x, p.y));
        }
        f.paths = g.union(f.paths.concat(add));
        f.upto = sheet.placed.length;
    }

    // Inner-fit rectangle: every origin keeping the part inside the sheet. One unit of
    // slack on each side so an exact fit isn't lost as a zero-width sliver.
    const ifp = [[{ X: -1, Y: -1 }, { X: maxX + 1, Y: -1 }, { X: maxX + 1, Y: maxY + 1 }, { X: -1, Y: maxY + 1 }]];
    const free = g.difference(ifp, f.paths);
    let best = null;
    for (const path of free) {
        for (const p of path) {
            if (!best || p.Y < best.y || (p.Y === best.y && p.X < best.x)) best = { x: p.X, y: p.Y };
        }
    }
    if (best) {
        best.x = Math.min(Math.max(best.x, 0), maxX);
        best.y = Math.min(Math.max(best.y, 0), maxY);
    }
    return best;
}

// Place genes [{ part, rot }] in order. Each part goes onto the earliest sheet it fits
// on; a new sheet is opened only when none has room.
// Returns { sheets, placements: [{ part, sheet, x, y, rot }] (units, grown frame),
// fitness } — fitness = sheets used, plus the fraction of the last sheet's length used
// (lower is better).
function placeAll(ctx, genes) {
    const sheets = [];
    const placements = [];
    const sheetArea = ctx.sheetW * ctx.sheetH;
    for (const gene of genes) {
        const key = ctx.job.parts[gene.part].shape + '@' + gene.rot;
        const s = ctx.shapes[key];
        let pos = null, sheet = null;
        for (const sh of sheets) {
            if (sh.usedArea + s.area > sheetArea) continue; // can't possibly fit
            pos = findPosition(ctx, sh, key);
            if (pos) { sheet = sh; break; }
        }
        if (!pos) {
            sheet = newSheet(sheets.length);
            pos = findPosition(ctx, sheet, key);
            if (!pos) throw new Error('Part ' + ctx.job.parts[gene.part].shape + ' does not fit on a sheet');
            sheets.push(sheet);
        }
        sheet.placed.push({ key, x: pos.x, y: pos.y });
        sheet.usedArea += s.area;
        sheet.maxY = Math.max(sheet.maxY, pos.y + s.h);
        placements.push({ part: gene.part, sheet: sheet.index, x: pos.x, y: pos.y, rot: gene.rot });
    }
    const last = sheets[sheets.length - 1];
    const fitness = sheets.length === 0 ? 0 : sheets.length - 1 + last.maxY / ctx.sheetH;
    return { sheets: sheets.length, placements, fitness };
}

// Convert placements to what Illustrator needs, in pt: the top-left of each part's
// visible box (stroke included) relative to the real sheet's top-left, y down, and the
// rotation about the box's center applied first.
function toResult(ctx, layout) {
    const half = ctx.gap / 2;
    return {
        sheets: layout.sheets,
        fitness: layout.fitness,
        placements: layout.placements
            .slice()
            .sort((a, b) => a.part - b.part)
            .map((p) => {
                const s = ctx.shapes[ctx.job.parts[p.part].shape + '@' + p.rot];
                return {
                    part: p.part,
                    sheet: p.sheet,
                    x: g.unitsToPt(p.x + s.shiftX - half),
                    y: g.unitsToPt(p.y + s.shiftY - half),
                    rot: p.rot
                };
            })
    };
}

module.exports = { createContext, placeAll, toResult, findPosition };
