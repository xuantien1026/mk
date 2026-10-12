// Trace cut outlines into polygons for the nester (layout engine 2). Needs PT_PER_MM
// (config.jsx), SHEET_W, SHEET_H, PRODUCT_GAP (sheet_layout.jsx).
//
// A shape is exported in its own frame: origin at the top-left of the outline's
// visibleBounds (stroke included), x to the right, y DOWN, REAL pt — the same frame the
// layout engines place parts by. scale converts the document's units to real pt: 1 in a
// normal document, doc.scaleFactor (10) in a Large Canvas one.

var TRACE_STEP = 2 * PT_PER_MM; // max chord length (real) when flattening a curve

// One closed ring [x0, y0, x1, y1, ...] per subpath of a PathItem / CompoundPathItem /
// GroupItem, in document coordinates (y up). Curves are flattened into chords of at most
// step (document units); straight segments keep just their end points.
function outlineRings(item, step, rings) {
    if (!rings) rings = [];
    if (item.typename === 'PathItem') {
        rings.push(flattenPath(item, step));
    } else if (item.typename === 'CompoundPathItem') {
        for (var i = 0; i < item.pathItems.length; i++) rings.push(flattenPath(item.pathItems[i], step));
    } else if (item.typename === 'GroupItem') {
        for (var j = 0; j < item.pageItems.length; j++) outlineRings(item.pageItems[j], step, rings);
    }
    return rings;
}

function flattenPath(path, step) {
    var pts = path.pathPoints, n = pts.length, ring = [];
    for (var i = 0; i < n; i++) {
        var a = pts[i].anchor, c1 = pts[i].rightDirection;
        var b = pts[(i + 1) % n].anchor, c2 = pts[(i + 1) % n].leftDirection;
        ring.push(a[0], a[1]);
        if (i === n - 1 && !path.closed) break;
        var curved = c1[0] !== a[0] || c1[1] !== a[1] || c2[0] !== b[0] || c2[1] !== b[1];
        if (!curved) continue;
        var len = dist(a, c1) + dist(c1, c2) + dist(c2, b); // ≥ the curve's length
        var steps = Math.ceil(len / step);
        for (var k = 1; k < steps; k++) {
            var t = k / steps, u = 1 - t;
            var w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t;
            ring.push(w0 * a[0] + w1 * c1[0] + w2 * c2[0] + w3 * b[0],
                      w0 * a[1] + w1 * c1[1] + w2 * c2[1] + w3 * b[1]);
        }
    }
    return ring;
}

function dist(p, q) {
    var dx = p[0] - q[0], dy = p[1] - q[1];
    return Math.sqrt(dx * dx + dy * dy);
}

function round3(v) { return Math.round(v * 1000) / 1000; }

// The miter limit of an outline's stroke — the first path's, for a compound path or
// group — or null when there is no path.
function outlineMiterLimit(item) {
    if (item.typename === 'PathItem') return item.strokeMiterLimit;
    var children = item.typename === 'CompoundPathItem' ? item.pathItems
                 : item.typename === 'GroupItem' ? item.pageItems : [];
    for (var i = 0; i < children.length; i++) {
        var m = outlineMiterLimit(children[i]);
        if (m) return m;
    }
    return null;
}

// The nester's view of a cut outline: { w, h, pad, miter, rings } — w × h is the
// visible box (stroke and its pointed corners included), pad half the stroke width,
// miter its miter limit, rings in the shape frame described at the top. The nester
// rebuilds the printed stroke from pad and miter, so pointed corners only cost space
// where they actually are.
//
// pad is measured, not read from strokeWidth: in a Large Canvas document strokeWidth
// doesn't convert to real size reliably (it gave half the real stroke, so engine 2 left
// 3.5mm instead of 5mm). On a straight outermost edge the visible box sits exactly half
// a stroke beyond the geometry; elsewhere pointed corners push it further — so the
// smallest of the four margins is half the stroke (or, with no straight edge, a little
// more: never too little).
function exportShape(outline, scale) {
    var vb = outline.visibleBounds, gb = outline.geometricBounds;
    var rings = outlineRings(outline, TRACE_STEP / scale);
    for (var i = 0; i < rings.length; i++) {
        var r = rings[i];
        for (var j = 0; j < r.length; j += 2) {
            r[j]     = round3((r[j] - vb[0]) * scale);
            r[j + 1] = round3((vb[1] - r[j + 1]) * scale);
        }
    }
    var pad = Math.max(0, Math.min(gb[0] - vb[0], vb[1] - gb[1], vb[2] - gb[2], gb[3] - vb[3]) * scale);
    return { w: round3((vb[2] - vb[0]) * scale), h: round3((vb[1] - vb[3]) * scale), pad: round3(pad),
             miter: outlineMiterLimit(outline) || 4, rings: rings };
}

// The nester job for items [{ key, outline }] — one per part to print; parts with the
// same key share one shape, traced once from the first one's outline. See
// nester/index.js.
function buildNestJob(items, scale, timeLimit) {
    var shapes = {}, parts = [];
    for (var i = 0; i < items.length; i++) {
        var key = items[i].key;
        if (!shapes.hasOwnProperty(key)) shapes[key] = exportShape(items[i].outline, scale);
        parts.push({ shape: key });
    }
    return { sheet: { w: SHEET_W, h: SHEET_H }, gap: PRODUCT_GAP, rotations: [0, 180], timeLimit: timeLimit,
             shapes: shapes, parts: parts };
}
