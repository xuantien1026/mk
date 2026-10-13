// A record of the last layout engine 2 run (xep_toi_uu.jsx), for finding out which stage
// went wrong when a layout comes out bad: node tools/check_nest.js debug/last_nest.
// Needs json.jsx, export_shapes.jsx.
//
// <scripts>/debug/last_nest/, replaced by every run:
//   before.json  every part's own outline, traced before the layout is applied
//   job.json     what the nester was given (one shape per {size}_{side}, traced from the
//                first part with that key)
//   result.json  what the nester returned
//   after.json   every part's outline and its position on its sheet once applied
// Recording never fails a run: a file that can't be written is skipped.

// The recorder for a run, its folder emptied. root: the scripts folder.
function nestRecorder(root) {
    var dir = null;
    try {
        var parent = new Folder(root + '/debug');
        if (!parent.exists) parent.create();
        dir = new Folder(parent.fsName + '/last_nest');
        if (dir.exists) {
            var old = dir.getFiles();
            for (var i = 0; i < old.length; i++) old[i].remove();
        } else {
            dir.create();
        }
    } catch (e) {
        dir = null;
    }
    return {
        // value is a function, called only when there is somewhere to write — so a
        // recorder that can't write costs no tracing either.
        save: function (name, value) {
            if (!dir) return;
            try {
                writeTextFile(new File(dir.fsName + '/' + name), toJSON(value()));
            } catch (e) { /* best effort */ }
        }
    };
}

// before.json: each part's outline as traced on its own (job.json shares one per key).
function recordedParts(items, scale) {
    var parts = [];
    for (var i = 0; i < items.length; i++) {
        parts.push({ label: items[i].label, key: items[i].key, shape: exportShape(items[i].outline, scale) });
    }
    return { scale: scale, parts: parts };
}

// after.json: where each part really ended up — its outline's visible top-left from its
// sheet's top-left (real pt, y down), what result.json asked for — and its outline
// traced. In layout.placements order, the same as result.json's.
function recordedPlacements(doc, layout, scale) {
    var parts = [];
    for (var i = 0; i < layout.placements.length; i++) {
        var p = layout.placements[i], it = p.data;
        var r = doc.artboards[p.sheet.index].artboardRect, vb = it.outline.visibleBounds;
        parts.push({ label: it.label, key: it.key, sheet: p.sheet.index, rot: p.rot,
                     x: (vb[0] - r[0]) * scale, y: (r[1] - vb[1]) * scale, shape: exportShape(it.outline, scale) });
    }
    return { scale: scale, parts: parts };
}
