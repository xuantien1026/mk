// Reading and rearranging a print page made by nhap_ten_so.jsx, for the layout engines
// (xep_nhanh.jsx, xep_toi_uu.jsx). Needs SIZES (config.jsx), requireItem (utils.jsx),
// SHEETS_PER_ROW / sheetGridAt (sheet_layout.jsx).
//
// A page document's PRINT_OUTPUT layer holds one group per printed part, named
// {size}_{n}_{side} (n = the order's number within its size), which holds
// {name}_OUTLINE (the cut line) and {name}_FINAL (the design). Its artboards are the
// sheets, numbered across all the pages of a print run.

// Every side Step 1 makes, in print order: a shirt's, then a pant's.
var PRINT_SIDES = ['FRONT', 'BACK', 'LEFT_SLEEVE', 'RIGHT_SLEEVE',
                   'LEFT_PANT', 'RIGHT_PANT', 'LEFT_PANT_1', 'LEFT_PANT_2', 'RIGHT_PANT_1', 'RIGHT_PANT_2'];
var FIRST_PANT_SIDE = 4; // index in PRINT_SIDES

function indexIn(arr, value) {
    for (var i = 0; i < arr.length; i++) if (arr[i] === value) return i;
    return -1;
}

// {size}_{n}_{side} → { sz, n, side }, or null for any other name.
function parseInstanceName(name) {
    var m = /^(.+?)_(\d+)_(.+)$/.exec(name);
    if (!m || indexIn(SIZES, m[1]) < 0 || indexIn(PRINT_SIDES, m[3]) < 0) return null;
    return { sz: m[1], n: parseInt(m[2], 10), side: m[3] };
}

// Sort items ({ sz, n, side }) into print order, like nhap_ten_so.jsx: size by size;
// within a size every order's shirt parts, then every order's pant parts.
function sortPrintOrder(items) {
    function rank(it) {
        var side = indexIn(PRINT_SIDES, it.side);
        return [indexIn(SIZES, it.sz), side < FIRST_PANT_SIDE ? 0 : 1, it.n, side];
    }
    return items.sort(function (a, b) {
        var ra = rank(a), rb = rank(b);
        for (var i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
        return 0;
    });
}

// The printed parts of a page document, in print order. Each item: { key ({size}_{side},
// the part's shape), sz, n, side, label, group, outline, w, h } — w × h the outline's
// visible box (stroke included) in real pt; scale = real pt per document unit.
function readOutputParts(doc, scale) {
    var layer = requireItem(doc.layers, 'PRINT_OUTPUT', doc.name);
    var items = [];
    for (var i = 0; i < layer.pageItems.length; i++) {
        var g = layer.pageItems[i];
        if (g.typename !== 'GroupItem') continue;
        var info = parseInstanceName(g.name);
        if (!info) continue;
        var outline = requireItem(g.pageItems, g.name + '_OUTLINE', doc.name);
        var vb = outline.visibleBounds;
        items.push({ key: info.sz + '_' + info.side, sz: info.sz, n: info.n, side: info.side, label: g.name,
                     group: g, outline: outline, w: (vb[2] - vb[0]) * scale, h: (vb[1] - vb[3]) * scale });
    }
    return sortPrintOrder(items);
}

// Where the index-th new sheet goes: SHEETS_PER_ROW across, then as many rows down as
// needed (all on this page).
function sheetSlot(index) {
    return { col: index % SHEETS_PER_ROW, row: Math.floor(index / SHEETS_PER_ROW) };
}

// The name of the index-th new sheet: the first artboard's number plus index, padded to
// its width (so numbering across page documents carries on) — or 01, 02, … when the
// first artboard isn't numbered.
function renumberedSheetName(firstName, index) {
    var numbered = /^\d+$/.test(firstName);
    var s = String((numbered ? parseInt(firstName, 10) : 1) + index);
    while (s.length < (numbered ? Math.max(2, firstName.length) : 2)) s = '0' + s;
    return s;
}

// Rearrange doc to layout ({ sheets, placements: [{ sheet, x, y, rot?, data: item }] },
// x/y real pt from the sheet's top-left): turn each part 180° when rot says so, move it
// so its cut outline's top-left lands at (x, y), then replace the artboards with one per
// sheet. The new sheets start where the first artboard was.
function applyLayout(doc, layout, scale) {
    var first = doc.artboards[0];
    var r0 = first.artboardRect;
    var grid = sheetGridAt(r0[0], r0[1], scale);
    var firstName = first.name;

    for (var i = 0; i < layout.placements.length; i++) {
        var p = layout.placements[i], ig = p.data.group;
        if (p.rot === 180) ig.rotate(180, true, true, true, true, Transformation.CENTER);
        var vb = p.data.outline.visibleBounds;
        var r = grid.rect(sheetSlot(p.sheet.index));
        var dx = (r[0] + p.x / scale) - vb[0];
        var dy = (r[1] - p.y / scale) - vb[1];
        ig.position = [ig.position[0] + dx, ig.position[1] + dy];
    }

    // A document always needs one artboard: add the new ones before removing the old.
    var old = doc.artboards.length;
    for (var s = 0; s < layout.sheets.length; s++) {
        doc.artboards.add(grid.rect(sheetSlot(s))).name = renumberedSheetName(firstName, s);
    }
    for (var k = old - 1; k >= 0; k--) doc.artboards.remove(k);
}
