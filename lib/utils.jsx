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

// getByName that throws a readable error naming the missing item and its file.
function requireItem(collection, name, fileName) {
    try {
        return collection.getByName(name);
    } catch (e) {
        throw new Error('Khong tim thay "' + name + '" trong file ' + fileName);
    }
}
