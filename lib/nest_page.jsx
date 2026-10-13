// Layout engine 2 on one print page, for xep_toi_uu.jsx and xep_don_so_luong.jsx. Needs
// config.jsx, utils.jsx, names.jsx, sheet_layout.jsx, json.jsx, export_shapes.jsx,
// nester_bridge.jsx, layout_nest.jsx, output_parts.jsx, nest_record.jsx.

// Ask how long the nester may search, in seconds. null when cancelled or invalid.
function askNestTime() {
    var answer = prompt('Thời gian tìm cách xếp tối ưu (giây). Nhiều size có thể mất thêm vài phút trước khi bắt đầu tìm.', '60');
    if (answer === null) return null;
    var timeLimit = parseInt(answer, 10);
    if (!(timeLimit > 0)) { alert('Thời gian không hợp lệ.'); return null; }
    return timeLimit;
}

// The printed parts of a print page (doc), each checked to fit a sheet.
function nestableParts(doc) {
    var items = readOutputParts(doc, doc.scaleFactor || 1);
    for (var i = 0; i < items.length; i++) checkFits({ width: items[i].w, height: items[i].h }, items[i].label);
    return items;
}

// Nest the parts items (nestableParts) of print page doc onto as few sheets as the
// nester finds in timeLimit seconds, rearranging doc in place. Records the run to
// root/debug/last_nest/ (nest_record.jsx). Returns { before, after } sheet counts.
function nestPage(doc, items, timeLimit, root) {
    var scale = doc.scaleFactor || 1;
    var before = doc.artboards.length;
    var recorder = nestRecorder(root);
    recorder.save('before.json', function () { return recordedParts(items, scale); });
    var layout = layoutNest(items, scale, timeLimit, root, recorder);
    applyLayout(doc, layout, scale);
    recorder.save('after.json', function () {
        return recordedPlacements(layout, scale, function (p) {
            return { outline: p.data.outline, rect: doc.artboards[p.sheet.index].artboardRect };
        });
    });
    return { before: before, after: layout.sheets.length };
}
