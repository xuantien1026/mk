// Shared Illustrator helpers used across the scripts.

// Collect every page item named `name` anywhere inside `container` (recursing into
// groups). Returns an array (empty when none match).
function findAllItemsByName(container, name, results) {
    if (!results) results = [];
    // Only groups (and the document) have a .pageItems collection; a plain PathItem,
    // CompoundPathItem or TextFrame has no children to search, so there is nothing to
    // recurse into. Guard against it instead of dereferencing undefined .pageItems.
    if (!container.pageItems) return results;
    for (var i = 0; i < container.pageItems.length; i++) {
        var item = container.pageItems[i];
        if (item.name === name) results.push(item);
        if (item.typename === 'GroupItem') findAllItemsByName(item, name, results);
    }
    return results;
}

// Collect every TextFrame anywhere inside `container` (recursing into groups) whose
// glyphs carry a stroke (a "border", e.g. the SO number). Returns an array of
// { frame, weight } capturing each one's current character stroke weight.
//
// Why this exists: Illustrator's resize() corrupts the character stroke weight of
// point text — it collapses to ~1/100 of its value, wiping out the visible border —
// so callers snapshot the weight before resizing and restore it afterward.
function collectStrokedTextFrames(container, results) {
    if (!results) results = [];
    if (!container.pageItems) return results;
    for (var i = 0; i < container.pageItems.length; i++) {
        var item = container.pageItems[i];
        if (item.typename === 'TextFrame') {
            try {
                var ca = item.textRange.characterAttributes;
                if (ca.strokeColor && ca.strokeColor.typename !== 'NoColor') {
                    results.push({ frame: item, weight: ca.strokeWeight });
                }
            } catch (e) {}
        } else if (item.typename === 'GroupItem') {
            collectStrokedTextFrames(item, results);
        }
    }
    return results;
}
