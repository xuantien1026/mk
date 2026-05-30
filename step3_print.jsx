#target illustrator

var PT_PER_MM = 2.83465;
var MIN_GAP   = 30 * PT_PER_MM; // 30mm minimum spacing between items and from edges

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

function duplicateTo(item, targetLayer) {
    var savedName = item.name;
    var wasLocked = targetLayer.locked;
    targetLayer.locked = false;
    var copy = item.duplicate(targetLayer, ElementPlacement.PLACEATEND);
    targetLayer.locked = wasLocked;
    item.name = savedName;
    return copy;
}

// -------------------------------------------------------
// Detect available shirts from PRINT_OUTPUT layer
// -------------------------------------------------------
function detectShirts(mainDoc) {
    var layer  = requireItem(mainDoc.layers, 'PRINT_OUTPUT', mainDoc.name);
    var shirts = [];
    for (var i = 0; i < layer.pageItems.length; i++) {
        var name = layer.pageItems[i].name;
        if (name && name.indexOf('_BACK_FINAL') !== -1) {
            shirts.push(name.replace('_BACK_FINAL', ''));
        }
    }
    return shirts;
}

// -------------------------------------------------------
// Dialog: select shirts and print width
// -------------------------------------------------------
function selectPrintOptions(shirts) {
    var dlg = new Window('dialog', 'Step 3: Chon thiet ke in');
    dlg.orientation = 'column';
    dlg.alignChildren = 'fill';

    dlg.add('statictext', undefined, 'Chon thiet ke can in (giu Ctrl de chon nhieu):');
    var list = dlg.add('listbox', [0, 0, 300, 200], shirts, {multiselect: true});

    var widthRow = dlg.add('group');
    widthRow.orientation = 'row';
    widthRow.add('statictext', undefined, 'Chieu rong ban in (met):');
    var widthInput = widthRow.add('edittext', undefined, '1.6');
    widthInput.preferredSize = [80, 20];

    var btns = dlg.add('group');
    btns.alignment = 'center';
    btns.add('button', undefined, 'OK',     {name: 'ok'});
    btns.add('button', undefined, 'Cancel', {name: 'cancel'});

    if (dlg.show() !== 1) return null;

    var selected = [];
    for (var i = 0; i < list.items.length; i++) {
        if (list.items[i].selected) selected.push(shirts[i]);
    }
    if (selected.length === 0) { alert('Chua chon thiet ke nao.'); return null; }

    var width = parseFloat(widthInput.text);
    if (isNaN(width) || width <= 0) { alert('Chieu rong khong hop le.'); return null; }

    return { shirts: selected, width: width };
}

// -------------------------------------------------------
// Packing algorithm: First Fit Decreasing Height (FFDH)
//
// Coordinate system: x from left, y from top (increases downward).
// Returns { placements: [{item, x, y}], totalHeight }
// where (x, y) is the top-left corner of each item.
// -------------------------------------------------------
function packItems(items, stripWidth, gap) {
    var sorted = items.slice();
    sorted.sort(function(a, b) { return b.height - a.height; });

    // shelves[i] = { y: top of shelf, height: tallest item placed, nextX: next free x }
    var shelves    = [];
    var placements = [];

    for (var i = 0; i < sorted.length; i++) {
        var item = sorted[i];

        if (item.width + 2 * gap > stripWidth) {
            throw new Error(
                'Vat the "' + item.label + '" rong ' + Math.round(item.width / PT_PER_MM) + 'mm ' +
                'khong vua voi chieu rong in ' + Math.round(stripWidth / PT_PER_MM) + 'mm.'
            );
        }

        var placed = false;

        // First Fit: try existing shelves in order
        for (var s = 0; s < shelves.length; s++) {
            if (shelves[s].nextX + item.width + gap <= stripWidth) {
                placements.push({ item: item, x: shelves[s].nextX, y: shelves[s].y });
                shelves[s].nextX += item.width + gap;
                if (item.height > shelves[s].height) shelves[s].height = item.height;
                placed = true;
                break;
            }
        }

        if (!placed) {
            // Open a new shelf below the previous ones
            var newY = gap;
            if (shelves.length > 0) {
                var prev = shelves[shelves.length - 1];
                newY = prev.y + prev.height + gap;
            }
            placements.push({ item: item, x: gap, y: newY });
            shelves.push({ y: newY, height: item.height, nextX: gap + item.width + gap });
        }
    }

    var totalHeight = gap;
    if (shelves.length > 0) {
        var last = shelves[shelves.length - 1];
        totalHeight = last.y + last.height + gap;
    }

    return { placements: placements, totalHeight: totalHeight };
}

