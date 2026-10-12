// Layout engine 2 from Illustrator: nest parts by their real outlines (nester/), turning
// some 180°. Needs json.jsx, export_shapes.jsx, nester_bridge.jsx, sheet_layout.jsx.

// items: [{ key, outline, ... }] — one per part to print; key = {size}_{side} names its
// shape, outline is its cut outline in a document whose units are 1/scale of real pt.
// Shows a progress window while the nester runs: about timeLimit seconds, plus minutes
// beforehand for a design with many sizes. Returns { sheets, placements: [{ sheet, x,
// y, rot, data }] } like layoutSequential, with data the item and rot (0/180) to turn
// the part about its center first.
function layoutNest(items, scale, timeLimit, root) {
    var job = buildNestJob(items, scale, timeLimit);

    var win = new Window('palette', 'Xếp tối ưu');
    win.alignChildren = 'fill';
    var line1 = win.add('statictext', undefined, 'Đang khởi động...');
    var line2 = win.add('statictext', undefined, items.length + ' chi tiết');
    line1.preferredSize = [360, 20];
    win.show();
    var result;
    try {
        result = runNester(job, root, function (p, elapsedMs) {
            var secs = Math.round(elapsedMs / 1000);
            if (!p) {
                line1.text = 'Đang tính hình dạng các chi tiết... ' + secs + 's';
            } else {
                line1.text = 'Đang tìm cách xếp tốt nhất... ' + secs + 's (giới hạn ~' + timeLimit + 's)';
                line2.text = 'Tốt nhất: ' + p.sheets + ' tấm (' + p.fitness.toFixed(2) + ') — đã thử ' + p.evaluations + ' cách';
            }
            win.update();
        });
    } finally {
        win.close();
    }
    return nestResultToLayout(result, items);
}

// The nester's result (see nester/index.js) as a layout, sheets from makeSheet.
function nestResultToLayout(result, items) {
    var sheets = [];
    for (var s = 0; s < result.sheets; s++) sheets.push(makeSheet(s));
    var placements = [];
    for (var i = 0; i < result.placements.length; i++) {
        var pl = result.placements[i];
        placements.push({ sheet: sheets[pl.sheet], x: pl.x, y: pl.y, rot: pl.rot, data: items[pl.part] });
    }
    return { sheets: sheets, placements: placements };
}
