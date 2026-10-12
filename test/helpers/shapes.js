// Garment-like test shapes in the format lib/export_shapes.jsx exports ({ w, h, pad,
// rings } in pt, y down, origin at the visible box's top-left), and a checker for nester
// results that works on the real outlines rather than the nester's own polygons.
const g = require('../../nester/geometry');

const CM = 10 * g.PT_PER_MM;
const STROKE = 1; // pt

// pts: [[x, y], ...] in cm → a shape with a STROKE-wide outline.
function shape(pts) {
    const pad = STROKE / 2;
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const ring = [];
    for (const [x, y] of pts) ring.push((x - minX) * CM + pad, (y - minY) * CM + pad);
    return { w: (Math.max(...xs) - minX) * CM + 2 * pad, h: (Math.max(...ys) - minY) * CM + 2 * pad, pad, rings: [ring] };
}

// A pant piece: wide waist, narrow hem, both sides tapering equally.
const pant = (top, bottom, h) => shape([[0, 0], [top, 0], [(top + bottom) / 2, h], [(top - bottom) / 2, h]]);

// A shirt front/back: sloped shoulders, a neckline, armholes cut in.
const shirt = (w, h) => shape([[0, 12], [0.32 * w, 0], [0.4 * w, 0], [0.5 * w, 9], [0.6 * w, 0], [0.68 * w, 0],
                              [w, 12], [w - 7, 30], [w - 7, h], [7, h], [7, 30]]);

// A sleeve: curved cap on top, straight cuff at the bottom.
const sleeve = (w, h) => shape([[0, h], [0.1 * w, 0.45 * h], [0.3 * w, 0.12 * h], [0.5 * w, 0], [0.7 * w, 0.12 * h],
                               [0.9 * w, 0.45 * h], [w, h]]);

// The real cut outline of a placed part, in units, on its sheet.
function placedOutline(shp, pl) {
    const W = g.ptToUnits(shp.w), H = g.ptToUnits(shp.h);
    const ox = g.ptToUnits(pl.x), oy = g.ptToUnits(pl.y);
    return g.positive(shp.rings[0].reduce((path, v, i, r) => {
        if (i % 2) return path;
        let x = g.ptToUnits(r[i]), y = g.ptToUnits(r[i + 1]);
        if (pl.rot === 180) { x = W - x; y = H - y; }
        path.push({ X: x + ox, Y: y + oy });
        return path;
    }, []));
}

// Throws unless every part is inside its sheet (visible box, stroke included) and the
// printed ink (stroke, pointed corners included) of every two parts on a sheet is at
// least gap − slack apart.
function assertValidResult(job, result, slackMm = 0.05) {
    const slack = slackMm * g.UNITS_PER_MM;
    const W = g.ptToUnits(job.sheet.w), H = g.ptToUnits(job.sheet.h);
    const bySheet = new Map();
    for (const pl of result.placements) {
        const shp = job.shapes[job.parts[pl.part].shape];
        const x = g.ptToUnits(pl.x), y = g.ptToUnits(pl.y);
        if (x < -slack || y < -slack || x + g.ptToUnits(shp.w) > W + slack || y + g.ptToUnits(shp.h) > H + slack) {
            throw new Error('part ' + pl.part + ' leaves sheet ' + pl.sheet + ' at ' + JSON.stringify(pl));
        }
        // Ink grown by half the gap minus slack: grown outlines must not overlap.
        const ink = g.inkOutline([placedOutline(shp, pl)], g.ptToUnits(shp.pad), shp.miter);
        const grown = g.offset(ink, g.ptToUnits(job.gap) / 2 - slack, 'round');
        if (!bySheet.has(pl.sheet)) bySheet.set(pl.sheet, []);
        bySheet.get(pl.sheet).push({ pl, grown });
    }
    for (const list of bySheet.values()) {
        for (let i = 0; i < list.length; i++) {
            for (let j = i + 1; j < list.length; j++) {
                const overlap = g.intersection(list[i].grown, list[j].grown);
                const a = overlap.reduce((s, p) => s + Math.abs(g.area(p)), 0);
                if (a > 0) throw new Error('parts ' + list[i].pl.part + ' and ' + list[j].pl.part + ' closer than the gap');
            }
        }
    }
}

module.exports = { CM, shape, pant, shirt, sleeve, assertValidResult };
