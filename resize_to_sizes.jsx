#target illustrator

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

var PT_PER_MM = 2.83465;

// -------------------------------------------------------
// Dialog: select which sizes to prepare
// -------------------------------------------------------
function getSizes() {
    var dlg = new Window('dialog', 'Step 1: Select Sizes to Resize');
    dlg.orientation = 'column';
    dlg.alignChildren = 'fill';

    dlg.add('statictext', undefined, 'Select sizes to prepare:');

    var checks = {};
    for (var i = 0; i < SIZES.length; i++) {
        var cb = dlg.add('checkbox', undefined, SIZES[i]);
        checks[SIZES[i]] = cb;
    }

    var btns = dlg.add('group');
    btns.alignment = 'center';
    btns.add('button', undefined, 'OK',     {name: 'ok'});
    btns.add('button', undefined, 'Cancel', {name: 'cancel'});

    if (dlg.show() !== 1) return null;

    var result = [];
    for (var i = 0; i < SIZES.length; i++) {
        if (checks[SIZES[i]].value) result.push(SIZES[i]);
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

// -------------------------------------------------------
// Main
// -------------------------------------------------------
function main() {
    var selectedSizes = getSizes();
    if (!selectedSizes) return;
    if (selectedSizes.length === 0) { alert('No sizes selected. Nothing to do.'); return; }

    var mainDoc = app.activeDocument;

    var sourceFile = new File(mainDoc.fullName.parent.fsName + '/RAPBONGDA.ai');
    if (!sourceFile.exists) throw new Error('RAPBONGDA.ai not found in: ' + mainDoc.fullName.parent.fsName);

    var sourceDoc = app.open(sourceFile);

    var backShapes = {}, frontShapes = {}, sleeveShapes = {};
    for (var s = 0; s < selectedSizes.length; s++) {
        var sz = selectedSizes[s];
        backShapes[sz]        = copyItemToDoc(BACK_SHAPE_NAMES[sz],   sourceDoc, mainDoc);
        backShapes[sz].name   = sz + '_BACK_SHAPE';
        frontShapes[sz]       = copyItemToDoc(FRONT_SHAPE_NAMES[sz],  sourceDoc, mainDoc);
        frontShapes[sz].name  = sz + '_FRONT_SHAPE';
        sleeveShapes[sz]      = copyItemToDoc(SLEEVE_SHAPE_NAMES[sz], sourceDoc, mainDoc);
        sleeveShapes[sz].name = sz + '_SLEEVE_SHAPE';
    }

    sourceDoc.close(SaveOptions.DONOTSAVECHANGES);
    app.activeDocument = mainDoc;

    var outputLayer = mainDoc.layers.add();
    outputLayer.name = 'SIZED_OUTPUT';

    var backDesign  = requireItem(mainDoc.pageItems, 'BACK_DESIGN',  mainDoc.name);
    var frontDesign = requireItem(mainDoc.pageItems, 'FRONT_DESIGN', mainDoc.name);
    var leftSleeve  = requireItem(mainDoc.pageItems, 'LEFT_SLEEVE',  mainDoc.name);
    var rightSleeve = requireItem(mainDoc.pageItems, 'RIGHT_SLEEVE', mainDoc.name);

    // side: 'FRONT' | 'BACK' | null (sleeve)
    function resizeAndMask(design, maskShape, instanceName, sizeName, side) {
        var designCopy = design.duplicate(outputLayer, ElementPlacement.PLACEATEND);
        designCopy.name = instanceName + '_DESIGN';

        // Extract SIZE elements before scaling so their size is preserved
        var sizeFields = [];
        if (side !== null) {
            var allSizeItems = findAllItemsByName(designCopy, 'SIZE');
            for (var i = 0; i < allSizeItems.length; i++) {
                if (allSizeItems[i].typename === 'TextFrame') {
                    allSizeItems[i].contents = sizeName;
                    allSizeItems[i].move(outputLayer, ElementPlacement.PLACEATEND);
                    sizeFields.push(allSizeItems[i]);
                }
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
        var scale  = Math.max(scaleX, scaleY);
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

        // Position SIZE elements at fixed offsets from mask edges
        var maskBottom = maskShape.position[1] - maskShape.height;
        for (var i = 0; i < sizeFields.length; i++) {
            var sf       = sizeFields[i];
            var sfBounds = sf.geometricBounds;
            var sfY = sf.position[1] + (maskBottom - sfBounds[3]);
            var sfX = (side === 'FRONT')
                ? sf.position[0] + (maskShape.position[0] + maskShape.width - 20 * PT_PER_MM - sfBounds[2])
                : sf.position[0] + (maskShape.position[0] + 20 * PT_PER_MM - sfBounds[0]);
            sf.position = [sfX, sfY];
            sf.move(designCopy, ElementPlacement.PLACEBEFORE);
        }

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

    var bgWidth    = 1.6 * 1000 * PT_PER_MM;
    var padding    = 40;
    var spacing    = 40;
    var bgLeft     = backDesign.position[0] + backDesign.width + 60;
    var bgTop      = backDesign.position[1];
    var currentTop = bgTop;

    for (var s = 0; s < selectedSizes.length; s++) {
        var sz = selectedSizes[s];

        var backGrp     = resizeAndMask(backDesign,  backShapes[sz],   sz + '_BACK',         sz, 'BACK');
        var frontGrp    = resizeAndMask(frontDesign, frontShapes[sz],  sz + '_FRONT',        sz, 'FRONT');
        var leftSlvGrp  = resizeAndMask(leftSleeve,  sleeveShapes[sz], sz + '_LEFT_SLEEVE',  sz, null);
        var rightSlvGrp = resizeAndMask(rightSleeve, sleeveShapes[sz], sz + '_RIGHT_SLEEVE', sz, null);

        var sleeveColHeight = leftSlvGrp.height + spacing + rightSlvGrp.height;
        var sleeveColWidth  = Math.max(leftSlvGrp.width, rightSlvGrp.width);
        var rowHeight       = Math.max(frontGrp.height, backGrp.height, sleeveColHeight) + padding * 2;
        var totalRowWidth   = frontGrp.width + spacing + backGrp.width + spacing + sleeveColWidth;
        var startX          = bgLeft + (bgWidth - totalRowWidth) / 2;
        var sleeveColX      = startX + frontGrp.width + spacing + backGrp.width + spacing;
        var sleeveColTop    = currentTop - (rowHeight - sleeveColHeight) / 2;

        moveWithOutline(frontGrp,    startX,                                          currentTop - (rowHeight - frontGrp.height)   / 2);
        moveWithOutline(backGrp,     startX + frontGrp.width + spacing,               currentTop - (rowHeight - backGrp.height)    / 2);
        moveWithOutline(leftSlvGrp,  sleeveColX + (sleeveColWidth - leftSlvGrp.width)  / 2, sleeveColTop);
        moveWithOutline(rightSlvGrp, sleeveColX + (sleeveColWidth - rightSlvGrp.width) / 2, sleeveColTop - leftSlvGrp.height - spacing);

        currentTop -= rowHeight;

        backShapes[sz].remove();
        frontShapes[sz].remove();
        sleeveShapes[sz].remove();
    }

    alert('Done! ' + selectedSizes.length + ' size(s) prepared on layer "SIZED_OUTPUT".\nMake manual adjustments, then run apply_names.jsx.');
}

try {
    main();
} catch (e) {
    alert('Error: ' + e.message + '\nLine: ' + e.line);
}
