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

    var sourceDoc  = app.activeDocument;             // the Step-1 masters document
    var colorSpace = sourceDoc.documentColorSpace;

    var CANVAS     = 5.77 * 1000 * PT_PER_MM; // one fresh AI document's canvas (~5.77m square)
    if (artboardWidth > CANVAS) { alert('Khổ in quá lớn — tối đa khoảng 5.7 mét.'); return; }
    var padding    = 40;
    var spacing    = 40;
    var COLUMN_GAP = 100;

    // Output-document state — reset by startNewDoc().
    var outDoc, outLayer, currentTop, columnLeft, docCount = 0;

    function startNewDoc() {
        outDoc = app.documents.add(colorSpace, CANVAS, CANVAS);
        outDoc.artboards[0].artboardRect = [0, CANVAS, CANVAS, 0];
        outLayer = outDoc.layers[0];
        outLayer.name = 'PRINT_OUTPUT';
        currentTop = CANVAS; // top edge of the stack
        columnLeft = 0;      // left edge of the current column
        docCount++;
    }

    function finishDoc() {
        // Drop the default full-canvas artboard so only product artboards remain.
        if (outDoc.artboards.length > 1) outDoc.artboards.remove(0);
    }

    // A clipped group's raw bounds include artwork hidden by the mask; the clip path
    // (pageItems[0]) is the true visible extent. Measure that for layout/sizing.
    function visBounds(group) {
        var p = (group.typename === 'GroupItem' && group.clipped && group.pageItems.length > 0)
            ? group.pageItems[0]
            : group;
        var b = p.geometricBounds; // [left, top, right, bottom]
        return { left: b[0], top: b[1], width: b[2] - b[0], height: b[1] - b[3] };
    }

    // Visible size of a Step-1 master part — identical to its duplicate's, so we can
    // measure (and decide page breaks) before duplicating.
    function srcVB(sz, side) {
        return visBounds(requireItem(sourceDoc.pageItems, sz + '_' + side + '_FINAL', sourceDoc.name));
    }

    // Duplicate a Step-1 master (and its outline) into the current output document,
    // stamping the name/number wherever those frames appear (removing them when blank).
    function dup(sz, side, instanceName, name, number) {
        var sf = requireItem(sourceDoc.pageItems, sz + '_' + side + '_FINAL',   sourceDoc.name);
        var so = requireItem(sourceDoc.pageItems, sz + '_' + side + '_OUTLINE', sourceDoc.name);
        var g = sf.duplicate(outLayer, ElementPlacement.PLACEATEND); g.name = instanceName + '_FINAL';
        var o = so.duplicate(outLayer, ElementPlacement.PLACEATEND); o.name = instanceName + '_OUTLINE';
        applyField(g, TEN, name,   CUSTOMER_NAME_MAX_WIDTH[sz]);
        applyField(g, SO,  number, null);
        return g;
    }

    // Move a clip group so its VISIBLE top-left lands at (newX, newY); the matching
    // _OUTLINE shifts by the same delta.
    function moveWithOutline(group, newX, newY) {
        var vb = visBounds(group);
        var deltaX = newX - vb.left;
        var deltaY = newY - vb.top;
        group.position = [group.position[0] + deltaX, group.position[1] + deltaY];
        var outline = outDoc.pageItems.getByName(group.name.replace('_FINAL', '_OUTLINE'));
        outline.position = [outline.position[0] + deltaX, outline.position[1] + deltaY];
    }

    // Reserve a slot of height artH: drop down the current column, move to the next
    // column when it overflows, and start a new document when the canvas width is full.
    function reserve(artH) {
        if (currentTop < CANVAS && artH > currentTop) {        // column full
            var nextLeft = columnLeft + artboardWidth + COLUMN_GAP;
            if (nextLeft + artboardWidth > CANVAS) {           // no more columns → new document
                finishDoc();
                startNewDoc();
            } else {
                columnLeft = nextLeft;
                currentTop = CANVAS;
            }
        }
        var slot = { left: columnLeft, top: currentTop };
        currentTop -= artH;
        return slot;
    }

    // Shirt artboard: front | back, with the two sleeves stacked in a column to the right.
    function emitShirt(sz, prefix, name, number) {
        var f = srcVB(sz, 'FRONT'), b = srcVB(sz, 'BACK');
        var ls = srcVB(sz, 'LEFT_SLEEVE'), rs = srcVB(sz, 'RIGHT_SLEEVE');
        var sleeveColH = ls.height + spacing + rs.height;
        var sleeveColW = Math.max(ls.width, rs.width);
        var contentW = f.width + spacing + b.width + spacing + sleeveColW;
        var contentH = Math.max(f.height, b.height, sleeveColH);
        var slot = reserve(contentH + padding * 2);

        var frontGrp    = dup(sz, 'FRONT',        prefix + '_FRONT',        name, number);
        var backGrp     = dup(sz, 'BACK',         prefix + '_BACK',         name, number);
        var leftSlvGrp  = dup(sz, 'LEFT_SLEEVE',  prefix + '_LEFT_SLEEVE',  name, number);
        var rightSlvGrp = dup(sz, 'RIGHT_SLEEVE', prefix + '_RIGHT_SLEEVE', name, number);

        var startX = slot.left + (artboardWidth - contentW) / 2;
        var top    = slot.top - padding;
        var sleeveColX   = startX + f.width + spacing + b.width + spacing;
        var sleeveColTop = top - (contentH - sleeveColH) / 2;
        moveWithOutline(frontGrp,    startX,                                 top - (contentH - f.height) / 2);
        moveWithOutline(backGrp,     startX + f.width + spacing,             top - (contentH - b.height) / 2);
        moveWithOutline(leftSlvGrp,  sleeveColX + (sleeveColW - ls.width)/2, sleeveColTop);
        moveWithOutline(rightSlvGrp, sleeveColX + (sleeveColW - rs.width)/2, sleeveColTop - ls.height - spacing);

        outDoc.artboards.add([slot.left, slot.top, slot.left + artboardWidth, slot.top - (contentH + padding * 2)]).name = prefix + '_SHIRT';
    }

    // Pant artboard: left | right side by side.
    function emitPant(sz, prefix, name, number) {
        var l = srcVB(sz, 'LEFT_PANT'), r = srcVB(sz, 'RIGHT_PANT');
        var contentW = l.width + spacing + r.width;
        var contentH = Math.max(l.height, r.height);
        var slot = reserve(contentH + padding * 2);

        var leftPantGrp  = dup(sz, 'LEFT_PANT',  prefix + '_LEFT_PANT',  name, number);
        var rightPantGrp = dup(sz, 'RIGHT_PANT', prefix + '_RIGHT_PANT', name, number);

        var startX = slot.left + (artboardWidth - contentW) / 2;
        var top    = slot.top - padding;
        moveWithOutline(leftPantGrp,  startX,                     top - (contentH - l.height) / 2);
        moveWithOutline(rightPantGrp, startX + l.width + spacing, top - (contentH - r.height) / 2);

        outDoc.artboards.add([slot.left, slot.top, slot.left + artboardWidth, slot.top - (contentH + padding * 2)]).name = prefix + '_PANT';
    }

    startNewDoc();
    for (var s = 0; s < preparedSizes.length; s++) {
        var sz   = preparedSizes[s];
        var list = orders[sz];
        if (!list) continue;

        for (var q = 0; q < list.length; q++) {
            var prefix = sz + '_' + (q + 1);
            emitShirt(sz, prefix, list[q].name, list[q].number);
            emitPant(sz,  prefix, list[q].name, list[q].number);
        }
    }
    finishDoc();

    alert('Hoàn thành! Đã tạo ' + docCount + ' file.');
}

try {
    main();
} catch (e) {
    alert('Error: ' + e.message + '\nLine: ' + e.line);
}
