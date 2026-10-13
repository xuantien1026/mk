#target illustrator
#include "lib/names.jsx"
#include "lib/config.jsx"
#include "lib/utils.jsx"
#include "lib/print_command.jsx"
#include "lib/print_dialogs.jsx"
#include "lib/sheet_layout.jsx"
#include "lib/step1_parts.jsx"
#include "lib/large_canvas.jsx"
#include "lib/print_pages.jsx"
#include "lib/json.jsx"
#include "lib/export_shapes.jsx"
#include "lib/nester_bridge.jsx"
#include "lib/layout_nest.jsx"
#include "lib/nest_record.jsx"
#include "lib/nest_page.jsx"

// Step 2 for a quantity order (đơn số lượng): no numbers or names, only how many of
// each size. Run on the Step-1 masters document (nhay_size.jsx) with a print command
// (CSV) in the same format as nhap_ten_so.jsx's: each row is Số lượng pieces of its
// size (1 when blank). Every piece's parts are nested together in one go, as
// xep_toi_uu.jsx does (every piece of a size is the same, so the Step-1 parts are all
// the nester needs), then the print page is built straight into that layout, with SO,
// TEN_TREN and TEN_DUOI removed. Optionally, every shirt and sleeve is placed before
// the pants (a checkbox next to the time). The run is recorded to debug/last_nest/.

var SCRIPT_DIR = new File($.fileName).parent.fsName;

// One item per part to print, in print order (size by size; within a size every
// piece's shirt parts, then every piece's pant parts): { key ({size}_{side}), sz, n
// (the piece's number within its size), side, label, outline (the Step-1 part's cut
// outline in sourceDoc), w, h (its visible box, real pt) } — what layoutNest needs.
function quantityParts(sourceDoc, sizes, counts, scale) {
    var KINDS = ['SHIRT', 'PANT'], items = [];
    for (var s = 0; s < sizes.length; s++) {
        var sz = sizes[s];
        if (!counts[sz]) continue;
        for (var t = 0; t < KINDS.length; t++) {
            var sides = productSides(sourceDoc, KINDS[t], sz);
            for (var q = 1; q <= counts[sz]; q++) {
                for (var i = 0; i < sides.length; i++) {
                    var key = sz + '_' + sides[i];
                    var outline = requireItem(sourceDoc.pageItems, key + '_OUTLINE', sourceDoc.name);
                    var vb = outline.visibleBounds;
                    items.push({ key: key, sz: sz, n: q, side: sides[i], label: sz + '_' + q + '_' + sides[i],
                                 outline: outline, w: (vb[2] - vb[0]) * scale, h: (vb[1] - vb[3]) * scale });
                }
            }
        }
    }
    return items;
}

function main() {
    var sourceDoc = app.activeDocument; // the Step-1 masters document
    var scale = sourceDoc.scaleFactor || 1;
    var run = readPrintRun(sourceDoc, SCRIPT_DIR);
    if (!run) return;

    // Count the pieces per size, ignoring any size that was not prepared in Step 1.
    var items = quantityParts(sourceDoc, run.sizes, quantityBySize(run.rows, run.sizes), scale);
    if (!items.length) { alert('Khong co don hang nao khop size da chuan bi.'); return; }
    for (var i = 0; i < items.length; i++) checkFits({ width: items[i].w, height: items[i].h }, items[i].label);

    var options = askNestOptions(items);
    if (options === null) return;

    var recorder = nestRecorder(SCRIPT_DIR);
    recorder.save('before.json', function () { return recordedParts(items, scale); });
    var layout = layoutNest(items, scale, options.timeLimit, SCRIPT_DIR, recorder, options.shirtsFirst);
    var doc = buildLayoutPage(sourceDoc, run.template, layout);
    recorder.save('after.json', function () {
        return recordedPlacements(layout, doc.scaleFactor, function (p) { return p; });
    });

    alert('Hoàn thành! Đã xếp ' + items.length + ' chi tiết vào ' + layout.sheets.length + ' tấm in (159cm × 500cm).');
}

try {
    main();
} catch (e) {
    alert('Error: ' + e.message + '\nLine: ' + e.line);
}
