// Polygon geometry for the nester (layout engine 2), on top of Clipper.
//
// Clipper works on integers, so every coordinate here is in UNITS of 0.01mm. Polygons
// are arrays of {X, Y}; y grows DOWN (the sheet's top-left is the origin), matching the
// frame lib/export_shapes.jsx exports shapes in.
const ClipperLib = require('clipper-lib');

const PT_PER_MM = 2.83465;
const UNITS_PER_MM = 100;
const UNITS_PER_PT = UNITS_PER_MM / PT_PER_MM;

const ptToUnits = (pt) => Math.round(pt * UNITS_PER_PT);
const unitsToPt = (u) => u / UNITS_PER_PT;

function area(path) {
    return ClipperLib.Clipper.Area(path);
}

function bounds(paths) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const path of paths) {
        for (const p of path) {
            if (p.X < minX) minX = p.X;
            if (p.Y < minY) minY = p.Y;
            if (p.X > maxX) maxX = p.X;
            if (p.Y > maxY) maxY = p.Y;
        }
    }
    return { minX, minY, maxX, maxY };
}

function translate(path, dx, dy) {
    return path.map((p) => ({ X: p.X + dx, Y: p.Y + dy }));
}

// Positive (Clipper) orientation, so unions of solids never cancel out.
function positive(path) {
    return ClipperLib.Clipper.Orientation(path) ? path : path.slice().reverse();
}

function clip(type, subject, clipPaths) {
    const c = new ClipperLib.Clipper();
    c.AddPaths(subject, ClipperLib.PolyType.ptSubject, true);
    if (clipPaths) c.AddPaths(clipPaths, ClipperLib.PolyType.ptClip, true);
    const out = new ClipperLib.Paths();
    c.Execute(type, out, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
    return out;
}

const union = (paths) => clip(ClipperLib.ClipType.ctUnion, paths);
const difference = (subject, clipPaths) => clip(ClipperLib.ClipType.ctDifference, subject, clipPaths);
const intersection = (subject, clipPaths) => clip(ClipperLib.ClipType.ctIntersection, subject, clipPaths);

// Ramer–Douglas–Peucker on a closed ring: drops vertices while staying within tol of
// the original outline.
function simplifyRing(path, tol) {
    if (path.length <= 4) return path;
    // Split the ring at its two mutually farthest-ish points (first vertex and the one
    // farthest from it) and simplify each half as an open polyline.
    let far = 0, best = -1;
    for (let i = 1; i < path.length; i++) {
        const d = (path[i].X - path[0].X) ** 2 + (path[i].Y - path[0].Y) ** 2;
        if (d > best) { best = d; far = i; }
    }
    const a = rdp(path.slice(0, far + 1), tol);
    const b = rdp(path.slice(far).concat([path[0]]), tol);
    return a.slice(0, -1).concat(b.slice(0, -1));
}

function rdp(pts, tol) {
    const keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
        const [s, e] = stack.pop();
        const ax = pts[s].X, ay = pts[s].Y, dx = pts[e].X - ax, dy = pts[e].Y - ay;
        const len = Math.hypot(dx, dy);
        let idx = -1, maxD = tol;
        for (let i = s + 1; i < e; i++) {
            const d = len === 0
                ? Math.hypot(pts[i].X - ax, pts[i].Y - ay)
                : Math.abs(dy * (pts[i].X - ax) - dx * (pts[i].Y - ay)) / len;
            if (d > maxD) { maxD = d; idx = i; }
        }
        if (idx >= 0) { keep[idx] = 1; stack.push([s, idx], [idx, e]); }
    }
    return pts.filter((_, i) => keep[i]);
}

// Illustrator's default stroke miter limit.
const DEFAULT_MITER = 10;
// Max distance (units) a rounded corner's chords fall inside the true arc.
const ARC_TOLERANCE = 10;

