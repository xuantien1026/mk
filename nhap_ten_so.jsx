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

// Step 2 for a named order: one shirt / pant per row of the print command (CSV), its
// name (TEN) and number (SO) filled in. Run on the Step-1 masters
// document (nhay_size.jsx). For an order of quantities only, see xep_don_so_luong.jsx.

var SCRIPT_DIR = new File($.fileName).parent.fsName;

function main() {
    var sourceDoc = app.activeDocument; // the Step-1 masters document
    var run = readPrintRun(sourceDoc, SCRIPT_DIR);
    if (!run) return;

    // Group orders by size, ignoring any size that was not prepared in Step 1.
    var orders = groupOrdersBySize(run.rows, run.sizes);
    var totalQty = 0;
    for (var k in orders) totalQty += orders[k].length;
    if (totalQty === 0) { alert('Khong co don hang nao khop size da chuan bi.'); return; }

    var built = buildPrintPage(sourceDoc, run.template, run.sizes, orders);
    alert('Hoàn thành! Đã tạo ' + built.sheets + ' tấm in (159cm × 500cm).');
}

try {
    main();
} catch (e) {
    alert('Error: ' + e.message + '\nLine: ' + e.line);
}
