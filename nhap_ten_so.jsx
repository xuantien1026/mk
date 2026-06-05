#target illustrator
#include "lib/names.jsx"
#include "lib/config.jsx"
#include "lib/utils.jsx"
#include "lib/print_command.jsx"

var PT_PER_MM = 2.83465;

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

// Ask for the printing-area width in metres. Returns the value, or null on cancel.
function getPrintWidth() {
    var dlg = new Window('dialog', 'Khổ in');
    dlg.orientation = 'row';
    dlg.alignChildren = 'center';
    dlg.add('statictext', undefined, 'Chiều rộng khổ in (mét):');
    var input = dlg.add('edittext', undefined, '1.6');
    input.preferredSize = [60, 22];
    input.active = true;
    var btns = dlg.add('group');
    btns.add('button', undefined, 'OK',     {name: 'ok'});
    btns.add('button', undefined, 'Cancel', {name: 'cancel'});

    if (dlg.show() !== 1) return null;
    var v = parseFloat(input.text);
    if (isNaN(v) || v <= 0) { alert('Chiều rộng không hợp lệ.'); return null; }
    return v;
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

    var printWidth = getPrintWidth();
    if (printWidth == null) return; // cancelled
    var artboardWidth = printWidth * 1000 * PT_PER_MM;

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

    // Each output page is a COPY of the Step-1 document, so its usable area equals the
    // Step-1 artboard — and duplicating the masters inside a copy is same-document (fast).
    var srcAB    = sourceDoc.artboards[0].artboardRect; // [left, top, right, bottom]
    var CANVAS_W = srcAB[2] - srcAB[0];
    var CANVAS_H = srcAB[1] - srcAB[3];

    if (artboardWidth > CANVAS_W) { alert('Khổ in quá lớn — tối đa khoảng 5.7 mét.'); return; }

    var padding    = 0;     // no margin between the design and its artboard edges
    var COLUMN_GAP = 100;

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
    // Phase 1: assign every artboard to a page + slot, using the master sizes (no
    // duplication needed — a duplicate is identical to its master).
    // -------------------------------------------------------
    // Block height = the parts' own Step-1 extent (union), so the artboard wraps the
    // layout as Step 1 produced it. Width comes from the user's print-width input.
    function shirtArtH(sz) {
        return unionBounds([
            vbByName(sourceDoc, sz + '_FRONT_FINAL'),
            vbByName(sourceDoc, sz + '_BACK_FINAL'),
            vbByName(sourceDoc, sz + '_LEFT_SLEEVE_FINAL'),
            vbByName(sourceDoc, sz + '_RIGHT_SLEEVE_FINAL')
        ]).height + padding * 2;
    }
    function pantArtH(sz) {
        var sides = pantSides(sourceDoc, sz), boxes = [];
        for (var i = 0; i < sides.length; i++) boxes.push(vbByName(sourceDoc, sz + '_' + sides[i] + '_FINAL'));
        return unionBounds(boxes).height + padding * 2;
    }

    var placements = []; // { page, kind, sz, prefix, name, number, left, top }
    var pgCount = 0, curTop, colLeft;
    function newPage() { pgCount++; curTop = CANVAS_H; colLeft = 0; }
    function placeSlot(artH) {
        if (curTop < CANVAS_H && artH > curTop) {                 // column full
            var nextLeft = colLeft + artboardWidth + COLUMN_GAP;
            if (nextLeft + artboardWidth > CANVAS_W) newPage();    // page full → new page
            else { colLeft = nextLeft; curTop = CANVAS_H; }
        }
        var slot = { page: pgCount, left: colLeft, top: curTop };
        curTop -= artH;
        return slot;
    }

    newPage();
    for (var s = 0; s < preparedSizes.length; s++) {
        var sz   = preparedSizes[s];
        var list = orders[sz];
        if (!list) continue;
        // Per size: pack all shirts first, then all pants — but only the parts that
        // Step 1 actually produced for this design (shirt-only / pant-only / both).
        if (hasShirtParts(sourceDoc, sz)) {
            for (var q = 0; q < list.length; q++) {
                var ss = placeSlot(shirtArtH(sz));
                placements.push({ page: ss.page, kind: 'SHIRT', sz: sz, prefix: sz + '_' + (q + 1), name: list[q].name, number: list[q].number, left: ss.left, top: ss.top });
            }
        }
        if (hasPantParts(sourceDoc, sz)) {
            for (var q = 0; q < list.length; q++) {
                var ps = placeSlot(pantArtH(sz));
                placements.push({ page: ps.page, kind: 'PANT',  sz: sz, prefix: sz + '_' + (q + 1), name: list[q].name, number: list[q].number, left: ps.left, top: ps.top });
            }
        }
    }
    var numPages = pgCount;

    // Stamp each placement with a global 1-based sequence number (placements is already
    // in creation order). Zero-padded, it becomes the artboard-name prefix so a plain
    // File ▸ Export ▸ Export As (sorted alphabetically) keeps the original order.
    var seqWidth = String(placements.length).length;
    function padSeq(n) { var s = String(n); while (s.length < seqWidth) s = '0' + s; return s; }
    for (var i = 0; i < placements.length; i++) placements[i].seq = i + 1;

    // -------------------------------------------------------
    // Phase 2: save the masters once, then build each page inside its own copy.
    // -------------------------------------------------------
    var ts         = (new Date()).getTime();
    var masterTemp = new File(Folder.temp + '/_mk_master_' + ts + '.ai');

    function buildPage(pageNo) {
        var pageFile = new File(Folder.temp + '/_mk_page_' + pageNo + '_' + ts + '.ai');
        masterTemp.copy(pageFile);
        var doc = app.open(pageFile); // independent copy — masters are same-document here

        var outLayer = doc.layers.add();
        outLayer.name = 'PRINT_OUTPUT';

        function dupPart(sz, side, instanceName, name, number) {
            var sf = requireItem(doc.pageItems, sz + '_' + side + '_FINAL',   doc.name);
            var so = requireItem(doc.pageItems, sz + '_' + side + '_OUTLINE', doc.name);
            var g = sf.duplicate(outLayer, ElementPlacement.PLACEATEND); g.name = instanceName + '_FINAL';
            var o = so.duplicate(outLayer, ElementPlacement.PLACEATEND); o.name = instanceName + '_OUTLINE';
            applyField(g, TEN, name,   CUSTOMER_NAME_MAX_WIDTH[sz]);
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
        // unit into the slot (horizontally centered in the artboard, padded from the
        // top), then frame it with an artboard of print-width × the block's own height.
        function placeBlock(parts, p, suffix) {
            var boxes = [];
            for (var i = 0; i < parts.length; i++) boxes.push(visBounds(parts[i]));
            var bb = unionBounds(boxes);

            var dx = (p.left + (artboardWidth - bb.width) / 2) - bb.left;
            var dy = (p.top - padding) - bb.top;
            // Each part is the _FINAL clip group; its parent is the _OUTLINE+_FINAL
            // instance group. Moving the parent translates outline and design together.
            for (var j = 0; j < parts.length; j++) {
                var ig = parts[j].parent;
                ig.position = [ig.position[0] + dx, ig.position[1] + dy];
            }

            doc.artboards.add([p.left, p.top, p.left + artboardWidth, p.top - (bb.height + padding * 2)]).name = padSeq(p.seq) + '_' + p.prefix + suffix;
        }

        function buildShirt(p) {
            placeBlock([
                dupPart(p.sz, 'FRONT',        p.prefix + '_FRONT',        p.name, p.number),
                dupPart(p.sz, 'BACK',         p.prefix + '_BACK',         p.name, p.number),
                dupPart(p.sz, 'LEFT_SLEEVE',  p.prefix + '_LEFT_SLEEVE',  p.name, p.number),
                dupPart(p.sz, 'RIGHT_SLEEVE', p.prefix + '_RIGHT_SLEEVE', p.name, p.number)
            ], p, '_SHIRT');
        }
        function buildPant(p) {
            var sides = pantSides(sourceDoc, p.sz), parts = [];
            for (var i = 0; i < sides.length; i++) {
                parts.push(dupPart(p.sz, sides[i], p.prefix + '_' + sides[i], p.name, p.number));
            }
            placeBlock(parts, p, '_PANT');
        }

        for (var i = 0; i < placements.length; i++) {
            var p = placements[i];
            if (p.page !== pageNo) continue;
            if (p.kind === 'SHIRT') buildShirt(p); else buildPant(p);
        }

        // Drop the masters and the original Step-1 artboard, leaving only the products.
        try { doc.layers.getByName('SIZED_OUTPUT').remove(); } catch (e) {}
        if (doc.artboards.length > 1) doc.artboards.remove(0);
    }

    var prevUIL = app.userInteractionLevel;
    app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
    try {
        sourceDoc.saveAs(masterTemp, new IllustratorSaveOptions());
        for (var pg = 1; pg <= numPages; pg++) buildPage(pg);
    } finally {
        app.userInteractionLevel = prevUIL;
    }

    alert('Hoàn thành! Đã tạo ' + numPages + ' tài liệu.');
}

try {
    main();
} catch (e) {
    alert('Error: ' + e.message + '\nLine: ' + e.line);
}
