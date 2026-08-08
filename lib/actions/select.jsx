function select(item) {
    if (item.locked) throw new Error('Đối tượng "' + item.name + '" đang bị khoá.');
    if (item.hidden) throw new Error('Đối tượng "' + item.name + '" đang bị ẩn.');

    var doc = app.activeDocument;
    doc.selection = null;
    item.selected = true;
    app.redraw();
}
