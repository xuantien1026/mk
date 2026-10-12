#target illustrator
#include "lib/names.jsx"
#include "lib/config.jsx"
#include "lib/utils.jsx"
#include "lib/print_command.jsx"

var PT_PER_MM = 2.83465;

// Print sheet: every artboard is a fixed 159cm × 500cm. Products are stacked top to
// bottom inside a sheet; when the next one doesn't fit, a new sheet is started.
// All sizes here are REAL sizes, in points.
var SHEET_W     = 159 * 10 * PT_PER_MM;
var SHEET_H     = 500 * 10 * PT_PER_MM;
var SHEET_GAP   = 100;               // gap between sheets on a page
var PRODUCT_GAP = 3 * PT_PER_MM;     // 3mm between products stacked in a sheet

// Sheets per output document, as a grid: SHEETS_PER_ROW across × SHEET_ROWS down.
// A normal Illustrator canvas (max ~578cm) only holds 3 sheets, so every output document
// is a copy of a Large Canvas template (up to ~57m). 12 sheets ≈ 10m × 10m.
var SHEETS_PER_ROW = 6;
var SHEET_ROWS     = 2;

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

// -------------------------------------------------------
// Detect which sizes were prepared in Step 1
// -------------------------------------------------------
// True if a page item with this name exists anywhere in the document.
function itemExists(doc, name) {
    try { doc.pageItems.getByName(name); return true; } catch (e) { return false; }
}

// The pant part "sides" Step 1 produced for a size — the 4-shape split (two pieces per
// leg) or the original 2-shape pant. Empty when the size has no pant parts.
function pantSides(doc, sz) {
    if (itemExists(doc, sz + '_LEFT_PANT_1_FINAL'))
        return ['LEFT_PANT_1', 'LEFT_PANT_2', 'RIGHT_PANT_1', 'RIGHT_PANT_2'];
    if (itemExists(doc, sz + '_LEFT_PANT_FINAL'))
        return ['LEFT_PANT', 'RIGHT_PANT'];
    return [];
}

// A size counts as prepared if Step 1 produced its shirt parts and/or its pant parts.
function hasShirtParts(doc, sz) { return itemExists(doc, sz + '_BACK_FINAL'); }
function hasPantParts(doc, sz)  { return pantSides(doc, sz).length > 0; }

function detectPreparedSizes() {
    var prepared = [];
    for (var i = 0; i < SIZES.length; i++) {
        if (hasShirtParts(app.activeDocument, SIZES[i]) || hasPantParts(app.activeDocument, SIZES[i])) {
            prepared.push(SIZES[i]);
        }
    }
    return prepared;
}

// -------------------------------------------------------
// Print command (CSV): pick the file and parse the order table
// -------------------------------------------------------
function selectPrintCommandFile() {
    return File.openDialog('Chọn file lệnh in (CSV)', 'CSV:*.csv,All files:*.*');
}

// Ask which Mẫu to print when the CSV mixes several. values is the list of raw
// Mẫu strings (a blank '' is shown as "Trống"). Returns the chosen raw string,
// or null on cancel.
function selectVariant(values) {
    var dlg = new Window('dialog', 'Chọn mẫu');
    dlg.orientation = 'column';
    dlg.alignChildren = 'fill';
    dlg.add('statictext', undefined, 'Chọn mẫu cần in:');

    var labels = [];
    for (var i = 0; i < values.length; i++) labels.push(values[i] === '' ? 'Trống' : values[i]);
    var dd = dlg.add('dropdownlist', undefined, labels);
    dd.selection = 0;

    var btns = dlg.add('group');
    btns.alignment = 'center';
    btns.add('button', undefined, 'OK',     {name: 'ok'});
    btns.add('button', undefined, 'Cancel', {name: 'cancel'});

    if (dlg.show() !== 1) return null;
    return values[dd.selection.index];
}

// Read the CSV and delegate parsing to parseOrders (lib/print_command.jsx).
function parsePrintCommand(file) {
    file.encoding = 'UTF-8';
    if (!file.open('r')) throw new Error('Khong mo duoc file: ' + file.fsName);
    var text = file.read();
    file.close();
    return parseOrders(text);
}

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------

