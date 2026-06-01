#target illustrator
#include "lib/quy_uoc_ten.jsx"
#include "lib/cau_hinh.jsx"

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
function detectPreparedSizes() {
    var prepared = [];
    for (var i = 0; i < SIZES.length; i++) {
        try {
            app.activeDocument.pageItems.getByName(SIZES[i] + '_BACK_FINAL');
            prepared.push(SIZES[i]);
        } catch (e) { /* not found */ }
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

// Minimal RFC-4180 CSV parser: handles quoted fields, escaped "" quotes,
// embedded commas/newlines, and \r\n or \n line endings.
function parseCsv(text) {
    var rows = [], row = [], field = '', inQuotes = false;
    for (var i = 0; i < text.length; i++) {
        var ch = text.charAt(i);
        if (inQuotes) {
            if (ch === '"') {
                if (text.charAt(i + 1) === '"') { field += '"'; i++; }
                else inQuotes = false;
            } else field += ch;
        } else if (ch === '"') {
            inQuotes = true;
        } else if (ch === ',') {
            row.push(field); field = '';
        } else if (ch === '\n') {
            row.push(field); rows.push(row); row = []; field = '';
        } else if (ch !== '\r') {
            field += ch;
        }
    }
    row.push(field); rows.push(row);
    return rows;
}

// Lowercase + strip Vietnamese diacritics so header matching is case/accent
// insensitive (and the patterns below stay plain ASCII).
function foldAscii(s) {
    s = s.replace(/^\s+|\s+$/g, '').toLowerCase();
    var groups = {
        'a': 'àáạảãâầấậẩẫăằắặẳẵ',
        'e': 'èéẹẻẽêềếệểễ',
        'i': 'ìíịỉĩ',
        'o': 'òóọỏõôồốộổỗơờớợởỡ',
        'u': 'ùúụủũưừứựửữ',
        'y': 'ỳýỵỷỹ',
        'd': 'đ'
    };
    var out = '';
    for (var i = 0; i < s.length; i++) {
        var ch = s.charAt(i), rep = ch;
        for (var base in groups) {
            if (groups[base].indexOf(ch) !== -1) { rep = base; break; }
        }
        out += rep;
    }
    return out;
}

function trimCell(cells, idx) {
    if (idx < 0 || idx >= cells.length) return '';
    return cells[idx].replace(/^\s+|\s+$/g, '');
}

// Read the CSV, locate the header row by its Size / Số Áo / Tên In Trên Áo
// columns, and return the order rows as [{ size, name, number }].
function parsePrintCommand(file) {
    file.encoding = 'UTF-8';
    if (!file.open('r')) throw new Error('Khong mo duoc file: ' + file.fsName);
    var text = file.read();
    file.close();
    if (text.length && text.charCodeAt(0) === 0xFEFF) text = text.substring(1); // strip BOM

    var rows = parseCsv(text);

    var HDR_SIZE = 'size', HDR_SO = 'so ao', HDR_TEN = 'ten in tren ao';
    var headerRow = -1, sizeCol = -1, soCol = -1, tenCol = -1;
    for (var r = 0; r < rows.length && headerRow === -1; r++) {
        var sCol = -1, nCol = -1, tCol = -1;
        for (var c = 0; c < rows[r].length; c++) {
            var key = foldAscii(rows[r][c]);
            if      (key === HDR_SIZE) sCol = c;
            else if (key === HDR_SO)   nCol = c;
            else if (key === HDR_TEN)  tCol = c;
        }
        if (sCol !== -1 && nCol !== -1) { headerRow = r; sizeCol = sCol; soCol = nCol; tenCol = tCol; }
    }
    if (headerRow === -1) throw new Error('Khong tim thay bang du lieu (thieu cot Size / So Ao) trong file CSV.');

    var orders = [];
    for (var r = headerRow + 1; r < rows.length; r++) {
        var size = trimCell(rows[r], sizeCol).toUpperCase();
        if (size === '') continue; // not an order row
        orders.push({
            size:   size,
            number: trimCell(rows[r], soCol),
            name:   tenCol !== -1 ? trimCell(rows[r], tenCol) : ''
        });
    }
    return orders;
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

function findAllItemsByName(container, name, results) {
    if (!results) results = [];
    for (var i = 0; i < container.pageItems.length; i++) {
        var item = container.pageItems[i];
        if (item.name === name) results.push(item);
        if (item.typename === 'GroupItem') findAllItemsByName(item, name, results);
    }
    return results;
}

function contains(arr, value) {
    for (var i = 0; i < arr.length; i++) if (arr[i] === value) return true;
    return false;
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

    var padding    = 40;
    var spacing    = 40;
    var COLUMN_GAP = 100;

    // A clipped group's raw bounds include artwork hidden by the mask; the clip path
    // (pageItems[0]) is the true visible extent. Measure that for layout/sizing.
    function visBounds(group) {
        var p = (group.typename === 'GroupItem' && group.clipped && group.pageItems.length > 0)
            ? group.pageItems[0]
            : group;
        var b = p.geometricBounds; // [left, top, right, bottom]
        return { left: b[0], top: b[1], width: b[2] - b[0], height: b[1] - b[3] };
    }
    function vbByName(doc, name) {
        return visBounds(requireItem(doc.pageItems, name, doc.name));
    }

    // -------------------------------------------------------
    // Phase 1: assign every artboard to a page + slot, using the master sizes (no
    // duplication needed — a duplicate is identical to its master).
    // -------------------------------------------------------
    function shirtArtH(sz) {
        var f  = vbByName(sourceDoc, sz + '_FRONT_FINAL'),  b  = vbByName(sourceDoc, sz + '_BACK_FINAL');
        var ls = vbByName(sourceDoc, sz + '_LEFT_SLEEVE_FINAL'), rs = vbByName(sourceDoc, sz + '_RIGHT_SLEEVE_FINAL');
        return Math.max(f.height, b.height, ls.height + spacing + rs.height) + padding * 2;
    }
    function pantArtH(sz) {
        var l = vbByName(sourceDoc, sz + '_LEFT_PANT_FINAL'), r = vbByName(sourceDoc, sz + '_RIGHT_PANT_FINAL');
        return Math.max(l.height, r.height) + padding * 2;
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
        for (var q = 0; q < list.length; q++) {
            var prefix = sz + '_' + (q + 1);
            var ss = placeSlot(shirtArtH(sz));
            placements.push({ page: ss.page, kind: 'SHIRT', sz: sz, prefix: prefix, name: list[q].name, number: list[q].number, left: ss.left, top: ss.top });
            var ps = placeSlot(pantArtH(sz));
            placements.push({ page: ps.page, kind: 'PANT',  sz: sz, prefix: prefix, name: list[q].name, number: list[q].number, left: ps.left, top: ps.top });
        }
    }
    var numPages = pgCount;

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
        function moveWithOutline(group, newX, newY) {
            var vb = visBounds(group);
            var dx = newX - vb.left, dy = newY - vb.top;
            group.position = [group.position[0] + dx, group.position[1] + dy];
            var outline = doc.pageItems.getByName(group.name.replace('_FINAL', '_OUTLINE'));
            outline.position = [outline.position[0] + dx, outline.position[1] + dy];
        }

        function buildShirt(p) {
            var f  = vbByName(doc, p.sz + '_FRONT_FINAL'),  b  = vbByName(doc, p.sz + '_BACK_FINAL');
            var ls = vbByName(doc, p.sz + '_LEFT_SLEEVE_FINAL'), rs = vbByName(doc, p.sz + '_RIGHT_SLEEVE_FINAL');
            var sleeveColH = ls.height + spacing + rs.height;
            var sleeveColW = Math.max(ls.width, rs.width);
            var contentW = f.width + spacing + b.width + spacing + sleeveColW;
            var contentH = Math.max(f.height, b.height, sleeveColH);

            var fG  = dupPart(p.sz, 'FRONT',        p.prefix + '_FRONT',        p.name, p.number);
            var bG  = dupPart(p.sz, 'BACK',         p.prefix + '_BACK',         p.name, p.number);
            var lsG = dupPart(p.sz, 'LEFT_SLEEVE',  p.prefix + '_LEFT_SLEEVE',  p.name, p.number);
            var rsG = dupPart(p.sz, 'RIGHT_SLEEVE', p.prefix + '_RIGHT_SLEEVE', p.name, p.number);

            var startX = p.left + (artboardWidth - contentW) / 2;
            var top    = p.top - padding;
            var sleeveColX   = startX + f.width + spacing + b.width + spacing;
            var sleeveColTop = top - (contentH - sleeveColH) / 2;
            moveWithOutline(fG,  startX,                                 top - (contentH - f.height) / 2);
            moveWithOutline(bG,  startX + f.width + spacing,             top - (contentH - b.height) / 2);
            moveWithOutline(lsG, sleeveColX + (sleeveColW - ls.width)/2, sleeveColTop);
            moveWithOutline(rsG, sleeveColX + (sleeveColW - rs.width)/2, sleeveColTop - ls.height - spacing);

            doc.artboards.add([p.left, p.top, p.left + artboardWidth, p.top - (contentH + padding * 2)]).name = p.prefix + '_SHIRT';
        }
        function buildPant(p) {
            var l = vbByName(doc, p.sz + '_LEFT_PANT_FINAL'), r = vbByName(doc, p.sz + '_RIGHT_PANT_FINAL');
            var contentW = l.width + spacing + r.width;
            var contentH = Math.max(l.height, r.height);

            var lG = dupPart(p.sz, 'LEFT_PANT',  p.prefix + '_LEFT_PANT',  p.name, p.number);
            var rG = dupPart(p.sz, 'RIGHT_PANT', p.prefix + '_RIGHT_PANT', p.name, p.number);

            var startX = p.left + (artboardWidth - contentW) / 2;
            var top    = p.top - padding;
            moveWithOutline(lG, startX,                     top - (contentH - l.height) / 2);
            moveWithOutline(rG, startX + l.width + spacing, top - (contentH - r.height) / 2);

            doc.artboards.add([p.left, p.top, p.left + artboardWidth, p.top - (contentH + padding * 2)]).name = p.prefix + '_PANT';
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
