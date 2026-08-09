// select.jsx — select a single item so an Action can act on it.
//
// The redraws must stay. `item.selected = true` only updates the DOM; app.doScript
// plays against Illustrator's UI selection, which is not refreshed until a redraw.
// Skip them and the action runs on an empty selection, failing with
// "the object '<step>' is not currently available".
//
// Operates on app.activeDocument — bring the item's document to the front first.

// Clear the selection in EVERY open document.
//
// Not just the active one: a duplicate inherits the source item's selected state,
// and a selection left in another open document blocks selecting that copy here —
// `.selected = true` silently does nothing. Call once before duplicating anything.
function deselectAllDocuments() {
    for (var i = 0; i < app.documents.length; i++) {
        try { app.documents[i].selection = null; } catch (e) {}
    }
}

function select(item) {
    if (item.locked) throw new Error('Đối tượng "' + item.name + '" đang bị khoá.');
    if (item.hidden) throw new Error('Đối tượng "' + item.name + '" đang bị ẩn.');

    var doc = app.activeDocument;

    app.redraw();          // flush what the previous action left in the UI
    doc.selection = null;
    item.selected = true;
    app.redraw();          // flush this selection out to the UI

    if (!doc.selection || doc.selection.length === 0) {
        throw new Error('Không chọn được đối tượng "' + item.name + '" để chạy action.');
    }
}