function requireItem(collection, name, fileName) {
    try {
        return collection.getByName(name);
    } catch (e) {
        throw new Error('Khong tim thay "' + name + '" trong file ' + fileName);
    }
}

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
    var preparedSizes = detectPreparedSizes();
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
        var filtered = [];
        for (var i = 0; i < rows.length; i++) if (rows[i].variant === chosen) filtered.push(rows[i]);
        rows = filtered;
    }

    // Group orders by size, ignoring any size that was not prepared in Step 1.
    var orders = {};
    for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        if (!contains(preparedSizes, r.size)) continue;
        if (!orders[r.size]) orders[r.size] = [];
        orders[r.size].push(r);
    }

    var totalQty = 0;
    for (var k in orders) totalQty += orders[k].length;
    if (totalQty === 0) { alert('Khong co don hang nao khop size da chuan bi.'); return; }

    var sourceDoc = app.activeDocument; // the Step-1 masters document

    // The _OUTLINE is the sibling of the _FINAL clip group inside their instance group.
    function outlineOf(group) {
        var ig = group.parent;
        return (ig.pageItems[0] === group) ? ig.pageItems[1] : ig.pageItems[0];
    }
    // Measure a part by its cut OUTLINE's visibleBounds (stroke included) — the same as
    // Step 1 — so sizing/placement sits between the actual cut lines, not the design,
    // and the stroke isn't clipped by the artboard edge.
    function visBounds(group) {
        var b = outlineOf(group).visibleBounds; // [left, top, right, bottom], includes stroke
        return { left: b[0], top: b[1], width: b[2] - b[0], height: b[1] - b[3] };
    }
    function vbByName(doc, name) {
        return visBounds(requireItem(doc.pageItems, name, doc.name));
    }
    // Union of several { left, top, width, height } boxes into one bounding box.
    function unionBounds(boxes) {
        var left = Infinity, top = -Infinity, right = -Infinity, bottom = Infinity;
        for (var i = 0; i < boxes.length; i++) {
            var b = boxes[i];
            if (b.left < left) left = b.left;
            if (b.top > top) top = b.top;
            if (b.left + b.width > right) right = b.left + b.width;
            if (b.top - b.height < bottom) bottom = b.top - b.height;
        }
        return { left: left, top: top, width: right - left, height: top - bottom };
    }

    // -------------------------------------------------------
    // Phase 1: assign every product to a sheet + slot, using the master sizes (no
    // duplication needed — a duplicate is identical to its master).
    // -------------------------------------------------------
    // A product's footprint = its parts' own Step-1 extent (union), so the parts keep
    // the layout Step 1 produced.
    function shirtBlock(sz) {
        return unionBounds([
            vbByName(sourceDoc, sz + '_FRONT_FINAL'),
            vbByName(sourceDoc, sz + '_BACK_FINAL'),
            vbByName(sourceDoc, sz + '_LEFT_SLEEVE_FINAL'),
            vbByName(sourceDoc, sz + '_RIGHT_SLEEVE_FINAL')
        ]);
    }
    function pantBlock(sz) {
        var sides = pantSides(sourceDoc, sz), boxes = [];
        for (var i = 0; i < sides.length; i++) boxes.push(vbByName(sourceDoc, sz + '_' + sides[i] + '_FINAL'));
        return unionBounds(boxes);
    }
    function checkFits(block, label) {
        var cm = 10 * PT_PER_MM;
        if (block.width > SHEET_W || block.height > SHEET_H) {
            throw new Error(label + ' (' + Math.round(block.width / cm) + 'cm × ' + Math.round(block.height / cm)
                + 'cm) không vừa tấm in 159cm × 500cm.');
        }
    }

    // Sheets fill a page's grid row by row (SHEETS_PER_ROW × SHEET_ROWS); a full page
    // starts a new document. Inside a sheet, products stack top to bottom with
    // PRODUCT_GAP between them. A slot's `offset` is the real distance (pt) from the
    // sheet top to the product top — page coordinates are only known in Phase 2.
    var SHEETS_PER_PAGE = SHEETS_PER_ROW * SHEET_ROWS;
    var placements = []; // { sheet, kind, sz, prefix, name, number, offset }
    var sheets     = []; // { index, page, col, row, used }
    var sheet      = null;
    function newSheet() {
        var n    = sheets.length;
        var slot = n % SHEETS_PER_PAGE;
        sheet = { index: n, page: Math.floor(n / SHEETS_PER_PAGE) + 1,
                  col: slot % SHEETS_PER_ROW, row: Math.floor(slot / SHEETS_PER_ROW), used: 0 };
        sheets.push(sheet);
    }
    function placeSlot(h) {
        var gap = (sheet && sheet.used > 0) ? PRODUCT_GAP : 0;
        if (!sheet || sheet.used + gap + h > SHEET_H) { newSheet(); gap = 0; } // sheet full
        var slot = { sheet: sheet, offset: sheet.used + gap };
        sheet.used += gap + h;
        return slot;
    }

    for (var s = 0; s < preparedSizes.length; s++) {
        var sz   = preparedSizes[s];
        var list = orders[sz];
        if (!list) continue;
        // Per size: pack all shirts first, then all pants — but only the parts that
        // Step 1 actually produced for this design (shirt-only / pant-only / both).
        if (hasShirtParts(sourceDoc, sz)) {
            var sb = shirtBlock(sz);
            checkFits(sb, 'Áo size ' + sz);
            for (var q = 0; q < list.length; q++) {
                var ss = placeSlot(sb.height);
                placements.push({ sheet: ss.sheet, kind: 'SHIRT', sz: sz, prefix: sz + '_' + (q + 1), name: list[q].name, number: list[q].number, offset: ss.offset });
            }
        }
        if (hasPantParts(sourceDoc, sz)) {
            var pb = pantBlock(sz);
            checkFits(pb, 'Quần size ' + sz);
            for (var q = 0; q < list.length; q++) {
                var ps = placeSlot(pb.height);
                placements.push({ sheet: ps.sheet, kind: 'PANT',  sz: sz, prefix: sz + '_' + (q + 1), name: list[q].name, number: list[q].number, offset: ps.offset });
            }
        }
    }
    var numPages = sheet.page;

    // Name each sheet's artboard with its global 1-based sequence number, zero-padded,
    // so a plain File ▸ Export ▸ Export As (sorted alphabetically) keeps the order.
    var seqWidth = Math.max(2, String(sheets.length).length);
    function padSeq(n) { var s = String(n); while (s.length < seqWidth) s = '0' + s; return s; }

    // -------------------------------------------------------
    // Phase 2: build each page inside its own copy of the Large Canvas template.
    // -------------------------------------------------------
    var ts = (new Date()).getTime();

    function buildPage(pageNo) {
        var pageFile = new File(Folder.temp + '/_mk_page_' + pageNo + '_' + ts + '.ai');
        template.copy(pageFile);
        var doc = app.open(pageFile); // independent copy — the template is never modified

        // A Large Canvas document is scaled 1:scaleFactor (10): scripting reads and writes
        // every coordinate and size there at 1/scaleFactor of its real value. Convert
        // real points to this document's units with u().
        var scale = doc.scaleFactor;
        if (!scale || scale <= 1) {
            throw new Error('File mẫu ' + template.fsName + ' không phải Large Canvas. '
                + 'Tạo lại file mới (File ▸ New) rộng hơn 578cm.');
        }
        function u(realPt) { return realPt / scale; }

        // Center the sheet grid on the template's artboard: the canvas is centered on
        // it, so the grid stays well inside the canvas.
        var tAB      = doc.artboards[0].artboardRect; // [left, top, right, bottom]
        var gridW    = u(SHEETS_PER_ROW * SHEET_W + (SHEETS_PER_ROW - 1) * SHEET_GAP);
        var gridH    = u(SHEET_ROWS     * SHEET_H + (SHEET_ROWS     - 1) * SHEET_GAP);
        var gridLeft = (tAB[0] + tAB[2]) / 2 - gridW / 2;
        var gridTop  = (tAB[1] + tAB[3]) / 2 + gridH / 2;
        function sheetLeft(sh) { return gridLeft + sh.col * u(SHEET_W + SHEET_GAP); }
        function sheetTop(sh)  { return gridTop  - sh.row * u(SHEET_H + SHEET_GAP); }

        var mastersLayer = doc.layers.add();
        mastersLayer.name = 'MASTERS';
        var outLayer = doc.layers.add();
        outLayer.name = 'PRINT_OUTPUT';

        // Bring every master part this page needs (each _OUTLINE+_FINAL instance group)
        // over from the Step-1 document in one clipboard copy/paste, so the per-order
        // duplicates are same-document (fast). Copy/paste is the only route that keeps
        // the real size: duplicate() into a Large Canvas keeps the numbers (10× too big),
        // and resize() to undo that thins text strokes to 1/100.
        var keys = [], masters = {};
        for (var i = 0; i < placements.length; i++) {
            var pl = placements[i];
            if (pl.sheet.page !== pageNo) continue;
            var sides = (pl.kind === 'SHIRT') ? ['FRONT', 'BACK', 'LEFT_SLEEVE', 'RIGHT_SLEEVE'] : pantSides(sourceDoc, pl.sz);
            for (var j = 0; j < sides.length; j++) {
                var key = pl.sz + '_' + sides[j];
                if (!contains(keys, key)) keys.push(key);
            }
        }

        app.activeDocument = sourceDoc;
        sourceDoc.selection = null;
        for (var i = 0; i < keys.length; i++) {
            requireItem(sourceDoc.pageItems, keys[i] + '_FINAL', sourceDoc.name).parent.selected = true;
        }
        if (sourceDoc.selection.length !== keys.length) {
            sourceDoc.selection = null;
            throw new Error('Không chọn được các chi tiết trong ' + sourceDoc.name + ' để sao chép. Hãy mở khóa / hiện layer SIZED_OUTPUT.');
        }
        app.copy();
        sourceDoc.selection = null; // a lingering selection here blocks selecting in other docs

        app.activeDocument = doc;
        doc.activeLayer = mastersLayer;
        app.paste();
        doc.selection = null;

        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var m = {
                design:  requireItem(doc.pageItems, key + '_FINAL',   doc.name),
                outline: requireItem(doc.pageItems, key + '_OUTLINE', doc.name)
            };
            // The copy must keep its real size. Fail loudly (with the numbers) rather
            // than print at the wrong size.
            var srcW  = vbByName(sourceDoc, key + '_FINAL').width;
            var copyW = visBounds(m.design).width * scale;
            if (Math.abs(copyW - srcW) > srcW * 0.01) {
                throw new Error('Kích thước ' + key + ' bị thay đổi khi chép sang Large Canvas: '
                    + srcW.toFixed(1) + 'pt → ' + copyW.toFixed(1) + 'pt (scaleFactor ' + scale + ').');
            }
            masters[key] = m;
        }

        function dupPart(sz, side, instanceName, name, number) {
            var m = masters[sz + '_' + side];
            var g = m.design.duplicate(outLayer, ElementPlacement.PLACEATEND);   g.name = instanceName + '_FINAL';
            var o = m.outline.duplicate(outLayer, ElementPlacement.PLACEATEND); o.name = instanceName + '_OUTLINE';
            var maxW = CUSTOMER_NAME_MAX_WIDTH[sz];
            applyField(g, TEN, name,   maxW ? u(maxW) : null);
            applyField(g, SO,  number, null);

            // Keep each part-instance's _OUTLINE and _FINAL together as a single group,
            // the same way Step 1 does, so they read as one unit in the print output.
            // Outline stays on top (PLACEATBEGINNING), final below.
            var instanceGroup = outLayer.groupItems.add();
            instanceGroup.name = instanceName;
            o.move(instanceGroup, ElementPlacement.PLACEATBEGINNING);
            g.move(instanceGroup, ElementPlacement.PLACEATEND);

            return g;
        }
        // The parts keep their Step-1 relative layout. Translate the whole block as a
        // unit into its slot: horizontally centered in the sheet, top at the slot top.
        function placeBlock(parts, p) {
            var boxes = [];
            for (var i = 0; i < parts.length; i++) boxes.push(visBounds(parts[i]));
            var bb = unionBounds(boxes);

            var dx = (sheetLeft(p.sheet) + (u(SHEET_W) - bb.width) / 2) - bb.left;
            var dy = (sheetTop(p.sheet) - u(p.offset)) - bb.top;
            // Each part is the _FINAL clip group; its parent is the _OUTLINE+_FINAL
            // instance group. Moving the parent translates outline and design together.
            for (var j = 0; j < parts.length; j++) {
                var ig = parts[j].parent;
                ig.position = [ig.position[0] + dx, ig.position[1] + dy];
            }
        }

        function buildShirt(p) {
            placeBlock([
                dupPart(p.sz, 'FRONT',        p.prefix + '_FRONT',        p.name, p.number),
                dupPart(p.sz, 'BACK',         p.prefix + '_BACK',         p.name, p.number),
                dupPart(p.sz, 'LEFT_SLEEVE',  p.prefix + '_LEFT_SLEEVE',  p.name, p.number),
                dupPart(p.sz, 'RIGHT_SLEEVE', p.prefix + '_RIGHT_SLEEVE', p.name, p.number)
            ], p);
        }
        function buildPant(p) {
            var sides = pantSides(sourceDoc, p.sz), parts = [];
            for (var i = 0; i < sides.length; i++) {
                parts.push(dupPart(p.sz, sides[i], p.prefix + '_' + sides[i], p.name, p.number));
            }
            placeBlock(parts, p);
        }

        for (var i = 0; i < placements.length; i++) {
            var p = placements[i];
            if (p.sheet.page !== pageNo) continue;
            if (p.kind === 'SHIRT') buildShirt(p); else buildPant(p);
        }

        // One fixed-size artboard per sheet on this page.
        for (var k = 0; k < sheets.length; k++) {
            var sh = sheets[k];
            if (sh.page !== pageNo) continue;
            var l = sheetLeft(sh), t = sheetTop(sh);
            doc.artboards.add([l, t, l + u(SHEET_W), t - u(SHEET_H)]).name = padSeq(sh.index + 1);
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
