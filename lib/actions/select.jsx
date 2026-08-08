// select.jsx — select a single item so that an Action can act on it.
//
// The three calls below must stay together. `item.selected = true` only updates
// the DOM; app.doScript plays against Illustrator's UI selection, which is not
// refreshed until a redraw. Skip app.redraw() and the action runs on an empty
// selection, failing with "the object '<step>' is not currently available".
//
// Operates on app.activeDocument — pass the item's own document to the front
// first if more than one is open.
function select(item) {
    if (item.locked) throw new Error('Đối tượng "' + item.name + '" đang bị khoá.');
    if (item.hidden) throw new Error('Đối tượng "' + item.name + '" đang bị ẩn.');

    var doc = app.activeDocument;
    doc.selection = null;
    item.selected = true;
    app.redraw();
}
