// Building the print page from a print command (CSV), shared by nhap_ten_so.jsx and
// xep_don_so_luong.jsx. Needs names.jsx, config.jsx, utils.jsx, print_command.jsx,
// print_dialogs.jsx, sheet_layout.jsx, step1_parts.jsx, large_canvas.jsx.

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

// Gap between the digits of a vector SO, as a fraction of the number's tallest digit.
var SO_DIGIT_GAP = 0.1;

// The prepared digits of a pasted vector digit set (SO_AO / SO_QUAN, named name;
// validate.jsx checks the design has them all): { '0': { item, bounds }, … }, bounds
// the digit's visibleBounds.
function soDigits(soVector, name) {
    var digits = {};
    for (var d = 0; d <= 9; d++) {
        var item = requireItem(soVector.pageItems, String(d), name);
        digits[d] = { item: item, bounds: item.visibleBounds };
    }
    return digits;
}

// The SO text frames inside container, in findAllItemsByName order.
function soTextFrames(container) {
    var all = findAllItemsByName(container, SO), frames = [];
    for (var i = 0; i < all.length; i++) if (all[i].typename === 'TextFrame') frames.push(all[i]);
    return frames;
}

// The box each SO text frame in container marks out for a vector number, in
// soTextFrames order: its visible glyphs (the frame's own box reaches the font's
// ascender and descender lines), or the frame's box when it has no glyphs to outline.
function soBoxes(container) {
    var frames = soTextFrames(container), boxes = [];
    for (var i = 0; i < frames.length; i++) {
        var box = frames[i].geometricBounds;
        try {
            var outlined = frames[i].duplicate().createOutline();
            var vb = outlined.visibleBounds;
            outlined.remove();
            if (vb[2] - vb[0] > 0 && vb[1] - vb[3] > 0) box = vb;
        } catch (e) { /* empty text: keep the frame's box */ }
        boxes.push(box);
    }
    return boxes;
}

// The vector counterpart of applyField for SO: replace each SO text frame in container
// with value built from digits (soDigits), fitted inside the frame's box (boxes, from
// soBoxes on the master container was duplicated from — the same place, as it hasn't
// moved yet) and centered on it; or remove the frames when value is empty.
function applyVectorNumber(container, value, digits, boxes) {
    var frames = soTextFrames(container);
    for (var i = 0; i < frames.length; i++) {
        var f = frames[i];
        if (value !== null && value !== '') {
            var num = buildVectorNumber(value, digits, f.layer, boxes[i]);
            num.move(f, ElementPlacement.PLACEBEFORE);
        }
        f.remove();
    }
}

// A group named SO of value's digits side by side, bottoms aligned, scaled uniformly
// to the largest size that fits inside box ([left, top, right, bottom]) and centered
// on it. Built in layer, starting at the box so it stays on the canvas.
function buildVectorNumber(value, digits, layer, box) {
    var chars = String(value).split(''), h = 0, i, b;
    for (i = 0; i < chars.length; i++) {
        if (!/^[0-9]$/.test(chars[i])) {
            throw new Error('Số "' + value + '" có ký tự không phải chữ số — bộ số vector ('
                + SO_VECTOR_NAMES.join(', ') + ') chỉ có các số 0–9.');
        }
        b = digits[chars[i]].bounds;
        if (b[1] - b[3] > h) h = b[1] - b[3];
    }

    var group = layer.groupItems.add();
    group.name = SO;
    var x = box[0];
    for (i = 0; i < chars.length; i++) {
        b = digits[chars[i]].bounds;
        var d = digits[chars[i]].item.duplicate(group, ElementPlacement.PLACEATEND);
        d.translate(x - b[0], box[3] - b[3]);
        x += (b[2] - b[0]) + SO_DIGIT_GAP * h;
    }

    var vb = group.visibleBounds;
    var s  = Math.min((box[2] - box[0]) / (vb[2] - vb[0]), (box[1] - box[3]) / (vb[1] - vb[3])) * 100;
    group.resize(s, s, true, true, true, true, true, Transformation.CENTER);
    vb = group.visibleBounds;
    group.translate((box[0] + box[2]) / 2 - (vb[0] + vb[2]) / 2, (box[1] + box[3]) / 2 - (vb[1] + vb[3]) / 2);
    return group;
}