// Grow paths by delta. 'miter' joins model an Illustrator stroke (pointed corners up to
// miterLimit × delta, squared off beyond — Illustrator bevels them, so this is never
// smaller); 'round' joins keep exactly delta from the outline everywhere (less up to
// ARC_TOLERANCE between a corner's chords).
function offset(paths, delta, join = 'miter', miterLimit = 2) {
    const co = new ClipperLib.ClipperOffset(miterLimit, ARC_TOLERANCE);
    const jt = join === 'round' ? ClipperLib.JoinType.jtRound : ClipperLib.JoinType.jtMiter;
    co.AddPaths(paths, jt, ClipperLib.EndType.etClosedPolygon);
    const out = new ClipperLib.Paths();
    co.Execute(out, delta);
    return out;
}

// The printed ink of an outline: the path stroked pad wide on each side with pointed
// (miter) corners, the way Illustrator draws it.
function inkOutline(paths, pad, miter = DEFAULT_MITER) {
    return pad > 0 ? offset(paths, pad, 'miter', miter) : paths;
}

// Turn an exported shape ({ w, h, pad, miter, rings } in pt, see
// lib/export_shapes.jsx) into the polygon the nester places, for rotation rot (0 or
// 180, about the visible box's center). The polygon is the outline's printed ink grown
// by half the gap, so two grown polygons that merely touch keep their ink gap apart.
//
// The ink is built from the full outline first — simplifying before could drop a sharp
// corner and with it the stroke's pointed tip there. The ink is then simplified by up
// to tol (units), which is added to the growth so it never eats into the gap. The growth
// uses miter joins (squared beyond 2×): never closer than a true distance offset, and
// without the many extra vertices round joins would cost every NFP.
//
// Returns { poly, w, h, shiftX, shiftY, area }: poly normalized so its bounding box
// starts at (0, 0), w × h that box, and (shiftX, shiftY) where the shape frame's
// origin (the visible box's top-left) lands in the normalized polygon's frame.
function prepareShape(shape, { gap, rot, tol }) {
    const W = ptToUnits(shape.w), H = ptToUnits(shape.h);
    let rings = shape.rings.map((ring) => {
        const path = [];
        for (let i = 0; i < ring.length; i += 2) {
            const x = ptToUnits(ring[i]), y = ptToUnits(ring[i + 1]);
            path.push(rot === 180 ? { X: W - x, Y: H - y } : { X: x, Y: y });
        }
        return positive(path);
    });
    // The outer boundary only: the nester never places a part inside another's hole.
    rings = union(rings).filter((p) => area(p) > 0);
    if (!rings.length) throw new Error('Empty outline');
    const largest = (paths) => paths.reduce((a, b) => (Math.abs(area(b)) > Math.abs(area(a)) ? b : a));
    const ink = positive(largest(inkOutline([largest(rings)], ptToUnits(shape.pad), shape.miter)));
    const grown = offset([positive(simplifyRing(ink, tol))], gap / 2 + tol);
    const poly = positive(grown.reduce((a, b) => (Math.abs(area(b)) > Math.abs(area(a)) ? b : a)));
    const b = bounds([poly]);
    return {
        poly: translate(poly, -b.minX, -b.minY),
        w: b.maxX - b.minX,
        h: b.maxY - b.minY,
        shiftX: -b.minX,
        shiftY: -b.minY,
        area: area(poly)
    };
}

// No-fit polygon: every position of B's origin at which B overlaps A (A at the origin).
// Holes in the result are real — B fits there inside a dent of A.
//
// Clipper's Minkowski difference only sweeps the two boundaries, which misses the
// positions where one polygon lies wholly inside the other; adding a copy of A swept
// by one point of B (and of -B by one point of A) fills those in.
function noFitPolygon(A, B) {
    const swept = ClipperLib.Clipper.MinkowskiDiff(B, A); // {a - b}
    const b0 = B[0], a0 = A[0];
    const negB = B.map((p) => ({ X: a0.X - p.X, Y: a0.Y - p.Y }));
    return union(swept.concat([translate(A, -b0.X, -b0.Y), positive(negB)]));
}

module.exports = {
    ClipperLib, PT_PER_MM, UNITS_PER_MM, UNITS_PER_PT, ptToUnits, unitsToPt,
    area, bounds, translate, positive, union, difference, intersection, offset, inkOutline,
    simplifyRing, prepareShape, noFitPolygon
};
