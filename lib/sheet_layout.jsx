// Print-sheet layout for nhap_ten_so.jsx and the layout engines (xep_nhanh.jsx,
// xep_toi_uu.jsx) — pure geometry, no Illustrator DOM, so it can be unit-tested under
// node --test as well as #included. Needs PT_PER_MM (config.jsx).

// Every sheet (artboard) is a fixed 159cm × 500cm. All sizes here are REAL sizes, in pt.
var SHEET_W     = 159 * 10 * PT_PER_MM;
var SHEET_H     = 500 * 10 * PT_PER_MM;
var SHEET_GAP   = 100;               // gap between sheets in the print page
var PRODUCT_GAP = 4 * PT_PER_MM;     // 5mm between products / parts in a sheet

// The print page (the one output document) holds every sheet, in a grid SHEETS_PER_ROW
// across and as many rows down as needed. A normal Illustrator canvas (max ~578cm) only
// holds 3 sheets, so the print page is a copy of a Large Canvas template: its canvas is
// CANVAS_SIZE document units square (~57m real), room for about 11 rows (66 sheets).
var SHEETS_PER_ROW = 6;
var CANVAS_SIZE    = 16383;
var CANVAS_MARGIN  = 100 * 10 * PT_PER_MM; // real pt kept clear around the grid

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

// Throw if a product or part can never fit on a sheet.
function checkFits(block, label) {
    var cm = 10 * PT_PER_MM;
    if (block.width > SHEET_W || block.height > SHEET_H) {
        throw new Error(label + ' (' + Math.round(block.width / cm) + 'cm × ' + Math.round(block.height / cm)
            + 'cm) không vừa tấm in 159cm × 500cm.');
    }
}

// Where a product's parts go within its block (nhap_ten_so.jsx). boxes are the parts'
// Step-1 bounds, { left, top, width, height } in real pt. When the Step-1 layout fits the
// sheet width, the parts keep it; otherwise (big sizes, where front | back | sleeves or
// the pant pieces in one row are wider than a sheet) they wrap into rows, in order, left
// to right with PRODUCT_GAP between them. Returns { width, height, pos } where pos[i] =
// { x, y } is part i's top-left, measured from the block's top-left (y downwards).
function productLayout(boxes) {
    var bb = unionBounds(boxes), pos = [], i;
    if (bb.width <= SHEET_W) {
        for (i = 0; i < boxes.length; i++) pos.push({ x: boxes[i].left - bb.left, y: bb.top - boxes[i].top });
        return { width: bb.width, height: bb.height, pos: pos };
    }
    var x = 0, y = 0, rowH = 0, width = 0;
    for (i = 0; i < boxes.length; i++) {
        var b = boxes[i];
        if (x > 0 && x + b.width > SHEET_W) { y += rowH + PRODUCT_GAP; x = 0; rowH = 0; }
        pos.push({ x: x, y: y });
        if (x + b.width > width) width = x + b.width;
        if (b.height > rowH) rowH = b.height;
        x += b.width + PRODUCT_GAP;
    }
    return { width: width, height: y + rowH, pos: pos };
}

// The n-th sheet (0-based) of a layout and where it goes in the print page's grid: rows
// of SHEETS_PER_ROW, top to bottom.
function makeSheet(n) {
    return { index: n, col: n % SHEETS_PER_ROW, row: Math.floor(n / SHEETS_PER_ROW) };
}

// Packs products into sheets, in order (nhap_ten_so.jsx). Products stack top to bottom
// in a sheet with PRODUCT_GAP between them; one that doesn't fit starts a new sheet.
// place(height) returns { sheet, offset }: offset is the real distance (pt) from the
// sheet top to the product top. sheets[i] is makeSheet(i) plus used (pt).
function createSheetPacker() {
    var sheets = [];
    var sheet  = null;

    return {
        sheets: sheets,
        place: function (h) {
            var gap = (sheet && sheet.used > 0) ? PRODUCT_GAP : 0;
            // 1e-6 pt of slack: summed heights carry rounding error, and a product that
            // exactly fills the rest of a sheet must still fit.
            if (!sheet || sheet.used + gap + h > SHEET_H + 1e-6) { // sheet full
                sheet = makeSheet(sheets.length);
                sheet.used = 0;
                sheets.push(sheet);
                gap = 0;
            }
            var slot = { sheet: sheet, offset: sheet.used + gap };
            sheet.used += gap + h;
            return slot;
        }
    };
}

// Where each of count sheets sits in the print page, in its units (real pt divided by
// its scale factor). The grid is centered on the template artboard abRect ([left, top,
// right, bottom]) — the canvas is centered on it, so the grid stays inside the canvas.
// Throws when count sheets need more rows than the canvas holds. rect(sheet) returns
// the sheet's artboard rect.
function sheetGrid(abRect, scale, count) {
    var cols = Math.min(Math.max(count, 1), SHEETS_PER_ROW);
    var rows = Math.max(Math.ceil(count / SHEETS_PER_ROW), 1);
    var room = CANVAS_SIZE * scale - 2 * CANVAS_MARGIN; // real pt
    var maxRows = Math.floor((room + SHEET_GAP) / (SHEET_H + SHEET_GAP));
    if (rows > maxRows) {
        throw new Error('Cần ' + count + ' tấm in, vượt quá kích thước file Large Canvas (tối đa '
            + maxRows * SHEETS_PER_ROW + ' tấm).');
    }
    var w = (cols * SHEET_W + (cols - 1) * SHEET_GAP) / scale;
    var h = (rows * SHEET_H + (rows - 1) * SHEET_GAP) / scale;
    return sheetGridAt((abRect[0] + abRect[2]) / 2 - w / 2, (abRect[1] + abRect[3]) / 2 + h / 2, scale);
}

// The same grid, with its top-left sheet's top-left corner at (gridLeft, gridTop).
function sheetGridAt(gridLeft, gridTop, scale) {
    return {
        rect: function (sh) {
            var l = gridLeft + sh.col * (SHEET_W + SHEET_GAP) / scale;
            var t = gridTop  - sh.row * (SHEET_H + SHEET_GAP) / scale;
            return [l, t, l + SHEET_W / scale, t - SHEET_H / scale];
        }
    };
}

// Artboard name for the n-th sheet (1-based) out of total: zero-padded (at least 2
// digits) so a plain File ▸ Export ▸ Export As (sorted alphabetically) keeps the order.
function sheetName(n, total) {
    var width = Math.max(2, String(total).length);
    var s = String(n);
    while (s.length < width) s = '0' + s;
    return s;
}
