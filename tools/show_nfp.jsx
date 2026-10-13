#target illustrator
#include "../lib/config.jsx"
#include "../lib/sheet_layout.jsx"
#include "../lib/json.jsx"
#include "../lib/export_shapes.jsx"
#include "../lib/nester_bridge.jsx"

// Engine 2 debugging — draw the no-fit polygon (NFP) of two shapes, exactly as the
// nester computes it (nester/nfp_view.js).
//
// Select two parts (the part groups, or their _OUTLINE paths) and run. Each part's cut
// line is found by name, {name}_OUTLINE, like the production scripts. The bottom one of
// the two stays fixed; the top one is the moving shape. On a layer "NFP" it draws:
//   - red fill:      the NFP, laid over the fixed shape — wherever the moving shape's
//                    reference point falls inside it, the two shapes are closer than the
//                    gap (they overlap, grown)
//   - grey / blue:   each shape's polygon as the nester sees it (printed stroke grown by
//                    half the gap, simplified) — grey the fixed one, blue the moving one
//   - small dots:    every vertex of those polygons and of the NFP, in groups named with
//                    their count (hide one in the Layers panel to see the rest)
//   - blue marker:   the moving shape's reference point — the point the nester places
//                    it by, its polygon's top-left (the blue outline's corner)
// So: the shapes keep the gap exactly when the dot is outside the red, and touch when it
// is on the red's edge.
//
// The moving part is wrapped, in place, in a group NFP_MOVING with its blue outline,
// points and marker, so dragging it drags them too: drag the marker around the red to
// check positions. Running again (select the wrapper and the fixed part) unwraps it
// first; running with nothing selected unwraps it and deletes every NFP drawing — do
// that before saving a production file.

var ROOT = new File($.fileName).parent.parent.fsName;
var LAYER_NAME = 'NFP';
var WRAPPER_NAME = 'NFP_MOVING';

function rgb(r, g, b) {
    var c = new RGBColor();
    c.red = r; c.green = g; c.blue = b;
    return c;
}

// Options dialog; returns { gapMm, rotMoving, swap } or null when cancelled.
function askOptions() {
    var w = new Window('dialog', 'Vẽ NFP');
    w.alignChildren = 'left';
    var g1 = w.add('group');
    g1.add('statictext', undefined, 'Khoảng cách (mm):');
    var gap = g1.add('edittext', undefined, String(Math.round(PRODUCT_GAP / PT_PER_MM * 100) / 100));
    gap.characters = 6;
    var g2 = w.add('group');
    g2.add('statictext', undefined, 'Xoay hình di chuyển:');
    var rot = g2.add('dropdownlist', undefined, ['0°', '180°']);
    rot.selection = 0;
    var swap = w.add('checkbox', undefined, 'Đổi vai (hình trên cùng cố định)');
    var btns = w.add('group');
    btns.add('button', undefined, 'OK', { name: 'ok' });
    btns.add('button', undefined, 'Hủy', { name: 'cancel' });
    if (w.show() !== 1) return null;
    var gapMm = parseFloat(gap.text.replace(',', '.'));
    if (isNaN(gapMm) || gapMm < 0) throw new Error('Khoảng cách không hợp lệ: ' + gap.text);
    return { gapMm: gapMm, rotMoving: rot.selection.index === 1 ? 180 : 0, swap: swap.value };
}

function isOutline(item) {
    return /_OUTLINE$/.test(item.name);
}

// An _OUTLINE among group's items, looking into nested (unclipped) groups — not into
// the _FINAL clip group's design. null when there is none.
function outlineInside(group) {
    var items = group.pageItems, i;
    for (i = 0; i < items.length; i++) if (isOutline(items[i])) return items[i];
    for (i = 0; i < items.length; i++) {
        if (items[i].typename === 'GroupItem' && !items[i].clipped) {
            var found = outlineInside(items[i]);
            if (found) return found;
        }
    }
    return null;
}

// The cut outline of a selected part, found by name like the production scripts do
// ({name}_OUTLINE, see lib/output_parts.jsx): the item itself, one inside it (the part
// group selected), or one in a group around it (something inside a part selected).
function findOutline(item) {
    if (isOutline(item)) return item;
    if (item.typename === 'GroupItem') {
        var inside = outlineInside(item);
        if (inside) return inside;
    }
    for (var p = item.parent; p && p.typename === 'GroupItem'; p = p.parent) {
        var around = outlineInside(p);
        if (around) return around;
    }
    throw new Error('Không tìm thấy đường cắt (_OUTLINE) của "' + (item.name || item.typename) + '".');
}

