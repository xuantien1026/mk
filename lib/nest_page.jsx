// Layout engine 2 on one print page, for xep_toi_uu.jsx and xep_don_so_luong.jsx. Needs
// config.jsx, utils.jsx, names.jsx, sheet_layout.jsx, json.jsx, export_shapes.jsx,
// nester_bridge.jsx, layout_nest.jsx, output_parts.jsx, nest_record.jsx.

// Ask how long the nester may search, in seconds, and — when items (nestableParts) mix
// shirt and pant parts — whether to place every shirt and sleeve before the pants.
// Returns { timeLimit, shirtsFirst }, or null when cancelled or invalid.
function askNestOptions(items) {
    var pants = pantParts(items).length;
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
    var buttons = win.add('group');
    buttons.alignment = 'right';
    buttons.add('button', undefined, 'OK', { name: 'ok' });
    buttons.add('button', undefined, 'Hủy', { name: 'cancel' });
    if (win.show() !== 1) return null;

    var timeLimit = parseInt(time.text, 10);
    if (!(timeLimit > 0)) { alert('Thời gian không hợp lệ.'); return null; }
    return { timeLimit: timeLimit, shirtsFirst: shirtsFirst !== null && shirtsFirst.value };
}

// The printed parts of a print page (doc), each checked to fit a sheet.
function nestableParts(doc) {
    var items = readOutputParts(doc, doc.scaleFactor || 1);
    for (var i = 0; i < items.length; i++) checkFits({ width: items[i].w, height: items[i].h }, items[i].label);
    return items;
}

// Nest the parts items (nestableParts) of print page doc onto as few sheets as the
// nester finds in timeLimit seconds, rearranging doc in place. Records the run to
// root/debug/last_nest/ (nest_record.jsx). shirtsFirst: see layoutNest. Returns
// { before, after } sheet counts.
function nestPage(doc, items, timeLimit, root, shirtsFirst) {
    var scale = doc.scaleFactor || 1;
    var before = doc.artboards.length;
    var recorder = nestRecorder(root);
    recorder.save('before.json', function () { return recordedParts(items, scale); });
    var layout = layoutNest(items, scale, timeLimit, root, recorder, shirtsFirst);
    applyLayout(doc, layout, scale);
    recorder.save('after.json', function () {
        return recordedPlacements(layout, scale, function (p) {
            return { outline: p.data.outline, rect: doc.artboards[p.sheet.index].artboardRect };
        });
    });
    return { before: before, after: layout.sheets.length };
}