// Everything a print run needs before building: the sizes Step 1 prepared in sourceDoc,
// the Large Canvas template (in scriptDir/lib), and the chosen CSV's rows — only the
// chosen FORM's when it has NỮ rows, and only the chosen Mẫu's when it mixes several. Alerts and returns null when something is
// missing; null too when the person cancels. Returns { sizes, template, rows }.
function readPrintRun(sourceDoc, scriptDir) {
    var sizes = detectPreparedSizes(sourceDoc);
    if (sizes.length === 0) {
        alert('Chua co thiet ke nao. Hay chay nhay_size.jsx truoc.');
        return null;
    }

    // Blank Large Canvas document: in Illustrator, File ▸ New with a width above 578cm
    // (e.g. 1000cm × 1000cm) — Illustrator switches to Large Canvas automatically — then
    // save it here. Scripts can't create a Large Canvas document themselves.
    var template = new File(scriptDir + '/lib/large_canvas.ai');
    if (!template.exists) {
        alert('Không tìm thấy file mẫu Large Canvas: ' + template.fsName + '\n'
            + 'Tạo file mới trong Illustrator (File ▸ New) rộng hơn 578cm, ví dụ 1000cm × 1000cm, '
            + 'rồi lưu vào đường dẫn trên.');
        return null;
    }

    var file = selectPrintCommandFile();
    if (!file) return null; // cancelled

    var rows = parsePrintCommand(file);
    if (rows.length === 0) { alert('Khong tim thay dong du lieu nao trong file.'); return null; }

    // If the CSV has FORM NỮ rows, ask NAM or NỮ and keep only those rows (NAM = the
    // rest). Done before Mẫu so the Mẫu choice only lists the chosen form's values.
    if (hasFemaleForm(rows)) {
        var female = selectForm();
        if (female == null) return null; // cancelled
        rows = filterByForm(rows, female);
        if (rows.length === 0) { alert('Khong co dong du lieu nao cho form da chon.'); return null; }
    }

    // If the CSV mixes several Mẫu, ask which one to print and keep only its rows.
    // A single distinct value (incl. no Mẫu column / all blank) needs no prompt.
    var distinct = distinctVariant(rows);
    if (distinct.length > 1) {
        var chosen = selectVariant(distinct);
        if (chosen == null) return null; // cancelled
        rows = filterByVariant(rows, chosen);
    }
    return { sizes: sizes, template: template, rows: rows };
}

