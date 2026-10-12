#target illustrator
#include "../lib/names.jsx"
#include "../lib/config.jsx"
#include "../lib/utils.jsx"
#include "../lib/sheet_layout.jsx"
#include "../lib/step1_parts.jsx"
#include "../lib/large_canvas.jsx"

// Engine 2, phase 0 — can a Step-1 part be rotated 180° by script without losing
// anything (design, names/number, the FADED opacity mask)?
//
// Run with the Step-1 (nhay_size.jsx) result document active. It pastes one part into a
// copy of the Large Canvas template — the same route nhap_ten_so.jsx uses — and lays out
// three copies side by side, left to right:
//   1. as pasted            2. moved only (.position)            3. rotated 180°
// Compare them by eye (zoom in on the fade). The script also checks the cut outline and
// the design rotated together. Nothing is saved; close the copy without saving.

var LARGE_CANVAS_TEMPLATE = new File($.fileName).parent.parent.fsName + '/lib/large_canvas.ai';

function centerOf(b) { return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; }

function main() {
    var sourceDoc = app.activeDocument;
    var sizes = detectPreparedSizes(sourceDoc);
    if (!sizes.length) { alert('Mở file kết quả của nhay_size.jsx trước.'); return; }

    var guess = sizes[0] + '_' + (productSides(sourceDoc, 'SHIRT', sizes[0]).length ? 'FRONT' : pantSides(sourceDoc, sizes[0])[0]);
    var key = prompt('Chi tiết cần thử (ví dụ S_FRONT, M_LEFT_PANT_1). Nên chọn chi tiết có hiệu ứng FADED:', guess);
    if (!key) return;

    var opened = openLargeCanvasCopy(new File(LARGE_CANVAS_TEMPLATE),
                                     new File(Folder.temp + '/_mk_test_rotate_' + (new Date()).getTime() + '.ai'));
    var doc = opened.doc;
    var layer = doc.layers.add();
    layer.name = 'TEST_ROTATE';
    var part = pasteParts(sourceDoc, doc, layer, [key], opened.scale)[key];
    var original = part.design.parent; // the {key} instance group: _OUTLINE + _FINAL

    var b0 = partBounds(part.design);
    var step = b0.width * 1.3;

    var moved = original.duplicate(layer, ElementPlacement.PLACEATEND);
    moved.position = [moved.position[0] + step, moved.position[1]];

    var rotated = original.duplicate(layer, ElementPlacement.PLACEATEND);
    rotated.rotate(180, true, true, true, true, Transformation.CENTER);
    rotated.position = [rotated.position[0] + 2 * step, rotated.position[1]];

    // In the rotated copy, the cut outline and the clipping path must still coincide (a
    // clip group's own bounds include the hidden artwork, so compare the clip path).
    var fin = null;
    for (var i = 0; i < rotated.pageItems.length; i++) {
        if (/_FINAL$/.test(rotated.pageItems[i].name)) fin = rotated.pageItems[i];
    }
    var co = centerOf(outlineOf(fin).geometricBounds), cf = centerOf(fin.pageItems[0].geometricBounds);
    var drift = Math.max(Math.abs(co[0] - cf[0]), Math.abs(co[1] - cf[1])) * opened.scale / PT_PER_MM;
    var b2 = partBounds(fin);
    var sizeOk = Math.abs(b2.width - b0.width) < b0.width * 0.001 && Math.abs(b2.height - b0.height) < b0.height * 0.001;

    doc.selection = null;
    app.executeMenuCommand('fitall');
    alert('Đã tạo 3 bản: gốc | chỉ di chuyển | xoay 180°.\n\n'
        + 'Đường cắt lệch thiết kế sau khi xoay: ' + drift.toFixed(2) + ' mm ' + (drift < 0.1 ? '(OK)' : '(LỖI)') + '\n'
        + 'Kích thước giữ nguyên: ' + (sizeOk ? 'OK' : 'LỖI') + '\n\n'
        + 'Hãy phóng to và so sánh bằng mắt, nhất là hiệu ứng mờ (FADED): bản 2 và bản 3 có giống bản 1 '
        + '(chỉ khác chiều xoay) không? Gửi kết quả cho Claude. Đóng file này không cần lưu.');
}

try {
    main();
} catch (e) {
    alert('Error: ' + e.message + '\nLine: ' + e.line);
}
