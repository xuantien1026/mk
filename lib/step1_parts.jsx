// Reading the Step-1 (nhay_size.jsx) result document: which sizes and parts it produced,
// and how big they are. Needs SIZES (config.jsx), requireItem (utils.jsx).
//
// Step 1 names each part instance {size}_{side} — a group holding {size}_{side}_OUTLINE
// (the cut line) and {size}_{side}_FINAL (the clipped design).

var SHIRT_SIDES = ['FRONT', 'BACK', 'LEFT_SLEEVE', 'RIGHT_SLEEVE'];

// True if a page item with this name exists anywhere in the document.
function itemExists(doc, name) {
    try { doc.pageItems.getByName(name); return true; } catch (e) { return false; }
}

// The pant part "sides" Step 1 produced for a size — the 4-shape split (two pieces per
// leg) or the original 2-shape pant. Empty when the size has no pant parts.
function pantSides(doc, sz) {
    if (itemExists(doc, sz + '_LEFT_PANT_1_FINAL'))
        return ['LEFT_PANT_1', 'LEFT_PANT_2', 'RIGHT_PANT_1', 'RIGHT_PANT_2'];
    if (itemExists(doc, sz + '_LEFT_PANT_FINAL'))
        return ['LEFT_PANT', 'RIGHT_PANT'];
    return [];
}

// The sides making up one product ('SHIRT' or 'PANT') of a size. Empty when Step 1
// didn't produce that product (shirt-only / pant-only designs).
function productSides(doc, kind, sz) {
    if (kind === 'PANT') return pantSides(doc, sz);
    return itemExists(doc, sz + '_BACK_FINAL') ? SHIRT_SIDES : [];
}

// Sizes for which Step 1 produced shirt and/or pant parts, in SIZES order.
function detectPreparedSizes(doc) {
    var prepared = [];
    for (var i = 0; i < SIZES.length; i++) {
        if (productSides(doc, 'SHIRT', SIZES[i]).length || productSides(doc, 'PANT', SIZES[i]).length) {
            prepared.push(SIZES[i]);
        }
    }
    return prepared;
}

// The _OUTLINE is the sibling of the _FINAL clip group inside their instance group.
function outlineOf(finalGroup) {
    var ig = finalGroup.parent;
    return (ig.pageItems[0] === finalGroup) ? ig.pageItems[1] : ig.pageItems[0];
}

// Measure a part by its cut OUTLINE's visibleBounds (stroke included) — the same as
// Step 1 — so placement sits between the actual cut lines, not the design, and the
// stroke isn't clipped by the artboard edge.
function partBounds(finalGroup) {
    var b = outlineOf(finalGroup).visibleBounds; // [left, top, right, bottom]
    return { left: b[0], top: b[1], width: b[2] - b[0], height: b[1] - b[3] };
}

function partBoundsByName(doc, name) {
    return partBounds(requireItem(doc.pageItems, name, doc.name));
}

// A product's footprint = the union of its parts' Step-1 bounds, so the parts keep the
// layout Step 1 produced. Needs unionBounds (sheet_layout.jsx).
function productBlock(doc, sz, sides) {
    var boxes = [];
    for (var i = 0; i < sides.length; i++) boxes.push(partBoundsByName(doc, sz + '_' + sides[i] + '_FINAL'));
    return unionBounds(boxes);
}
