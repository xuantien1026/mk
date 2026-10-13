#target illustrator
#include "lib/config.jsx"
#include "lib/utils.jsx"
#include "lib/names.jsx"
#include "lib/sheet_layout.jsx"
#include "lib/json.jsx"
#include "lib/export_shapes.jsx"
#include "lib/nester_bridge.jsx"
#include "lib/layout_nest.jsx"
#include "lib/output_parts.jsx"
#include "lib/nest_record.jsx"

// Layout engine 2 — optimized layout. Run on a print page made by nhap_ten_so.jsx:
// nests its parts by their real cut outlines, turning some 180°, onto as few 159cm ×
// 500cm sheets as the nester (nester/, needs Node.js and `npm install`) finds in the
// time given. A shirt whose front has its number (SO) gets its front and back placed
// one right after the other. Rearranges the page in place; close it without
// saving to undo. Each run is recorded to debug/last_nest/ (see lib/nest_record.jsx).

var SCRIPT_DIR = new File($.fileName).parent.fsName;

function main() {
    var doc = app.activeDocument;
    var scale = doc.scaleFactor || 1;
    var items = readOutputParts(doc, scale);
    if (!items.length) { alert('Không có chi tiết nào trong layer PRINT_OUTPUT. Hãy chạy nhap_ten_so.jsx trước.'); return; }
    for (var i = 0; i < items.length; i++) checkFits({ width: items[i].w, height: items[i].h }, items[i].label);

    var answer = prompt('Thời gian tìm cách xếp tối ưu (giây). Nhiều size có thể mất thêm vài phút trước khi bắt đầu tìm.', '60');
    if (answer === null) return;
    var timeLimit = parseInt(answer, 10);
    if (!(timeLimit > 0)) { alert('Thời gian không hợp lệ.'); return; }

    var before = doc.artboards.length;
    var recorder = nestRecorder(SCRIPT_DIR);
    recorder.save('before.json', function () { return recordedParts(items, scale); });
    var layout = layoutNest(items, scale, timeLimit, SCRIPT_DIR, recorder);
    applyLayout(doc, layout, scale);
    recorder.save('after.json', function () { return recordedPlacements(doc, layout, scale); });
    alert('Đã xếp lại ' + items.length + ' chi tiết: ' + before + ' → ' + layout.sheets.length + ' tấm in.');
}

try {
    main();
} catch (e) {
    alert('Error: ' + e.message + '\nLine: ' + e.line);
}
