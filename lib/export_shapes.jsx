// Trace Step-1 cut outlines into polygons for the nester (layout engine 2). Needs
// requireItem (utils.jsx), PT_PER_MM (config.jsx).
//
// A shape is exported in its own frame: origin at the top-left of the outline's
// visibleBounds (stroke included), x to the right, y DOWN, real pt — the same frame the
// layout engines place parts by.

var TRACE_STEP = 2 * PT_PER_MM; // max chord length when flattening a curve

// One closed ring [x0, y0, x1, y1, ...] per subpath of a PathItem / CompoundPathItem /
// GroupItem, in document coordinates (y up). Curves are flattened into chords of at most
// TRACE_STEP; straight segments keep just their end points.
function outlineRings(item, rings) {
    if (!rings) rings = [];
    if (item.typename === 'PathItem') {
        rings.push(flattenPath(item));
    } else if (item.typename === 'CompoundPathItem') {
        for (var i = 0; i < item.pathItems.length; i++) rings.push(flattenPath(item.pathItems[i]));
    } else if (item.typename === 'GroupItem') {
        for (var j = 0; j < item.pageItems.length; j++) outlineRings(item.pageItems[j], rings);
    }
    return rings;
}

function flattenPath(path) {
    var pts = path.pathPoints, n = pts.length, ring = [];
    for (var i = 0; i < n; i++) {
        var a = pts[i].anchor, c1 = pts[i].rightDirection;
        var b = pts[(i + 1) % n].anchor, c2 = pts[(i + 1) % n].leftDirection;
        ring.push(a[0], a[1]);
        if (i === n - 1 && !path.closed) break;
        var curved = c1[0] !== a[0] || c1[1] !== a[1] || c2[0] !== b[0] || c2[1] !== b[1];
        if (!curved) continue;
        var len = dist(a, c1) + dist(c1, c2) + dist(c2, b); // ≥ the curve's length
        var steps = Math.ceil(len / TRACE_STEP);
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

// The stroke of an outline — the first path's, for a compound path or group:
// { width, miter } (miter = Illustrator's miter limit), or null when there is no path.
function outlineStroke(item) {
    if (item.typename === 'PathItem') {
        return { width: item.stroked ? item.strokeWidth : 0, miter: item.strokeMiterLimit };
    }
    var children = item.typename === 'CompoundPathItem' ? item.pathItems
                 : item.typename === 'GroupItem' ? item.pageItems : [];
    for (var i = 0; i < children.length; i++) {
        var s = outlineStroke(children[i]);
        if (s) return s;
    }
    return null;
}

// The nester's view of the part {key} (e.g. "S_FRONT") in the Step-1 document:
// { w, h, pad, miter, rings } — w × h is the visible box (stroke and its pointed
// corners included), pad half the outline's stroke width, miter its miter limit, rings
// in the shape frame described at the top. The nester rebuilds the printed stroke from
// pad and miter, so pointed corners only cost space where they actually are.
function exportShape(doc, key) {
    var outline = requireItem(doc.pageItems, key + '_OUTLINE', doc.name);
    var vb = outline.visibleBounds;
    var rings = outlineRings(outline);
    for (var i = 0; i < rings.length; i++) {
        var r = rings[i];
        for (var j = 0; j < r.length; j += 2) {
            r[j]     = round3(r[j] - vb[0]);
            r[j + 1] = round3(vb[1] - r[j + 1]);
        }
    }
    var stroke = outlineStroke(outline) || { width: 0, miter: 4 };
    return { w: round3(vb[2] - vb[0]), h: round3(vb[1] - vb[3]), pad: round3(stroke.width / 2), miter: stroke.miter,
             rings: rings };
}

// The nester job for parts named by keys ({size}_{side}, one entry per part to print,
// repeats allowed) — see nester/index.js. Each distinct shape is traced once. Needs
// SHEET_W, SHEET_H, PRODUCT_GAP (sheet_layout.jsx).
function buildNestJob(doc, keys, timeLimit) {
    var shapes = {}, parts = [];
    for (var i = 0; i < keys.length; i++) {
        if (!shapes.hasOwnProperty(keys[i])) shapes[keys[i]] = exportShape(doc, keys[i]);
        parts.push({ shape: keys[i] });
    }
    return { sheet: { w: SHEET_W, h: SHEET_H }, gap: PRODUCT_GAP, rotations: [0, 180], timeLimit: timeLimit,
             shapes: shapes, parts: parts };
}