// Build the print page: every order of orders ({ size: [orders] }, sizes in sizes'
// order) gets a copy of each of its product's Step-1 parts from sourceDoc, its texts
// filled in, packed in order onto 159cm × 500cm sheets. The page is a copy of template,
// left open. Returns { doc (the page), sheets (count) }.
function buildPrintPage(sourceDoc, template, sizes, orders) {
    // Assign every product to a sheet + slot, using the master sizes (no duplication
    // needed — a duplicate is identical to its master).
    // Per size: all shirts first, then all pants — but only the products Step 1
    // actually produced for this design (shirt-only / pant-only / both).
    var KINDS  = [{ kind: 'SHIRT', label: 'Áo' }, { kind: 'PANT', label: 'Quần' }];
    var packer = createSheetPacker();
    var placements = []; // { sheet, offset, sz, sides, keys, layout, prefix, order }
    for (var s = 0; s < sizes.length; s++) {
        var sz   = sizes[s];
        var list = orders[sz];
        if (!list) continue;
        for (var t = 0; t < KINDS.length; t++) {
            var sides = productSides(sourceDoc, KINDS[t].kind, sz);
            if (sides.length === 0) continue;
            var boxes = productBoxes(sourceDoc, sz, sides);
            for (var b = 0; b < boxes.length; b++) checkFits(boxes[b], KINDS[t].label + ' size ' + sz + ' ' + sides[b]);
            var layout = productLayout(boxes); // wraps into rows when wider than a sheet
            var keys = [];
            for (var k = 0; k < sides.length; k++) keys.push(sz + '_' + sides[k]);
            for (var q = 0; q < list.length; q++) {
                var slot = packer.place(layout.height);
                placements.push({ sheet: slot.sheet, offset: slot.offset, sz: sz, sides: sides, keys: keys,
                                  layout: layout, prefix: sz + '_' + (q + 1), order: list[q] });
            }
        }
    }

    // Duplicate a product's parts and move each to its place in the product's block
    // (p.layout): the block horizontally centered in the sheet, top at the slot top.
    function buildProduct(page, p) {
        var r    = page.grid.rect(p.sheet);
        var left = r[0] + page.u((SHEET_W - p.layout.width) / 2);
        var top  = r[1] - page.u(p.offset);
        for (var i = 0; i < p.sides.length; i++) {
            var ig  = page.dupPart(p.sz, p.sides[i], p.prefix + '_' + p.sides[i], p.order);
            var box = partBounds(ig.pageItems[1]); // the _FINAL, below its _OUTLINE
            var dx  = (left + page.u(p.layout.pos[i].x)) - box.left;
            var dy  = (top  - page.u(p.layout.pos[i].y)) - box.top;
            ig.position = [ig.position[0] + dx, ig.position[1] + dy];
        }
    }

    var keys = [];
    for (var i = 0; i < placements.length; i++) {
        for (var j = 0; j < placements[i].keys.length; j++) {
            if (!contains(keys, placements[i].keys[j])) keys.push(placements[i].keys[j]);
        }
    }
    var doc = buildPage(sourceDoc, template, packer.sheets, keys, function (page) {
        for (var i = 0; i < placements.length; i++) buildProduct(page, placements[i]);
    });
    return { doc: doc, sheets: packer.sheets.length };
}

// Build the print page of a layout engine's layout ({ sheets, placements: [{ sheet, x,
// y, rot, data: { sz, n, side } }] }, x/y real pt from the sheet's top-left, rot 0/180,
// as layoutNest gives) straight from the Step-1 parts in sourceDoc: each placement gets
// a copy of part {sz}_{side}, named {sz}_{n}_{side} with its SO / TEN
// removed, turned rot° and moved so its cut outline's top-left lands at (x, y). The page
// is a copy of template, left open; returns it. Afterwards each layout placement has
// outline (its printed part's cut outline) and rect (its sheet's artboard rect).
function buildLayoutPage(sourceDoc, template, layout) {
    var BLANK = { number: '', nameAbove: '' };
    var keys = [];
    for (var i = 0; i < layout.placements.length; i++) {
        var it = layout.placements[i].data;
        if (!contains(keys, it.sz + '_' + it.side)) keys.push(it.sz + '_' + it.side);
    }

    function buildPart(page, p) {
        var it = p.data;
        var ig = page.dupPart(it.sz, it.side, it.sz + '_' + it.n + '_' + it.side, BLANK);
        if (p.rot === 180) ig.rotate(180, true, true, true, true, Transformation.CENTER);
        var vb = ig.pageItems[0].visibleBounds; // the _OUTLINE
        var r  = page.grid.rect(p.sheet);
        ig.position = [ig.position[0] + (r[0] + page.u(p.x)) - vb[0],
                       ig.position[1] + (r[1] - page.u(p.y)) - vb[1]];
        p.outline = ig.pageItems[0];
        p.rect = r;
    }

    return buildPage(sourceDoc, template, layout.sheets, keys, function (page) {
        for (var i = 0; i < layout.placements.length; i++) buildPart(page, layout.placements[i]);
    });
}

