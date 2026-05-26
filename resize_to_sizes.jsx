#target illustrator

// -------------------------------------------------------
// Dialog: collect customer names per size
// -------------------------------------------------------
function getOrders() {
    var sizes = ['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL'];

    var dlg = new Window('dialog', 'T-Shirt Orders');
    dlg.orientation = 'column';
    dlg.alignChildren = 'fill';

    // Column headers
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
            var name = trim(parts[j]);
            if (name !== '') names.push(name);
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
    var SHAPE_NAMES = {
        'S':   'S_BACK',   'M':   'M_BACK',   'L':   'L_BACK',
        'XL':  'XL_BACK',  '2XL': '2XL_BACK', '3XL': '3XL_BACK',
        '4XL': '4XL_BACK', '5XL': '5XL_BACK', '6XL': '6XL_BACK'
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

            function copyItemToDoc(itemName, fromDoc, toDoc) {
                var item = fromDoc.pageItems.getByName(itemName);
                var savedName = item.name;
                var destLayer = toDoc.layers[0];
                var wasLocked = destLayer.locked;
                destLayer.locked = false;
                var copy = item.duplicate(destLayer, ElementPlacement.PLACEATEND);
                destLayer.locked = wasLocked;
                item.name = savedName;
                return copy;
            }

            var shapes = {};
            for (var s = 0; s < SIZES.length; s++) {
                var sz = SIZES[s];
                if (orders[sz].length > 0) {
                    shapes[sz] = copyItemToDoc(SHAPE_NAMES[sz], sourceDoc, mainDoc);
                    shapes[sz].name = sz + '_BACK_SHAPE';
                }
            }

            sourceDoc.close(SaveOptions.DONOTSAVECHANGES);
            app.activeDocument = mainDoc;

            // -------------------------------------------------------
            // Step 2: Set up output layer and helpers
            // -------------------------------------------------------
            var outputLayer = mainDoc.layers.add();
            outputLayer.name = 'SIZED_OUTPUT';

            var backDesign = mainDoc.pageItems.getByName('BACK_DESIGN');

            // Recursively search for a named item inside a group
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

            function resizeAndMask(design, maskShape, instanceName, customerName) {
                var designCopy = design.duplicate(outputLayer, ElementPlacement.PLACEATEND);
                designCopy.name = instanceName + '_BACK_DESIGN';

                // Replace the customer name text element before scaling
                var nameField = findItemByName(designCopy, 'CUSTOMER_NAME');
                if (nameField && nameField.typename === 'TextFrame') {
                    nameField.contents = customerName;
                }

                var boundingPath = (designCopy.typename === 'GroupItem' && designCopy.pageItems.length > 0)
                    ? designCopy.pageItems[designCopy.pageItems.length - 1]
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
                clipGroup.name = instanceName + '_BACK_FINAL';

                designCopy.move(clipGroup, ElementPlacement.PLACEATEND);
                clipPath.move(clipGroup, ElementPlacement.PLACEATBEGINNING);
                clipGroup.clipped = true;

                var outlineShape = maskShape.duplicate(outputLayer, ElementPlacement.PLACEATEND);
                outlineShape.name = instanceName + '_BACK_OUTLINE';
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
            // Step 3: Generate one row per copy, ordered by size
            // -------------------------------------------------------
            var METERS_TO_PT = 100 * 28.3465;
            var bgWidth    = 1.6 * METERS_TO_PT;
            var padding    = 40;
            var bgLeft     = backDesign.position[0] + backDesign.width + 60;
            var bgTop      = backDesign.position[1];
            var currentTop = bgTop;
            var allGroups  = [];

            for (var s = 0; s < SIZES.length; s++) {
                var sz    = SIZES[s];
                var names = orders[sz];
                if (names.length === 0) continue;

                for (var q = 0; q < names.length; q++) {
                    var instanceName = sz + '_' + (q + 1);
                    var grp = resizeAndMask(backDesign, shapes[sz], instanceName, names[q]);
                    var rowHeight = grp.height + padding * 2;

                    moveWithOutline(grp,
                        bgLeft + (bgWidth - grp.width) / 2,
                        currentTop - (rowHeight - grp.height) / 2
                    );

                    currentTop -= rowHeight;
                    allGroups.push(grp);
                }

                shapes[sz].remove();
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

            alert('Done! Created ' + totalQty + ' design(s) across ' + allGroups.length + ' row(s).');
        }
    }

} catch (e) {
    alert('Error: ' + e.message + '\nLine: ' + e.line);
}
