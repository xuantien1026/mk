// Layout engine 2 from Illustrator: nest parts by their real outlines (nester/), turning
// some 180°. Needs json.jsx, export_shapes.jsx, nester_bridge.jsx, sheet_layout.jsx,
// names.jsx (SO), utils.jsx (findAllItemsByName), config.jsx (SIZES).

// items: [{ key, outline, ... }] — one per part to print; key = {size}_{side} names its
// shape, outline is its cut outline in a document whose units are 1/scale of real pt.
// Shows a progress window while the nester runs: about timeLimit seconds, plus minutes
// beforehand for a design with many sizes. Returns { sheets, placements: [{ sheet, x,
// y, rot, data }], evaluations (layouts the nester tried) } like layoutSequential, with data the item and rot (0/180) to turn
// the part about its center first. recorder (optional, see nest_record.jsx) gets the
// nester's job and result. options: { timeLimit, shirtsFirst, bySize } (see
// askNestOptions and nestStages).
function layoutNest(items, scale, root, recorder, options) {
    var timeLimit = options.timeLimit;
    var job = buildNestJob(items, scale, timeLimit);
    job.pairs = soPairs(items);
    job.stages = nestStages(items, options.shirtsFirst, options.bySize);
    if (recorder) recorder.save('job.json', function () { return job; });

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
    if (recorder) recorder.save('result.json', function () { return result; });
    return nestResultToLayout(result, items);
}

// When a size's shirt front (THAN_TRUOC) carries the number (SO), each order's front
// and back are placed one right after the other. Returns [[front, back], ...] as
// indices into items. An order with no number has its SO removed (nhap_ten_so.jsx), so
// a front counts as numbered when any order's front of that size has an SO. Items with
// no group (xep_don_so_luong.jsx: nested before they are made, and never numbered) are
// never paired.
function soPairs(items) {
    var hasSo = {};
    for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (it.side !== 'FRONT' || !it.group || hasSo[it.key]) continue;
        hasSo[it.key] = findAllItemsByName(it.group, SO).length > 0;
    }
    var front = {}, pairs = [];
    for (var j = 0; j < items.length; j++) {
        if (items[j].side === 'FRONT') front[items[j].sz + '_' + items[j].n] = j;
    }
    for (var k = 0; k < items.length; k++) {
        var b = items[k], f = front[b.sz + '_' + b.n];
        if (b.side === 'BACK' && f !== undefined && hasSo[items[f].key]) pairs.push([f, k]);
    }
    return pairs;
}

function isPantPart(item) {
    return /PANT/.test(item.side);
}

// The pant parts (QUAN_*: sides LEFT_PANT, RIGHT_PANT_1, ...), as indices into items.
function pantParts(items) {
    var pants = [];
    for (var i = 0; i < items.length; i++) if (isPantPart(items[i])) pants.push(i);
    return pants;
}

// The job's stages (see nester/pairs.js): one number per item, and the nester places
// the items stage by stage, a stage never on a sheet before the previous stage's last
// one. shirtsFirst: every shirt part (front, back, sleeves) before the pants. bySize:
// size by size, smallest first (SIZES). Both: each size's shirt parts, then its pants,
// then the next size. Neither: null, no stages.
function nestStages(items, shirtsFirst, bySize) {
    if (!shirtsFirst && !bySize) return null;
    var rank = {};
    for (var s = 0; s < SIZES.length; s++) rank[SIZES[s]] = s;
    var stages = [];
    for (var i = 0; i < items.length; i++) {
        var pant = shirtsFirst && isPantPart(items[i]) ? 1 : 0;
        stages.push((bySize ? 2 * rank[items[i].sz] : 0) + pant);
    }
    return stages;
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
    return { sheets: sheets, placements: placements, evaluations: result.evaluations };
}