// -------------------------------------------------------
// Main
// -------------------------------------------------------
function main() {
    var mainDoc = app.activeDocument;

    var shirts = detectShirts(mainDoc);
    if (shirts.length === 0) {
        alert('Khong tim thay thiet ke nao trong layer PRINT_OUTPUT.\nHay chay apply_names.jsx truoc.');
        return;
    }

    var options = selectPrintOptions(shirts);
    if (!options) return;

    var printLayer = requireItem(mainDoc.layers, 'PRINT_OUTPUT', mainDoc.name);
    var bgWidth    = options.width * 1000 * PT_PER_MM;
    var SIDES      = ['FRONT', 'BACK', 'LEFT_SLEEVE', 'RIGHT_SLEEVE'];

    // Collect all design items to pack
    var items = [];
    for (var s = 0; s < options.shirts.length; s++) {
        var prefix = options.shirts[s];
        for (var t = 0; t < SIDES.length; t++) {
            var side = SIDES[t];
            var grp  = requireItem(printLayer.pageItems, prefix + '_' + side + '_FINAL',   'PRINT_OUTPUT');
            var out  = requireItem(printLayer.pageItems, prefix + '_' + side + '_OUTLINE', 'PRINT_OUTPUT');
            items.push({
                label:  prefix + '_' + side,
                width:  grp.width,
                height: grp.height,
                srcGrp: grp,
                srcOut: out
            });
        }
    }

    // Run packing algorithm
    var packed        = packItems(items, bgWidth, MIN_GAP);
    var totalBgHeight = packed.totalHeight;

    // Create output document sized to the packed area
    var newDoc = app.documents.add(DocumentColorSpace.CMYK, bgWidth, totalBgHeight);
    newDoc.artboards[0].artboardRect = [0, totalBgHeight, bgWidth, 0];

    var outputLayer = newDoc.layers[0];
    outputLayer.name = 'PRINT_LAYOUT';

    // Switch back to read source items
    app.activeDocument = mainDoc;

    function moveGroup(grp, outline, newX, newY) {
        var dx = newX - grp.position[0];
        var dy = newY - grp.position[1];
        grp.position     = [newX, newY];
        outline.position = [outline.position[0] + dx, outline.position[1] + dy];
    }

    // Duplicate and position each item
    // Packing uses y-from-top; Illustrator uses Y-up, so: illustratorY = totalBgHeight - packY
    for (var p = 0; p < packed.placements.length; p++) {
        var pl   = packed.placements[p];
        var item = pl.item;

        var newGrp = duplicateTo(item.srcGrp, outputLayer);
        var newOut = duplicateTo(item.srcOut, outputLayer);

        moveGroup(newGrp, newOut, pl.x, totalBgHeight - pl.y);
    }

    // White background covering the full print area
    app.activeDocument = newDoc;
    var bg = outputLayer.pathItems.rectangle(totalBgHeight, 0, bgWidth, totalBgHeight);
    var white = new CMYKColor();
    white.cyan = 0; white.magenta = 0; white.yellow = 0; white.black = 0;
    bg.fillColor = white;
    bg.stroked   = false;
    bg.name      = 'PRINT_BACKGROUND';
    bg.move(outputLayer, ElementPlacement.PLACEATEND);

    alert('Hoan thanh! Da xep ' + items.length + ' vat the vao ban in.');
}

try {
    main();
} catch (e) {
    alert('Loi: ' + e.message + '\nDong: ' + e.line);
}