// The part a cut outline belongs to: its {name} group holding {name}_OUTLINE (see
// lib/output_parts.jsx), or the outline alone when it isn't in one.
function partOf(outline) {
    var p = outline.parent;
    return (p.typename === 'GroupItem' && p.name + '_OUTLINE' === outline.name) ? p : outline;
}

// The moving part is wrapped, where it lies, in a group with its reference marker and
// grown outline, so they drag together. The part is the wrapper's last item.
function wrapperOf(item) {
    for (var p = item; p && p.typename === 'GroupItem'; p = p.parent) {
        if (p.name === WRAPPER_NAME) return p;
    }
    return null;
}

function wrappedPart(wrapper) {
    return wrapper.pageItems[wrapper.pageItems.length - 1];
}

// A selected item, or the part it belongs to when it's in a wrapper from an earlier run.
function unwrappedSelection(item) {
    var w = wrapperOf(item);
    return w ? wrappedPart(w) : item;
}

// Put every wrapped part back where it was, dropping the drawings wrapped with it.
function unwrapAll(doc) {
    for (;;) {
        var w;
        try { w = doc.groupItems.getByName(WRAPPER_NAME); } catch (e) { return; }
        wrappedPart(w).move(w, ElementPlacement.PLACEBEFORE);
        w.remove();
    }
}

function wrap(part, drawings) {
    var parent = part.parent;
    var w = parent.groupItems.add();
    w.name = WRAPPER_NAME;
    w.move(part, ElementPlacement.PLACEBEFORE);
    part.move(w, ElementPlacement.PLACEATEND);
    for (var i = 0; i < drawings.length; i++) drawings[i].move(w, ElementPlacement.PLACEATBEGINNING);
    return w;
}

// Nothing selected: remove every drawing of earlier runs and unwrap the moving part.
function cleanUp(doc) {
    unwrapAll(doc);
    try { doc.layers.getByName(LAYER_NAME).remove(); } catch (e) { /* none */ }
}

// The "NFP" layer, emptied — drawings from an earlier run are replaced.
function nfpLayer(doc) {
    var layer;
    try { layer = doc.layers.getByName(LAYER_NAME); } catch (e) { layer = null; }
    if (!layer) {
        layer = doc.layers.add();
        layer.name = LAYER_NAME;
    }
    layer.locked = false;
    layer.visible = true;
    while (layer.pageItems.length) layer.pageItems[0].remove();
    return layer;
}

// Rings [x0, y0, ...] in a shape frame (real pt, y down, origin at the visible box's
// top-left vb) → one compound path in document coordinates.
function drawRings(layer, rings, vb, scale) {
    var cp = layer.compoundPathItems.add();
    for (var i = 0; i < rings.length; i++) {
        var r = rings[i], pts = [];
        for (var j = 0; j < r.length; j += 2) pts.push([vb[0] + r[j] / scale, vb[1] - r[j + 1] / scale]);
        var p = cp.pathItems.add();
        p.setEntirePath(pts);
        p.closed = true;
    }
    return cp;
}

function style(cp, fill, stroke, scale) {
    for (var i = 0; i < cp.pathItems.length; i++) {
        var p = cp.pathItems[i];
        p.filled = !!fill;
        if (fill) p.fillColor = fill;
        p.stroked = true;
        p.strokeColor = stroke;
        p.strokeWidth = 1 / scale;
    }
}

// A dot on every vertex of rings (as for drawRings), d across, in one group.
function drawVertices(layer, rings, vb, scale, color, d) {
    var g = layer.groupItems.add();
    for (var i = 0; i < rings.length; i++) {
        var r = rings[i];
        for (var j = 0; j < r.length; j += 2) {
            var x = vb[0] + r[j] / scale, y = vb[1] - r[j + 1] / scale;
            var dot = g.pathItems.ellipse(y + d / 2, x - d / 2, d, d);
            dot.filled = true;
            dot.fillColor = color;
            dot.stroked = false;
        }
    }
    return g;
}

function countVertices(rings) {
    var n = 0;
    for (var i = 0; i < rings.length; i++) n += rings[i].length / 2;
    return n;
}

