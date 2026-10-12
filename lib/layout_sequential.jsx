// Layout engine 1 — simple sequential layout. Pure geometry, no Illustrator DOM, so it
// can be unit-tested under node --test as well as #included. Needs sheet_layout.jsx.
//
// The main parts (shirt fronts/backs, pant pieces) go onto shelves in the given order:
// left to right, a new shelf below when the row is full, a new sheet when the sheet is
// full. Then the sleeves, one after another in the given order, each drop into the
// space left over (under the shorter parts of a shelf, at the end of a shelf, at the
// bottom of a sheet). Parts never rotate.
//
// All coordinates are REAL pt from the sheet's top-left corner, y growing downward.
//
// PRODUCT_GAP is kept by growing every part and the sheet by the gap on their right and
// bottom: grown parts that merely don't overlap are then at least a gap apart, and a
// grown part inside the grown sheet keeps the real part inside the real sheet.

var FIT_TOLERANCE = 0.001; // pt — so an exact fit isn't lost to floating-point rounding

// parts, sleeves: [{ w, h, label, data }], each in print order. Returns
// { sheets, placements: [{ sheet, x, y, data }] } — sheets from makeSheet.
function layoutSequential(parts, sleeves) {
    var G = PRODUCT_GAP, W = SHEET_W + G + FIT_TOLERANCE, H = SHEET_H + G + FIT_TOLERANCE;
    var sheets = [], free = [], placements = []; // free[i]: free rects of sheets[i]

    function addSheet() {
        var sh = makeSheet(sheets.length);
        sheets.push(sh);
        free.push([{ x: 0, y: 0, w: W, h: H }]);
        return sh;
    }
    function put(sh, x, y, p) {
        placements.push({ sheet: sh, x: x, y: y, data: p.data });
        occupyFreeRect(free[sh.index], { x: x, y: y, w: p.w + G, h: p.h + G });
    }
    function tooBig(label) {
        return new Error(label + ' không vừa tấm in 159cm × 500cm.');
    }

    // 1. Main parts on shelves, in order.
    var sheet = null, shelfY = 0, shelfH = 0, x = 0;
    for (var i = 0; i < parts.length; i++) {
        var p = parts[i], w = p.w + G, h = p.h + G;
        if (w > W || h > H) throw tooBig(p.label);
        if (sheet && x + w > W) { shelfY += shelfH; shelfH = 0; x = 0; }   // row full
        if (!sheet || shelfY + h > H) { sheet = addSheet(); shelfY = 0; shelfH = 0; x = 0; } // sheet full
        put(sheet, x, shelfY, p);
        x += w;
        if (h > shelfH) shelfH = h;
    }

    // 2. Sleeves into the leftover space, in order: earliest sheet first, then topmost,
    // then leftmost. A new sheet only when no sheet has room.
    for (var j = 0; j < sleeves.length; j++) {
        var sl = sleeves[j];
        if (sl.w + G > W || sl.h + G > H) throw tooBig(sl.label);
        var spot = null, s = 0;
        for (; s < sheets.length; s++) {
            spot = topLeftSpot(free[s], sl.w + G, sl.h + G);
            if (spot) break;
        }
        if (!spot) spot = free[addSheet().index][0]; // s === the new sheet's index
        put(sheets[s], spot.x, spot.y, sl);
    }

    return { sheets: sheets, placements: placements };
}

// The topmost (then leftmost) free rect that can hold a w × h part, or null.
function topLeftSpot(freeRects, w, h) {
    var best = null;
    for (var i = 0; i < freeRects.length; i++) {
        var f = freeRects[i];
        if (best && (f.y > best.y || (f.y === best.y && f.x >= best.x))) continue;
        if (w <= f.w + FIT_TOLERANCE && h <= f.h + FIT_TOLERANCE) best = f;
    }
    return best;
}

// Mark rect r as used in a sheet's list of maximal free rects (MaxRects): every free rect
// r overlaps is replaced by the up-to-4 maximal pieces of it around r, then any rect
// lying inside another is dropped. Updates freeRects in place.
function occupyFreeRect(freeRects, r) {
    var pieces = [];
    for (var i = 0; i < freeRects.length; i++) {
        var f = freeRects[i];
        if (r.x >= f.x + f.w || f.x >= r.x + r.w || r.y >= f.y + f.h || f.y >= r.y + r.h) {
            pieces.push(f);
            continue;
        }
        if (r.x > f.x)             pieces.push({ x: f.x,       y: f.y,       w: r.x - f.x,             h: f.h });
        if (r.x + r.w < f.x + f.w) pieces.push({ x: r.x + r.w, y: f.y,       w: f.x + f.w - r.x - r.w, h: f.h });
        if (r.y > f.y)             pieces.push({ x: f.x,       y: f.y,       w: f.w, h: r.y - f.y });
        if (r.y + r.h < f.y + f.h) pieces.push({ x: f.x,       y: r.y + r.h, w: f.w, h: f.y + f.h - r.y - r.h });
    }
    freeRects.length = 0;
    for (var m = 0; m < pieces.length; m++) {
        var keep = true;
        for (var n = 0; n < pieces.length && keep; n++) {
            // Of two identical rects keep only the first.
            if (n !== m && rectInside(pieces[m], pieces[n]) && (n < m || !rectInside(pieces[n], pieces[m]))) keep = false;
        }
        if (keep) freeRects.push(pieces[m]);
    }
}

function rectInside(a, b) {
    return a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
}
