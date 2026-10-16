// Large Canvas output documents. Needs requireItem (utils.jsx), partBounds /
// partBoundsByName (step1_parts.jsx).
//
// A Large Canvas document is scaled 1:scaleFactor (10): scripting reads and writes every
// coordinate and size there at 1/scaleFactor of its real value. Scripts can't create
// one, so each output document is a copy of a template made by hand.

// Open an independent copy of the template (saved to copyFile) so the template itself
// is never modified. Returns { doc, scale }.
function openLargeCanvasCopy(template, copyFile) {
    template.copy(copyFile);
    var doc   = app.open(copyFile);
    var scale = doc.scaleFactor;
    if (!scale || scale <= 1) {
        throw new Error('File mẫu ' + template.fsName + ' không phải Large Canvas. '
            + 'Tạo lại file mới (File ▸ New) rộng hơn 578cm.');
    }
    return { doc: doc, scale: scale };
}

// Bring the Step-1 part instances named by keys ({size}_{side}) from sourceDoc into
// layer of the Large Canvas doc, in one clipboard copy/paste. Copy/paste is the only
// route that keeps the real size: duplicate() into a Large Canvas keeps the numbers
// (10× too big), and resize() to undo that thins text strokes to 1/100.
// extraNames (optional) are other top-level items of sourceDoc brought along in the same
// paste, looked up by name in doc afterwards (e.g. SO_AO).
// Overwrites the clipboard. Returns { key: { design, outline } } of the pasted items.
function pasteParts(sourceDoc, doc, layer, keys, scale, extraNames) {
    extraNames = extraNames || [];
    app.activeDocument = sourceDoc;
    sourceDoc.selection = null;
    for (var i = 0; i < keys.length; i++) {
        requireItem(sourceDoc.pageItems, keys[i] + '_FINAL', sourceDoc.name).parent.selected = true;
    }
    for (var e = 0; e < extraNames.length; e++) {
        requireItem(sourceDoc.pageItems, extraNames[e], sourceDoc.name).selected = true;
    }
    if (sourceDoc.selection.length !== keys.length + extraNames.length) {
        sourceDoc.selection = null;
        throw new Error('Không chọn được các chi tiết trong ' + sourceDoc.name + ' để sao chép. Hãy mở khóa / hiện layer SIZED_OUTPUT.');
    }
    app.copy();
    sourceDoc.selection = null; // a lingering selection here blocks selecting in other docs

    app.activeDocument = doc;
    doc.activeLayer = layer;
    app.paste();
    doc.selection = null;

    var parts = {};
    for (var j = 0; j < keys.length; j++) {
        var key  = keys[j];
        var part = {
            design:  requireItem(doc.pageItems, key + '_FINAL',   doc.name),
            outline: requireItem(doc.pageItems, key + '_OUTLINE', doc.name)
        };
        // The copy must keep its real size. Fail loudly (with the numbers) rather than
        // print at the wrong size.
        var srcW  = partBoundsByName(sourceDoc, key + '_FINAL').width;
        var copyW = partBounds(part.design).width * scale;
        if (Math.abs(copyW - srcW) > srcW * 0.01) {
            throw new Error('Kích thước ' + key + ' bị thay đổi khi chép sang Large Canvas: '
                + srcW.toFixed(1) + 'pt → ' + copyW.toFixed(1) + 'pt (scaleFactor ' + scale + ').');
        }
        parts[key] = part;
    }
    return parts;
}
