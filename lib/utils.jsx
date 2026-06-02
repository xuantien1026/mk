// Shared Illustrator helpers used across the scripts.

// Collect every page item named `name` anywhere inside `container` (recursing into
// groups). Returns an array (empty when none match).
function findAllItemsByName(container, name, results) {
    if (!results) results = [];
    for (var i = 0; i < container.pageItems.length; i++) {
        var item = container.pageItems[i];
        if (item.name === name) results.push(item);
        if (item.typename === 'GroupItem') findAllItemsByName(item, name, results);
    }
    return results;
}
