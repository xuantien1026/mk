// Print command (CSV) dialogs for nhap_ten_so.jsx. Needs parseOrders (print_command.jsx).

function selectPrintCommandFile() {
    return File.openDialog('Chọn file lệnh in (CSV)', 'CSV:*.csv,All files:*.*');
}

// Ask which Mẫu to print when the CSV mixes several. values is the list of raw
// Mẫu strings (a blank '' is shown as "Trống"). Returns the chosen raw string,
// or null on cancel.
function selectVariant(values) {
    var dlg = new Window('dialog', 'Chọn mẫu');
    dlg.orientation = 'column';
    dlg.alignChildren = 'fill';
    dlg.add('statictext', undefined, 'Chọn mẫu cần in:');

    var labels = [];
    for (var i = 0; i < values.length; i++) labels.push(values[i] === '' ? 'Trống' : values[i]);
    var dd = dlg.add('dropdownlist', undefined, labels);
    dd.selection = 0;

    var btns = dlg.add('group');
    btns.alignment = 'center';
    btns.add('button', undefined, 'OK',     {name: 'ok'});
    btns.add('button', undefined, 'Cancel', {name: 'cancel'});

    if (dlg.show() !== 1) return null;
    return values[dd.selection.index];
}

// Ask which FORM to print when the CSV has NỮ rows. Returns true for NỮ, false for
// NAM, or null on cancel.
function selectForm() {
    var dlg = new Window('dialog', 'Chọn form');
    dlg.orientation = 'column';
    dlg.alignChildren = 'fill';
    dlg.add('statictext', undefined, 'Chọn form cần in:');

    var dd = dlg.add('dropdownlist', undefined, ['NAM', 'NỮ']);
    dd.selection = 0;

    var btns = dlg.add('group');
    btns.alignment = 'center';
    btns.add('button', undefined, 'OK',     {name: 'ok'});
    btns.add('button', undefined, 'Cancel', {name: 'cancel'});

    if (dlg.show() !== 1) return null;
    return dd.selection.index === 1;
}

// Read the CSV and delegate parsing to parseOrders (lib/print_command.jsx).
function parsePrintCommand(file) {
    file.encoding = 'UTF-8';
    if (!file.open('r')) throw new Error('Khong mo duoc file: ' + file.fsName);
    var text = file.read();
    file.close();
    return parseOrders(text);
}