// Build the print page: a copy of template holding sheets (makeSheet's), with the
// Step-1 parts keys ({size}_{side}) pasted in from sourceDoc as masters, build(page)
// called to place the parts, then one artboard per sheet. page = { u (real pt →
// document units), grid (sheetGrid), dupPart(sz, side, instanceName, order) }. Returns
// the page document.
function buildPage(sourceDoc, template, sheets, keys, build) {
    var prevUIL = app.userInteractionLevel;
    app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
    try {
        return makePage();
    } finally {
        app.userInteractionLevel = prevUIL;
    }

    function makePage() {
        var opened = openLargeCanvasCopy(template, new File(Folder.temp + '/_mk_page_' + (new Date()).getTime() + '.ai'));
        var doc    = opened.doc, scale = opened.scale;
        function u(realPt) { return realPt / scale; } // real pt → this document's units
        var grid = sheetGrid(doc.artboards[0].artboardRect, scale, sheets.length);

        // The parts go in the template's own layer: once the masters layer is gone it
        // is the page's only layer, which the layout engines read.
        var outLayer = doc.layers[0];

        // Bring over every master part once, so the per-order duplicates below are
        // same-document (fast).
        var mastersLayer = doc.layers.add();
        mastersLayer.name = 'MASTERS';
        // When Step 1 carried a vector digit set over from the design — SO_AO for the
        // shirt, SO_QUAN for the pant (their number designs differ) — every SO of that
        // product is built from it instead of being filled in as text.
        var VECTOR_SO_BY_KIND = { SHIRT: SO_AO, PANT: SO_QUAN };
        var vectorNames = [];
        for (var kind in VECTOR_SO_BY_KIND) {
            if (itemExists(sourceDoc, VECTOR_SO_BY_KIND[kind])) vectorNames.push(VECTOR_SO_BY_KIND[kind]);
        }
        var masters = pasteParts(sourceDoc, doc, mastersLayer, keys, scale, vectorNames);
        var digitsByKind = {}; // 'SHIRT' / 'PANT' → its soDigits, absent when its SO stays text
        for (kind in VECTOR_SO_BY_KIND) {
            var vn = VECTOR_SO_BY_KIND[kind];
            if (contains(vectorNames, vn)) digitsByKind[kind] = soDigits(requireItem(doc.pageItems, vn, doc.name), vn);
        }
        var boxesByKey = {}; // master key → its soBoxes, measured once


        // Duplicate one master part for an order and fill in its texts. Returns the
        // instance group: its _OUTLINE, then its _FINAL.
        function dupPart(sz, side, instanceName, order) {
            var m = masters[sz + '_' + side];
            var g = m.design.duplicate(outLayer, ElementPlacement.PLACEATEND);  g.name = instanceName + '_FINAL';
            var o = m.outline.duplicate(outLayer, ElementPlacement.PLACEATEND); o.name = instanceName + '_OUTLINE';
            var maxW = CUSTOMER_NAME_MAX_WIDTH[sz] ? u(CUSTOMER_NAME_MAX_WIDTH[sz]) : null;
            applyField(g, TEN, order.nameAbove, maxW);
            var digits = digitsByKind[sideKind(side)];
            if (digits) {
                var key = sz + '_' + side;
                if (!boxesByKey[key]) boxesByKey[key] = soBoxes(m.design);
                applyVectorNumber(g, order.number, digits, boxesByKey[key]);
            } else {
                applyField(g, SO, order.number, null);
            }

            // Keep each part-instance's _OUTLINE and _FINAL together as a single group,
            // the same way Step 1 does, so they read as one unit in the print output.
            // Outline stays on top (PLACEATBEGINNING), final below.
            var instanceGroup = outLayer.groupItems.add();
            instanceGroup.name = instanceName;
            o.move(instanceGroup, ElementPlacement.PLACEATBEGINNING);
            g.move(instanceGroup, ElementPlacement.PLACEATEND);

            return instanceGroup;
        }

        build({ u: u, grid: grid, dupPart: dupPart });

        // One fixed-size artboard per sheet.
        for (var i = 0; i < sheets.length; i++) {
            doc.artboards.add(grid.rect(sheets[i])).name = sheetName(i + 1, sheets.length);
        }

        // Drop the masters and the template's own artboard, leaving only the products.
        mastersLayer.remove();
        doc.artboards.remove(0);
        return doc;
    }
}
