#target illustrator
#include "lib/names.jsx"
#include "lib/config.jsx"
#include "lib/utils.jsx"
#include "lib/print_command.jsx"
#include "lib/print_dialogs.jsx"
#include "lib/sheet_layout.jsx"
#include "lib/step1_parts.jsx"
#include "lib/large_canvas.jsx"

// Blank Large Canvas document: in Illustrator, File ▸ New with a width above 578cm
// (e.g. 1000cm × 1000cm) — Illustrator switches to Large Canvas automatically — then
// save it here. Scripts can't create a Large Canvas document themselves.
var LARGE_CANVAS_TEMPLATE = new File($.fileName).parent.fsName + '/lib/large_canvas.ai';

var CUSTOMER_NAME_MAX_WIDTH = {
    'XS':  28.0 * 10 * PT_PER_MM,
    'S':   29.5 * 10 * PT_PER_MM,
    'M':   31.0 * 10 * PT_PER_MM,
    'L':   32.5 * 10 * PT_PER_MM,
    'XL':  34.0 * 10 * PT_PER_MM,
    '2XL': 35.5 * 10 * PT_PER_MM,
    '3XL': 37.0 * 10 * PT_PER_MM,
    '4XL': 38.5 * 10 * PT_PER_MM,
    '5XL': 40.0 * 10 * PT_PER_MM,
    '6XL': 41.5 * 10 * PT_PER_MM
};

// Fill every text frame named fieldName in container with value, or remove them
// when value is empty. maxW (optional) caps the rendered width.
function applyField(container, fieldName, value, maxW) {
    var fields = findAllItemsByName(container, fieldName);
    for (var i = 0; i < fields.length; i++) {
        var f = fields[i];
        if (f.typename !== 'TextFrame') continue;
        if (value !== null && value !== '') {
            f.contents = value;
            if (maxW) {
                var b = f.geometricBounds;
                var w = b[2] - b[0];
                if (w > maxW) f.resize((maxW / w) * 100, 100, true, true, true, true, false, Transformation.CENTER);
            }
        } else {
            f.remove();
        }
    }
}

