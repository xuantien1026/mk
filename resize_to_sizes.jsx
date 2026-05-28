#target illustrator

// -------------------------------------------------------
// Dialog: collect customer names per size
// -------------------------------------------------------
function getOrders() {
    var sizes = ['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL'];

    var dlg = new Window('dialog', 'T-Shirt Orders');
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
// Main
// -------------------------------------------------------
try {
    var SIZES = ['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL'];

    var BACK_SHAPE_NAMES = {
        'S':   'S_BACK',   'M':   'M_BACK',   'L':   'L_BACK',
        'XL':  'XL_BACK',  '2XL': '2XL_BACK', '3XL': '3XL_BACK',
        '4XL': '4XL_BACK', '5XL': '5XL_BACK', '6XL': '6XL_BACK'
    };

    var FRONT_SHAPE_NAMES = {
        'S':   'S_FRONT',   'M':   'M_FRONT',   'L':   'L_FRONT',
        'XL':  'XL_FRONT',  '2XL': '2XL_FRONT', '3XL': '3XL_FRONT',
        '4XL': '4XL_FRONT', '5XL': '5XL_FRONT', '6XL': '6XL_FRONT'
    };

    var SLEEVE_SHAPE_NAMES = {
        'S':   'S_SLEEVE',   'M':   'M_SLEEVE',   'L':   'L_SLEEVE',
        'XL':  'XL_SLEEVE',  '2XL': '2XL_SLEEVE', '3XL': '3XL_SLEEVE',
        '4XL': '4XL_SLEEVE', '5XL': '5XL_SLEEVE', '6XL': '6XL_SLEEVE'
    };

    var orders = getOrders();
    if (!orders) {
        // user cancelled — exit silently
    } else {
        var totalQty = 0;
        for (var s = 0; s < SIZES.length; s++) totalQty += orders[SIZES[s]].length;

        if (totalQty === 0) {
            alert('No names entered. Nothing to do.');
        } else {
            var mainDoc = app.activeDocument;

            // -------------------------------------------------------
            // Step 1: Copy needed shapes from RAPBONGDA.ai
            // -------------------------------------------------------
            var sourceFile = new File(mainDoc.fullName.parent.fsName + '/RAPBONGDA.ai');
            if (!sourceFile.exists) {
                throw new Error('RAPBONGDA.ai not found in: ' + mainDoc.fullName.parent.fsName);
            }

            var sourceDoc = app.open(sourceFile);

            function requireItem(collection, name, fileName) {
                try {
                    return collection.getByName(name);
                } catch (e) {
                    throw new Error('Khong tim thay "' + name + '" trong file ' + fileName);
                }
            }

            function copyItemToDoc(itemName, fromDoc, toDoc) {
                var item = requireItem(fromDoc.pageItems, itemName, fromDoc.name);
                var savedName = item.name;
                var destLayer = toDoc.layers[0];
                var wasLocked = destLayer.locked;
                destLayer.locked = false;
                var copy = item.duplicate(destLayer, ElementPlacement.PLACEATEND);
                destLayer.locked = wasLocked;
                item.name = savedName;
                return copy;
            }

            var backShapes   = {};
            var frontShapes  = {};
            var sleeveShapes = {};
            for (var s = 0; s < SIZES.length; s++) {
                var sz = SIZES[s];
                if (orders[sz].length > 0) {
                    backShapes[sz]        = copyItemToDoc(BACK_SHAPE_NAMES[sz],   sourceDoc, mainDoc);
                    backShapes[sz].name   = sz + '_BACK_SHAPE';
                    frontShapes[sz]       = copyItemToDoc(FRONT_SHAPE_NAMES[sz],  sourceDoc, mainDoc);
                    frontShapes[sz].name  = sz + '_FRONT_SHAPE';
                    sleeveShapes[sz]      = copyItemToDoc(SLEEVE_SHAPE_NAMES[sz], sourceDoc, mainDoc);
                    sleeveShapes[sz].name = sz + '_SLEEVE_SHAPE';
                }
            }

            sourceDoc.close(SaveOptions.DONOTSAVECHANGES);
            app.activeDocument = mainDoc;

            // -------------------------------------------------------
            // Step 2: Set up output layer and helpers
            // -------------------------------------------------------
            var outputLayer = mainDoc.layers.add();
            outputLayer.name = 'SIZED_OUTPUT';

            var backDesign   = requireItem(mainDoc.pageItems, 'BACK_DESIGN',   mainDoc.name);
            var frontDesign  = requireItem(mainDoc.pageItems, 'FRONT_DESIGN',  mainDoc.name);
            var leftSleeve   = requireItem(mainDoc.pageItems, 'LEFT_SLEEVE',   mainDoc.name);
            var rightSleeve  = requireItem(mainDoc.pageItems, 'RIGHT_SLEEVE',  mainDoc.name);

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

            function findAllItemsByName(container, name, results) {
                if (!results) results = [];
                for (var i = 0; i < container.pageItems.length; i++) {
                    var item = container.pageItems[i];
                    if (item.name === name) results.push(item);
                    if (item.typename === 'GroupItem') findAllItemsByName(item, name, results);
                }
                return results;
            }

            // instanceName encodes both size and side, e.g. "S_1_BACK", "S_1_FRONT"
            // customerName is null when there is no name field to replace
            function resizeAndMask(design, maskShape, instanceName, customerName, sizeName) {
                var designCopy = design.duplicate(outputLayer, ElementPlacement.PLACEATEND);
                designCopy.name = instanceName + '_DESIGN';

                // Replace customer name only for back designs
                if (customerName !== null) {
                    var nameField = findItemByName(designCopy, 'CUSTOMER_NAME');
                    if (nameField && nameField.typename === 'TextFrame') {
                        nameField.contents = customerName;
                    }
                }

                // Replace all SIZE text elements with the actual size label
                var sizeFields = findAllItemsByName(designCopy, 'SIZE');
                for (var i = 0; i < sizeFields.length; i++) {
                    if (sizeFields[i].typename === 'TextFrame') {
                        sizeFields[i].contents = sizeName;
                    }
                }

                var boundingPath = (designCopy.typename === 'GroupItem' && designCopy.clipped && designCopy.pageItems.length > 0)
                    ? designCopy.pageItems[0]
                    : designCopy;

                var preBounds = boundingPath.geometricBounds;
                var visibleW  = preBounds[2] - preBounds[0];
                var visibleH  = preBounds[1] - preBounds[3];

                var scaleX = (maskShape.width  / visibleW) * 100;
                var scaleY = (maskShape.height / visibleH) * 100;
                var scale  = Math.max(scaleX, scaleY); // cover: shape fits inside design
                designCopy.resize(scale, scale, true, true, true, true, true, Transformation.CENTER);

                var postBounds  = boundingPath.geometricBounds;
                var visCenterX  = (postBounds[0] + postBounds[2]) / 2;
                var visCenterY  = (postBounds[1] + postBounds[3]) / 2;
                var maskCenterX = maskShape.position[0] + maskShape.width  / 2;
                var maskCenterY = maskShape.position[1] - maskShape.height / 2;
                designCopy.position = [
                    designCopy.position[0] + (maskCenterX - visCenterX),
                    designCopy.position[1] + (maskCenterY - visCenterY)
                ];

                var clipPath  = maskShape.duplicate(outputLayer, ElementPlacement.PLACEATEND);
                var clipGroup = outputLayer.groupItems.add();
                clipGroup.name = instanceName + '_FINAL';

                designCopy.move(clipGroup, ElementPlacement.PLACEATEND);
                clipPath.move(clipGroup, ElementPlacement.PLACEATBEGINNING);
                clipGroup.clipped = true;

                var outlineShape = maskShape.duplicate(outputLayer, ElementPlacement.PLACEATEND);
                outlineShape.name = instanceName + '_OUTLINE';
                outlineShape.move(clipGroup, ElementPlacement.PLACEBEFORE);

                return clipGroup;
            }

            function moveWithOutline(group, newX, newY) {
                var deltaX = newX - group.position[0];
                var deltaY = newY - group.position[1];
                group.position = [newX, newY];
                var outline = mainDoc.pageItems.getByName(group.name.replace('_FINAL', '_OUTLINE'));
                outline.position = [outline.position[0] + deltaX, outline.position[1] + deltaY];
            }

            // -------------------------------------------------------
            // Step 3: Generate one row per copy — front, back, sleeves
            // -------------------------------------------------------
            var METERS_TO_PT = 100 * 28.3465;
            var bgWidth      = 1.6 * METERS_TO_PT;
            var padding      = 40;  // gap between design and background edges
            var innerSpacing = 40;  // gap between items within a row
            var bgLeft       = backDesign.position[0] + backDesign.width + 60;
            var bgTop        = backDesign.position[1];
            var currentTop   = bgTop;
            var allGroups    = [];

            for (var s = 0; s < SIZES.length; s++) {
                var sz    = SIZES[s];
                var names = orders[sz];
                if (names.length === 0) continue;

                for (var q = 0; q < names.length; q++) {
                    var prefix       = sz + '_' + (q + 1);
                    var backGrp      = resizeAndMask(backDesign,  backShapes[sz],   prefix + '_BACK',          names[q], sz);
                    var frontGrp     = resizeAndMask(frontDesign, frontShapes[sz],  prefix + '_FRONT',         null,     sz);
                    var leftSlvGrp   = resizeAndMask(leftSleeve,  sleeveShapes[sz], prefix + '_LEFT_SLEEVE',   null,     sz);
                    var rightSlvGrp  = resizeAndMask(rightSleeve, sleeveShapes[sz], prefix + '_RIGHT_SLEEVE',  null,     sz);

                    // Sleeve column: left sleeve on top, right sleeve below
                    var sleeveColHeight = leftSlvGrp.height + innerSpacing + rightSlvGrp.height;
                    var sleeveColWidth  = Math.max(leftSlvGrp.width, rightSlvGrp.width);

                    var rowHeight     = Math.max(frontGrp.height, backGrp.height, sleeveColHeight) + padding * 2;
                    var totalRowWidth = frontGrp.width + innerSpacing + backGrp.width + innerSpacing + sleeveColWidth;
                    var startX        = bgLeft + (bgWidth - totalRowWidth) / 2;

                    // Front on the left, back in the middle, sleeves stacked on the right
                    var sleeveColX    = startX + frontGrp.width + innerSpacing + backGrp.width + innerSpacing;
                    var sleeveColTop  = currentTop - (rowHeight - sleeveColHeight) / 2;

                    moveWithOutline(frontGrp,
                        startX,
                        currentTop - (rowHeight - frontGrp.height) / 2
                    );
                    moveWithOutline(backGrp,
                        startX + frontGrp.width + innerSpacing,
                        currentTop - (rowHeight - backGrp.height) / 2
                    );
                    moveWithOutline(leftSlvGrp,
                        sleeveColX + (sleeveColWidth - leftSlvGrp.width) / 2,
                        sleeveColTop
                    );
                    moveWithOutline(rightSlvGrp,
                        sleeveColX + (sleeveColWidth - rightSlvGrp.width) / 2,
                        sleeveColTop - leftSlvGrp.height - innerSpacing
                    );

                    currentTop -= rowHeight;
                    allGroups.push(frontGrp);
                    allGroups.push(backGrp);
                    allGroups.push(leftSlvGrp);
                    allGroups.push(rightSlvGrp);
                }

                frontShapes[sz].remove();
                backShapes[sz].remove();
                sleeveShapes[sz].remove();
            }

            // -------------------------------------------------------
            // Step 4: Single continuous white background
            // -------------------------------------------------------
            var totalBgHeight = bgTop - currentTop;
            var bg = outputLayer.pathItems.rectangle(bgTop, bgLeft, bgWidth, totalBgHeight);
            var white = new CMYKColor();
            white.cyan = 0; white.magenta = 0; white.yellow = 0; white.black = 0;
            bg.fillColor = white;
            bg.stroked   = false;
            bg.name      = 'PRINT_BACKGROUND';
            bg.move(outputLayer, ElementPlacement.PLACEATEND);

            alert('Done! Created ' + totalQty + ' shirt(s) across ' + (allGroups.length / 4) + ' row(s).');
        }
    }

} catch (e) {
    alert('Error: ' + e.message + '\nLine: ' + e.line);
}
