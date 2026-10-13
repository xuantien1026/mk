// The no-fit polygon of two shapes, for drawing in Illustrator (tools/show_nfp.jsx).
//
// Job (pt, y down — see lib/export_shapes.jsx):
//   { nfp: { fixed: shape, moving: shape, rotFixed?, rotMoving?: 0 | 180 }, gap, tol?: mm }
// Result, every point in pt, y down, as [x0, y0, x1, y1, ...] rings:
//   fixed:  the fixed shape's prepared (grown) polygon, in its shape frame
//   moving: the moving shape's prepared polygon, in its shape frame
//   ref:    [x, y] the moving shape's reference point — the point the nester places it
//           by, its polygon's top-left — in its shape frame
//   nfp:    the rings of the NFP, in the fixed shape's frame — the moving shape overlaps
//           the fixed one exactly when its reference point lies inside them
// A shape frame is the one shapes are exported in: origin at the visible box's top-left.
const g = require('./geometry');

function nfpView(job) {
    const gap = g.ptToUnits(job.gap);
    const tol = Math.round((job.tol ?? 0.5) * g.UNITS_PER_MM);
    const A = g.prepareShape(job.nfp.fixed, { gap, rot: job.nfp.rotFixed || 0, tol });
    const B = g.prepareShape(job.nfp.moving, { gap, rot: job.nfp.rotMoving || 0, tol });
    // A prepared polygon is normalized: its frame's origin sits at (shiftX, shiftY).
    const toFrame = (s) => (path) => {
        const ring = [];
        for (const p of path) ring.push(g.unitsToPt(p.X - s.shiftX), g.unitsToPt(p.Y - s.shiftY));
        return ring;
    };
    return {
        fixed: [toFrame(A)(A.poly)],
        moving: [toFrame(B)(B.poly)],
        ref: [g.unitsToPt(-B.shiftX), g.unitsToPt(-B.shiftY)],
        nfp: g.noFitPolygon(A.poly, B.poly).map(toFrame(A))
    };
}

module.exports = { nfpView };
