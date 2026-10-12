#target illustrator
#include "../lib/names.jsx"
#include "../lib/config.jsx"
#include "../lib/utils.jsx"
#include "../lib/sheet_layout.jsx"
#include "../lib/step1_parts.jsx"
#include "../lib/json.jsx"
#include "../lib/export_shapes.jsx"

// Engine 2, phase 1 — export the real part outlines of a Step-1 (nhay_size.jsx) result
// as a nester job, to test and benchmark the nester on real shapes outside Illustrator.
// Run with the Step-1 result document active. Every prepared size gets the same number
// of orders (asked for); each order is all of that size's parts. The job is written to
// test/fixtures/<document name>.job.json.

var ROOT = new File($.fileName).parent.parent.fsName;

function main() {
    var doc = app.activeDocument;
    var sizes = detectPreparedSizes(doc);
    if (!sizes.length) { alert('Mở file kết quả của nhay_size.jsx trước.'); return; }

    var answer = prompt('Số đơn hàng cho mỗi size (' + sizes.join(', ') + '):', '5');
    if (answer === null) return;
    var perSize = parseInt(answer, 10);
    if (!(perSize > 0)) { alert('Số không hợp lệ.'); return; }

    var keys = [];
    for (var s = 0; s < sizes.length; s++) {
        var sides = productSides(doc, 'SHIRT', sizes[s]).concat(productSides(doc, 'PANT', sizes[s]));
        for (var q = 0; q < perSize; q++) {
            for (var i = 0; i < sides.length; i++) keys.push(sizes[s] + '_' + sides[i]);
        }
    }
    var job = buildNestJob(doc, keys, 60);

    var folder = new Folder(ROOT + '/test/fixtures');
    if (!folder.exists) folder.create();
    var out = new File(folder.fsName + '/' + doc.name.replace(/\.[^.]*$/, '') + '.job.json');
    writeTextFile(out, toJSON(job));

    var nShapes = 0, nPoints = 0;
    for (var k in job.shapes) {
        nShapes++;
        for (var r = 0; r < job.shapes[k].rings.length; r++) nPoints += job.shapes[k].rings[r].length / 2;
    }
    alert('Đã xuất ' + job.parts.length + ' chi tiết (' + nShapes + ' hình, ' + nPoints + ' điểm) vào:\n' + out.fsName);
}

try {
    main();
} catch (e) {
    alert('Error: ' + e.message + '\nLine: ' + e.line);
}
