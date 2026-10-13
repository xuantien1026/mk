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
#include "lib/nest_page.jsx"

// Layout engine 2 — optimized layout. Run on a print page made by nhap_ten_so.jsx:
// nests its parts by their real cut outlines, turning some 180°, onto as few 159cm ×
// 500cm sheets as the nester (nester/, needs Node.js and `npm install`) finds in the
// time given. A shirt whose front has its number (SO) gets its front and back placed
// one right after the other. Optionally, every shirt and sleeve is placed before the
// pants, and/or size by size, smallest first (checkboxes next to the time). Rearranges
// the page in place; close it without saving to undo. Each run is recorded to debug/last_nest/ (see lib/nest_record.jsx).
// xep_don_so_luong.jsx lays out its pieces with the same engine by itself.

var SCRIPT_DIR = new File($.fileName).parent.fsName;

function main() {
    var doc = app.activeDocument;
    var items = nestableParts(doc);
    if (!items.length) { alert('Không có chi tiết nào trong trang in. Hãy chạy nhap_ten_so.jsx trước.'); return; }

    var options = askNestOptions(items);
    if (options === null) return;

    var nested = nestPage(doc, items, SCRIPT_DIR, options);
    trimSheetBottoms(doc, nested.layout);
    alert('Đã xếp lại ' + items.length + ' chi tiết: ' + nested.before + ' → ' + nested.after + ' tấm in.'
        + (nested.evaluations ? '\nĐã thử ' + nested.evaluations + ' cách xếp.' : ''));
}

try {
    main();
} catch (e) {
    alert('Error: ' + e.message + '\nLine: ' + e.line);
}
