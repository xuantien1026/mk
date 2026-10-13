#target illustrator
#include "lib/config.jsx"
#include "lib/utils.jsx"
#include "lib/sheet_layout.jsx"
#include "lib/step1_parts.jsx"
#include "lib/layout_sequential.jsx"
#include "lib/output_parts.jsx"

// Layout engine 1 — simple sequential layout. Run on a print page made by
// nhap_ten_so.jsx: rearranges its parts, in place, onto as few 159cm × 500cm sheets as
// this method manages. Shirts and pants go in rows in print order (per size: shirts,
// then pants); sleeves then fill the gaps. Close the page without saving to undo.

function main() {
    var doc = app.activeDocument;
    var scale = doc.scaleFactor || 1;
    var items = readOutputParts(doc, scale);
    if (!items.length) { alert('Không có chi tiết nào trong trang in. Hãy chạy nhap_ten_so.jsx hoặc xep_don_so_luong.jsx trước.'); return; }

    var parts = [], sleeves = [];
    for (var i = 0; i < items.length; i++) {
        var it = items[i];
        checkFits({ width: it.w, height: it.h }, it.label);
        var part = { w: it.w, h: it.h, label: it.label, data: it };
        if (indexIn(SLEEVE_SIDES, it.side) >= 0) sleeves.push(part); else parts.push(part);
    }

    var before = doc.artboards.length;
    var layout = layoutSequential(parts, sleeves);
    applyLayout(doc, layout, scale);
    alert('Đã xếp lại ' + items.length + ' chi tiết: ' + before + ' → ' + layout.sheets.length + ' tấm in.');
}

try {
    main();
} catch (e) {
    alert('Error: ' + e.message + '\nLine: ' + e.line);
}