// The reference point at (x, y), document coordinates: a dot ringed in white with a
// crosshair, sized to the moving shape (vb its visible bounds) so it shows at any zoom.
function drawMarker(layer, x, y, vb, color, scale) {
    var g = layer.groupItems.add();
    var d = Math.max(Math.min(vb[2] - vb[0], vb[1] - vb[3]) / 15, 8 * PT_PER_MM / scale);
    var white = rgb(255, 255, 255);
    var arm = d * 1.5;
    var lines = [[[x - arm, y], [x + arm, y]], [[x, y - arm], [x, y + arm]]];
    for (var i = 0; i < lines.length; i++) {
        var l = g.pathItems.add();
        l.setEntirePath(lines[i]);
        l.filled = false;
        l.stroked = true;
        l.strokeColor = color;
        l.strokeWidth = d / 8;
    }
    var dot = g.pathItems.ellipse(y + d / 2, x - d / 2, d, d);
    dot.filled = true;
    dot.fillColor = color;
    dot.stroked = true;
    dot.strokeColor = white;
    dot.strokeWidth = d / 6;
    return g;
}

function main() {
    if (!app.documents.length) { alert('Mở file có 2 hình trước.'); return; }
    var doc = app.activeDocument;
    var sel = doc.selection;
    if (!sel || !sel.length) {
        cleanUp(doc);
        alert('Đã xóa hình NFP. (Để vẽ NFP, chọn 2 hình rồi chạy lại.)');
        return;
    }
    if (sel.length !== 2) { alert('Chọn đúng 2 hình (đang chọn ' + sel.length + ').'); return; }
    var opts = askOptions();
    if (!opts) return;

    // selection[0] is the topmost of the two. A part wrapped by an earlier run counts as
    // itself; unwrapping puts it back where it was.
    var top = unwrappedSelection(sel[0]), bottom = unwrappedSelection(sel[1]);
    unwrapAll(doc);
    var moving = findOutline(opts.swap ? bottom : top), fixed = findOutline(opts.swap ? top : bottom);
    if (moving === fixed) throw new Error('Hai hình được chọn có cùng một đường cắt: ' + fixed.name);
    var scale = doc.scaleFactor || 1;
    var job = {
        gap: opts.gapMm * PT_PER_MM, timeLimit: 0,
        nfp: { fixed: exportShape(fixed, scale), moving: exportShape(moving, scale), rotFixed: 0, rotMoving: opts.rotMoving }
    };
    if (!job.nfp.fixed.rings.length || !job.nfp.moving.rings.length) {
        alert('Đường cắt phải là path, compound path hoặc group chứa path.');
        return;
    }
    var fixedVb = fixed.visibleBounds, movingVb = moving.visibleBounds;

    var r = runNester(job, ROOT);

    var layer = nfpLayer(doc);
    var red = rgb(230, 40, 40), blue = rgb(30, 100, 230), grey = rgb(120, 120, 120);
    var nfp = drawRings(layer, r.nfp, fixedVb, scale);
    style(nfp, red, red, scale);
    nfp.opacity = 35;
    nfp.name = 'NFP';
    var a = drawRings(layer, r.fixed, fixedVb, scale);
    style(a, null, grey, scale);
    a.name = 'Fixed (grown)';
    var b = drawRings(layer, r.moving, movingVb, scale);
    style(b, null, blue, scale);
    b.name = 'Moving (grown)';

    // Vertex dots: big enough to see on a whole part, small enough not to merge.
    var side = Math.min(fixedVb[2] - fixedVb[0], fixedVb[1] - fixedVb[3],
                        movingVb[2] - movingVb[0], movingVb[1] - movingVb[3]);
    var d = Math.max(side / 120, 1.5 * PT_PER_MM / scale);
    drawVertices(layer, r.nfp, fixedVb, scale, red, d).name = 'NFP points (' + countVertices(r.nfp) + ')';
    drawVertices(layer, r.fixed, fixedVb, scale, grey, d).name = 'Fixed points (' + countVertices(r.fixed) + ')';
    var bPoints = drawVertices(layer, r.moving, movingVb, scale, blue, d);
    bPoints.name = 'Moving points (' + countVertices(r.moving) + ')';

    var marker = drawMarker(layer, movingVb[0] + r.ref[0] / scale, movingVb[1] - r.ref[1] / scale,
                            movingVb, blue, scale);
    marker.name = 'Moving reference point';

    // The moving part's drawings go with it, so dragging it moves them too.
    var movingPart = partOf(moving);
    var wrapper = wrap(movingPart, [b, bPoints, marker]);

    doc.selection = null;
    wrapper.selected = true;
    (opts.swap ? top : bottom).selected = true;
}

try {
    main();
} catch (e) {
    alert('Lỗi: ' + e.message + '\nLine: ' + e.line);
}
