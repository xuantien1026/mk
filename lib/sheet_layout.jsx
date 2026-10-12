// Print-sheet layout for nhap_ten_so.jsx — pure geometry, no Illustrator DOM, so it can
// be unit-tested under node --test as well as #included. Needs PT_PER_MM (config.jsx).

// Every sheet (artboard) is a fixed 159cm × 500cm. All sizes here are REAL sizes, in pt.
var SHEET_W     = 159 * 10 * PT_PER_MM;
var SHEET_H     = 500 * 10 * PT_PER_MM;
var SHEET_GAP   = 100;               // gap between sheets on a page
var PRODUCT_GAP = 3 * PT_PER_MM;     // 3mm between products stacked in a sheet

// Sheets per output document, as a grid: SHEETS_PER_ROW across × SHEET_ROWS down.
// A normal Illustrator canvas (max ~578cm) only holds 3 sheets, so every output document
// is a copy of a Large Canvas template (up to ~57m). 12 sheets ≈ 10m × 10m.
var SHEETS_PER_ROW = 6;
var SHEET_ROWS     = 2;

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

// Throw if a product's block can never fit on a sheet.
function checkFits(block, label) {
    var cm = 10 * PT_PER_MM;
    if (block.width > SHEET_W || block.height > SHEET_H) {
        throw new Error(label + ' (' + Math.round(block.width / cm) + 'cm × ' + Math.round(block.height / cm)
            + 'cm) không vừa tấm in 159cm × 500cm.');
    }
}

// Packs products into sheets, in order. Products stack top to bottom in a sheet with
// PRODUCT_GAP between them; one that doesn't fit starts a new sheet. Sheets fill a
// page's grid row by row; a full page starts a new page (output document).
// place(height) returns { sheet, offset }: offset is the real distance (pt) from the
// sheet top to the product top. sheets[i] is { index, page, col, row, used }.
function createSheetPacker() {
    var perPage = SHEETS_PER_ROW * SHEET_ROWS;
    var sheets  = [];
    var sheet   = null;

    function newSheet() {
        var n    = sheets.length;
        var slot = n % perPage;
        sheet = { index: n, page: Math.floor(n / perPage) + 1,
                  col: slot % SHEETS_PER_ROW, row: Math.floor(slot / SHEETS_PER_ROW), used: 0 };
        sheets.push(sheet);
    }

    return {
        sheets: sheets,
        place: function (h) {
            var gap = (sheet && sheet.used > 0) ? PRODUCT_GAP : 0;
            if (!sheet || sheet.used + gap + h > SHEET_H) { newSheet(); gap = 0; } // sheet full
            var slot = { sheet: sheet, offset: sheet.used + gap };
            sheet.used += gap + h;
            return slot;
        },
        pageCount: function () { return sheet ? sheet.page : 0; }
    };
}

// Where each sheet sits in a page document, in that document's units (real pt divided
// by its scale factor). The grid is centered on the template artboard abRect
// ([left, top, right, bottom]) — the canvas is centered on it, so the grid stays well
// inside the canvas. rect(sheet) returns the sheet's artboard rect.
function sheetGrid(abRect, scale) {
    var w = (SHEETS_PER_ROW * SHEET_W + (SHEETS_PER_ROW - 1) * SHEET_GAP) / scale;
    var h = (SHEET_ROWS     * SHEET_H + (SHEET_ROWS     - 1) * SHEET_GAP) / scale;
    var gridLeft = (abRect[0] + abRect[2]) / 2 - w / 2;
    var gridTop  = (abRect[1] + abRect[3]) / 2 + h / 2;
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