// -------------------------------------------------------
// Main
// -------------------------------------------------------
function main() {
    var sourceDoc = app.activeDocument; // the Step-1 masters document

    var preparedSizes = detectPreparedSizes(sourceDoc);
    if (preparedSizes.length === 0) {
        alert('Chua co thiet ke nao. Hay chay nhay_size.jsx truoc.');
        return;
    }

    var template = new File(LARGE_CANVAS_TEMPLATE);
    if (!template.exists) {
        alert('Không tìm thấy file mẫu Large Canvas: ' + template.fsName + '\n'
            + 'Tạo file mới trong Illustrator (File ▸ New) rộng hơn 578cm, ví dụ 1000cm × 1000cm, '
            + 'rồi lưu vào đường dẫn trên.');
        return;
    }

    var file = selectPrintCommandFile();
    if (!file) return; // cancelled

    var rows = parsePrintCommand(file);
    if (rows.length === 0) { alert('Khong tim thay dong du lieu nao trong file.'); return; }

    // If the CSV mixes several Mẫu, ask which one to print and keep only its rows.
    // A single distinct value (incl. no Mẫu column / all blank) needs no prompt.
    var distinct = distinctVariant(rows);
    if (distinct.length > 1) {
        var chosen = selectVariant(distinct);
        if (chosen == null) return; // cancelled
        rows = filterByVariant(rows, chosen);
    }

    // Group orders by size, ignoring any size that was not prepared in Step 1.
    var orders = groupOrdersBySize(rows, preparedSizes);
    var totalQty = 0;
    for (var k in orders) totalQty += orders[k].length;
    if (totalQty === 0) { alert('Khong co don hang nao khop size da chuan bi.'); return; }

    // -------------------------------------------------------
    // Phase 1: assign every product to a sheet + slot, using the master sizes (no
    // duplication needed — a duplicate is identical to its master).
    // Per size: all shirts first, then all pants — but only the products Step 1
    // actually produced for this design (shirt-only / pant-only / both).
    // -------------------------------------------------------
    var KINDS  = [{ kind: 'SHIRT', label: 'Áo' }, { kind: 'PANT', label: 'Quần' }];
    var packer = createSheetPacker();
    var placements = []; // { sheet, offset, kind, sz, sides, prefix, order }
    for (var s = 0; s < preparedSizes.length; s++) {
        var sz   = preparedSizes[s];
        var list = orders[sz];
        if (!list) continue;
        for (var t = 0; t < KINDS.length; t++) {
            var sides = productSides(sourceDoc, KINDS[t].kind, sz);
            if (sides.length === 0) continue;
            var boxes = productBoxes(sourceDoc, sz, sides);
            for (var b = 0; b < boxes.length; b++) checkFits(boxes[b], KINDS[t].label + ' size ' + sz + ' ' + sides[b]);
            var layout = productLayout(boxes); // wraps into rows when wider than a sheet
            for (var q = 0; q < list.length; q++) {
                var slot = packer.place(layout.height);
                placements.push({ sheet: slot.sheet, offset: slot.offset, kind: KINDS[t].kind, sz: sz, sides: sides,
                                  layout: layout, prefix: sz + '_' + (q + 1), order: list[q] });
            }
        }
    }
    var sheets   = packer.sheets;
    var numPages = packer.pageCount();

    // -------------------------------------------------------
    // Phase 2: build each page inside its own copy of the Large Canvas template.
    // -------------------------------------------------------
    var ts = (new Date()).getTime();

    function buildPage(pageNo) {
        var opened = openLargeCanvasCopy(template, new File(Folder.temp + '/_mk_page_' + pageNo + '_' + ts + '.ai'));
        var doc    = opened.doc, scale = opened.scale;
        function u(realPt) { return realPt / scale; } // real pt → this document's units
        var grid = sheetGrid(doc.artboards[0].artboardRect, scale);

        var pagePlacements = [];
        for (var i = 0; i < placements.length; i++) {
            if (placements[i].sheet.page === pageNo) pagePlacements.push(placements[i]);
        }

        // Bring over every master part this page needs once, so the per-order
        // duplicates below are same-document (fast).
        var keys = [];
        for (var i = 0; i < pagePlacements.length; i++) {
            for (var j = 0; j < pagePlacements[i].sides.length; j++) {
                var key = pagePlacements[i].sz + '_' + pagePlacements[i].sides[j];
                if (!contains(keys, key)) keys.push(key);
            }
        }
        var mastersLayer = doc.layers.add();
        mastersLayer.name = 'MASTERS';
        var masters = pasteParts(sourceDoc, doc, mastersLayer, keys, scale);

        var outLayer = doc.layers.add();
        outLayer.name = 'PRINT_OUTPUT';

        // Duplicate one master part for an order and fill in its texts.
        function dupPart(sz, side, instanceName, order) {
            var m = masters[sz + '_' + side];
            var g = m.design.duplicate(outLayer, ElementPlacement.PLACEATEND);  g.name = instanceName + '_FINAL';
            var o = m.outline.duplicate(outLayer, ElementPlacement.PLACEATEND); o.name = instanceName + '_OUTLINE';
            var maxW = CUSTOMER_NAME_MAX_WIDTH[sz] ? u(CUSTOMER_NAME_MAX_WIDTH[sz]) : null;
            applyField(g, TEN_TREN, order.nameAbove, maxW);
            applyField(g, TEN_DUOI, order.nameBelow, maxW);
            applyField(g, SO,       order.number,    null);

            // Keep each part-instance's _OUTLINE and _FINAL together as a single group,
            // the same way Step 1 does, so they read as one unit in the print output.
            // Outline stays on top (PLACEATBEGINNING), final below.
            var instanceGroup = outLayer.groupItems.add();
            instanceGroup.name = instanceName;
            o.move(instanceGroup, ElementPlacement.PLACEATBEGINNING);
            g.move(instanceGroup, ElementPlacement.PLACEATEND);

            return g;
        }

        // Duplicate a product's parts and move each to its place in the product's block
        // (p.layout): the block horizontally centered in the sheet, top at the slot top.
        function buildProduct(p) {
            var r    = grid.rect(p.sheet);
            var left = r[0] + u((SHEET_W - p.layout.width) / 2);
            var top  = r[1] - u(p.offset);
            for (var i = 0; i < p.sides.length; i++) {
                var part = dupPart(p.sz, p.sides[i], p.prefix + '_' + p.sides[i], p.order);
                var box  = partBounds(part);
                var dx   = (left + u(p.layout.pos[i].x)) - box.left;
                var dy   = (top  - u(p.layout.pos[i].y)) - box.top;
                // Each part is the _FINAL clip group; its parent is the _OUTLINE+_FINAL
                // instance group. Moving the parent translates outline and design together.
                var ig = part.parent;
                ig.position = [ig.position[0] + dx, ig.position[1] + dy];
            }
        }

        for (var i = 0; i < pagePlacements.length; i++) buildProduct(pagePlacements[i]);

        // One fixed-size artboard per sheet on this page.
        for (var i = 0; i < sheets.length; i++) {
            if (sheets[i].page !== pageNo) continue;
            doc.artboards.add(grid.rect(sheets[i])).name = sheetName(sheets[i].index + 1, sheets.length);
        }

        // Drop the masters and the template's own artboard, leaving only the products.
        mastersLayer.remove();
        doc.artboards.remove(0);
    }

    var prevUIL = app.userInteractionLevel;
    app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
    try {
        for (var pg = 1; pg <= numPages; pg++) buildPage(pg);
    } finally {
        app.userInteractionLevel = prevUIL;
    }

    alert('Hoàn thành! Đã tạo ' + numPages + ' tài liệu, ' + sheets.length + ' tấm in (159cm × 500cm).');
}

try {
    main();
} catch (e) {
    alert('Error: ' + e.message + '\nLine: ' + e.line);
}
