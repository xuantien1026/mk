#target illustrator

var SIZES = ['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL'];

var PT_PER_MM = 2.83465;

var CUSTOMER_NAME_MAX_WIDTH = {
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
// Dialog: collect customer names per size
// -------------------------------------------------------
function getOrders(sizes) {
    var dlg = new Window('dialog', 'Step 2: T-Shirt Orders');
    dlg.orientation = 'column';
    dlg.alignChildren = 'fill';

    var header = dlg.add('group');
    header.orientation = 'row';
    var h1 = header.add('statictext', undefined, 'Size');
    h1.preferredSize = [45, 20];
    var h2 = header.add('statictext', undefined, 'Customer Names (comma-separated)');
    h2.preferredSize = [260, 20];

    var inputs = {};
    for (var i = 0; i < sizes.length; i++) {
        var row = dlg.add('group');
        row.orientation = 'row';
        var lbl = row.add('statictext', undefined, sizes[i] + ':');
        lbl.preferredSize = [45, 20];
        var inp = row.add('edittext', undefined, '');
        inp.preferredSize = [260, 20];
        inputs[sizes[i]] = inp;
    }

    var btns = dlg.add('group');
    btns.alignment = 'center';
    btns.add('button', undefined, 'OK',     {name: 'ok'});
    btns.add('button', undefined, 'Cancel', {name: 'cancel'});

    if (dlg.show() !== 1) return null;

    function trim(s) { return s.replace(/^\s+|\s+$/g, ''); }

    var result = {};
    for (var i = 0; i < sizes.length; i++) {
        var parts = inputs[sizes[i]].text.split(',');
        var names = [];
        for (var j = 0; j < parts.length; j++) {
            var n = trim(parts[j]);
            if (n !== '') names.push(n);
        }
        result[sizes[i]] = names;
    }
    return result;
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

function findItemByName(container, name) {
    for (var i = 0; i < container.pageItems.length; i++) {
        var item = container.pageItems[i];
        if (item.name === name) return item;
        if (item.typename === 'GroupItem') {
            var found = findItemByName(item, name);
            if (found) return found;
        }
    }
    return null;
}

// -------------------------------------------------------
// Main
// -------------------------------------------------------
function main() {
    var preparedSizes = detectPreparedSizes();
    if (preparedSizes.length === 0) {
        alert('No resized designs found. Run resize_to_sizes.jsx first.');
        return;
    }

    var orders = getOrders(preparedSizes);
    if (!orders) return;

    var totalQty = 0;
    for (var s = 0; s < preparedSizes.length; s++) totalQty += orders[preparedSizes[s]].length;
    if (totalQty === 0) { alert('No names entered. Nothing to do.'); return; }

    var mainDoc = app.activeDocument;

    // Anchor to the artboard so content stays within the pasteboard
    var artRect = mainDoc.artboards[0].artboardRect; // [left, top, right, bottom]
    var bgLeft  = artRect[0];
    var bgTop   = artRect[1];

    var outputLayer = mainDoc.layers.add();
    outputLayer.name = 'PRINT_OUTPUT';

    // Duplicate one of the Step 1 resized designs and apply the customer name
    function duplicateDesign(sz, side, newInstanceName, customerName) {
        var sourceFinal   = requireItem(mainDoc.pageItems, sz + '_' + side + '_FINAL',   mainDoc.name);
        var sourceOutline = requireItem(mainDoc.pageItems, sz + '_' + side + '_OUTLINE', mainDoc.name);

        var newGroup   = sourceFinal.duplicate(outputLayer, ElementPlacement.PLACEATEND);
        newGroup.name  = newInstanceName + '_FINAL';

        var newOutline  = sourceOutline.duplicate(outputLayer, ElementPlacement.PLACEATEND);
        newOutline.name = newInstanceName + '_OUTLINE';

        if (customerName !== null) {
            var nameField = findItemByName(newGroup, 'CUSTOMER_NAME');
            if (nameField && nameField.typename === 'TextFrame') {
                nameField.contents = customerName;
                var maxW      = CUSTOMER_NAME_MAX_WIDTH[sz];
                var nameBounds = nameField.geometricBounds;
                var nameWidth  = nameBounds[2] - nameBounds[0];
                if (maxW && nameWidth > maxW) {
                    nameField.resize((maxW / nameWidth) * 100, 100, true, true, true, true, false, Transformation.CENTER);
                }
            }
        }

        return newGroup;
    }

    function moveWithOutline(group, newX, newY) {
        var deltaX = newX - group.position[0];
        var deltaY = newY - group.position[1];
        group.position = [newX, newY];
        var outline = mainDoc.pageItems.getByName(group.name.replace('_FINAL', '_OUTLINE'));
        outline.position = [outline.position[0] + deltaX, outline.position[1] + deltaY];
    }

    var padding        = 40;
    var spacing        = 40;
    var MAX_COL_HEIGHT = 5 * 1000 * PT_PER_MM; // 5 metre column height limit
    var COLUMN_GAP     = 100;
    var currentTop     = bgTop;
    var columnLeft     = bgLeft;
    var colMaxWidth    = 0;  // widest row in the current column (excludes padding)
    var columns        = []; // {left, top, bottom, width} — one entry per strip
    var allGroups      = [];

    for (var s = 0; s < preparedSizes.length; s++) {
        var sz    = preparedSizes[s];
        var names = orders[sz];
        if (names.length === 0) continue;

        for (var q = 0; q < names.length; q++) {
            var prefix      = sz + '_' + (q + 1);
            var backGrp     = duplicateDesign(sz, 'BACK',         prefix + '_BACK',         names[q]);
            var frontGrp    = duplicateDesign(sz, 'FRONT',        prefix + '_FRONT',        null);
            var leftSlvGrp  = duplicateDesign(sz, 'LEFT_SLEEVE',  prefix + '_LEFT_SLEEVE',  null);
            var rightSlvGrp = duplicateDesign(sz, 'RIGHT_SLEEVE', prefix + '_RIGHT_SLEEVE', null);

            var sleeveColHeight = leftSlvGrp.height + spacing + rightSlvGrp.height;
            var sleeveColWidth  = Math.max(leftSlvGrp.width, rightSlvGrp.width);
            var rowHeight       = Math.max(frontGrp.height, backGrp.height, sleeveColHeight) + padding * 2;

            // Start a new column when this row would exceed the 5m height limit
            if (bgTop - currentTop + rowHeight > MAX_COL_HEIGHT && currentTop < bgTop) {
                columns.push({left: columnLeft, top: bgTop, bottom: currentTop, width: colMaxWidth});
                columnLeft  += colMaxWidth + padding * 2 + COLUMN_GAP;
                currentTop   = bgTop;
                colMaxWidth  = 0;
            }

            // No fixed sheet width: each row is as wide as front + back + sleeves need
            var totalRowWidth   = frontGrp.width + spacing + backGrp.width + spacing + sleeveColWidth;
            if (totalRowWidth > colMaxWidth) colMaxWidth = totalRowWidth;

            var startX          = columnLeft + padding;
            var sleeveColX      = startX + frontGrp.width + spacing + backGrp.width + spacing;
            var sleeveColTop    = currentTop - (rowHeight - sleeveColHeight) / 2;

            moveWithOutline(frontGrp,    startX,                                                currentTop - (rowHeight - frontGrp.height) / 2);
            moveWithOutline(backGrp,     startX + frontGrp.width + spacing,                     currentTop - (rowHeight - backGrp.height)  / 2);
            moveWithOutline(leftSlvGrp,  sleeveColX + (sleeveColWidth - leftSlvGrp.width)  / 2, sleeveColTop);
            moveWithOutline(rightSlvGrp, sleeveColX + (sleeveColWidth - rightSlvGrp.width) / 2, sleeveColTop - leftSlvGrp.height - spacing);

            currentTop -= rowHeight;
            allGroups.push(backGrp, frontGrp, leftSlvGrp, rightSlvGrp);
        }
    }

    // One white background rectangle per column, sized to that column's widest row
    columns.push({left: columnLeft, top: bgTop, bottom: currentTop, width: colMaxWidth});
    for (var c = 0; c < columns.length; c++) {
        var col = columns[c];
        var bg = outputLayer.pathItems.rectangle(col.top, col.left, col.width + padding * 2, col.top - col.bottom);
        var white = new CMYKColor();
        white.cyan = 0; white.magenta = 0; white.yellow = 0; white.black = 0;
        bg.fillColor = white;
        bg.stroked   = false;
        bg.name      = 'PRINT_BACKGROUND_' + (c + 1);
        bg.move(outputLayer, ElementPlacement.PLACEATEND);
    }
    alert('Done! Created ' + totalQty + ' shirt(s) across ' + (allGroups.length / 4) + ' row(s).');
}

try {
    main();
} catch (e) {
    alert('Error: ' + e.message + '\nLine: ' + e.line);
}
