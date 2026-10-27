// Layout engine 2 on one print page, for xep_toi_uu.jsx and xep_don_so_luong.jsx — both
// go through nestOntoPage. Needs config.jsx, utils.jsx, names.jsx, sheet_layout.jsx,
// json.jsx, export_shapes.jsx, nester_bridge.jsx, layout_nest.jsx, output_parts.jsx,
// nest_record.jsx; nestNewPage also print_pages.jsx (and what it needs).

// Ask how long the nester may search, in seconds; when items (nestableParts) mix shirt
// and pant parts, whether to place every shirt and sleeve before the pants; and when
// they have several sizes, whether to place them size by size (see nestStages).
// Returns { timeLimit, shirtsFirst, bySize }, or null when cancelled or invalid.
function askNestOptions(items) {
    var pants = pantParts(items).length;
    var sizes = {}, sizeCount = 0;
    for (var i = 0; i < items.length; i++) if (!sizes[items[i].sz]) { sizes[items[i].sz] = true; sizeCount++; }
    var win = new Window('dialog', 'Xếp tối ưu');
    win.alignChildren = 'fill';
    win.add('statictext', undefined, 'Thời gian tìm cách xếp tối ưu (giây). Nhiều size có thể mất thêm vài phút '
        + 'trước khi bắt đầu tìm.', { multiline: true }).preferredSize = [360, 34];
    var time = win.add('edittext', undefined, '60');
    time.active = true;
    var shirtsFirst = null;
    if (pants > 0 && pants < items.length) {
        shirtsFirst = win.add('checkbox', undefined, 'Xếp hết áo và tay áo trước quần');
        shirtsFirst.helpTip = 'Quần chỉ được xếp sau tất cả áo và tay áo (có thể chung tấm in cuối cùng của áo).';
    }
    var bySize = null;
    if (sizeCount > 1) {
        bySize = win.add('checkbox', undefined, 'Xếp lần lượt từng size, từ nhỏ đến lớn');
        bySize.helpTip = 'Xếp hết các chi tiết của một size rồi mới đến size tiếp theo (có thể chung tấm in cuối '
            + 'cùng của size trước). Chọn cùng "áo trước quần": mỗi size xếp áo rồi đến quần.';
    }
    var buttons = win.add('group');
    buttons.alignment = 'right';
    buttons.add('button', undefined, 'OK', { name: 'ok' });
    buttons.add('button', undefined, 'Hủy', { name: 'cancel' });
    if (win.show() !== 1) return null;

    var timeLimit = parseInt(time.text, 10);
    if (!(timeLimit > 0)) { alert('Thời gian không hợp lệ.'); return null; }
    return { timeLimit: timeLimit, shirtsFirst: shirtsFirst !== null && shirtsFirst.value,
             bySize: bySize !== null && bySize.value };
}

// The printed parts of a print page (doc), each checked to fit a sheet.
function nestableParts(doc) {
    var items = readOutputParts(doc, doc.scaleFactor || 1);
    for (var i = 0; i < items.length; i++) checkFits({ width: items[i].w, height: items[i].h }, items[i].label);
    return items;
}

// Layout engine 2, from the parts to the finished page — the one pipeline both scripts
// run, so they always get the same steps: record the parts, nest them, put them on the
// page (place), record where they landed, trim the sheets. A step every nested page
// needs belongs here, never in a script's main. Records the run to root/debug/last_nest/
// (nest_record.jsx). items: layoutNest's, their outlines in documents of scale real pt
// per unit; options: askNestOptions's. place(layout) puts every placement's part on the
// page and returns the page document, with one artboard per layout sheet, in order, and
// each placement given outline: its placed part's cut outline. Returns { doc, layout }.
function nestOntoPage(items, scale, root, options, place) {
    var recorder = nestRecorder(root);
    recorder.save('before.json', function () { return recordedParts(items, scale); });
    var layout = layoutNest(items, scale, root, recorder, options);
    var doc = place(layout);
    recorder.save('after.json', function () { return recordedPlacements(layout, doc); });
    trimSheetBottoms(doc, layout);
    return { doc: doc, layout: layout };
}

// xep_toi_uu.jsx: nest the parts items (nestableParts) of print page doc, rearranging
// doc in place. Returns { before, after } sheet counts, the layout applied and the
// nester's evaluations (layouts tried).
function nestPage(doc, items, root, options) {
    var scale = doc.scaleFactor || 1;
    var before = doc.artboards.length;
    var layout = nestOntoPage(items, scale, root, options, function (layout) {
        applyLayout(doc, layout, scale);
        for (var i = 0; i < layout.placements.length; i++) {
            layout.placements[i].outline = layout.placements[i].data.outline;
        }
        return doc;
    }).layout;
    return { before: before, after: layout.sheets.length, layout: layout, evaluations: layout.evaluations };
}

// xep_don_so_luong.jsx: nest the parts items (quantityParts — Step-1 outlines in
// sourceDoc), building the print page straight into that layout (buildLayoutPage, a copy
// of template). Returns { doc (the page), layout }.
function nestNewPage(sourceDoc, template, items, root, options) {
    return nestOntoPage(items, sourceDoc.scaleFactor || 1, root, options, function (layout) {
        return buildLayoutPage(sourceDoc, template, layout);
    });
}

// After placing layout on doc (nestOntoPage): raise each sheet's artboard bottom to its
// lowest part's cut outline, so no empty space is left below the parts. A sheet with no
// parts is kept.
function trimSheetBottoms(doc, layout) {
    for (var s = 0; s < layout.sheets.length; s++) {
        var bottom = null;
        for (var i = 0; i < layout.placements.length; i++) {
            var p = layout.placements[i];
            if (p.sheet !== layout.sheets[s]) continue;
            var b = p.outline.visibleBounds[3];
            if (bottom === null || b < bottom) bottom = b;
        }
        if (bottom === null) continue;
        var ab = doc.artboards[s];
        var r = ab.artboardRect;
        if (bottom > r[3]) ab.artboardRect = [r[0], r[1], r[2], bottom];
    }
}
