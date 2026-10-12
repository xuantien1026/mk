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

// Ask how to arrange the parts on the sheets. Returns { engine: 'sequential' | 'nest',
// timeLimit (seconds) }, or null on cancel.
function selectLayoutEngine() {
    var dlg = new Window('dialog', 'Cách xếp chi tiết');
    dlg.orientation = 'column';
    dlg.alignChildren = 'fill';

    var fast = dlg.add('radiobutton', undefined, 'Xếp nhanh: áo, quần theo thứ tự size, tay chèn vào chỗ trống');
    var nest = dlg.add('radiobutton', undefined, 'Xếp tối ưu: theo hình dạng thật, có xoay 180° (tiết kiệm vải hơn, chậm hơn)');
    fast.value = true;

    var row = dlg.add('group');
    row.add('statictext', undefined, 'Thời gian tìm cách xếp tối ưu (giây):');
    var secs = row.add('edittext', undefined, '60');
    secs.preferredSize = [60, 20];
    var note = dlg.add('statictext', undefined, 'Nhiều size có thể mất thêm vài phút trước khi bắt đầu tìm.');
    function sync() { row.enabled = note.enabled = nest.value; }
    fast.onClick = nest.onClick = sync;
    sync();

    var btns = dlg.add('group');
    btns.alignment = 'center';
    btns.add('button', undefined, 'OK',     {name: 'ok'});
    btns.add('button', undefined, 'Cancel', {name: 'cancel'});

    if (dlg.show() !== 1) return null;
    if (fast.value) return { engine: 'sequential' };
    var t = parseInt(secs.text, 10);
    if (!(t > 0)) { alert('Thời gian không hợp lệ.'); return null; }
    return { engine: 'nest', timeLimit: t };
}

// Read the CSV and delegate parsing to parseOrders (lib/print_command.jsx).
function parsePrintCommand(file) {
    file.encoding = 'UTF-8';
    if (!file.open('r')) throw new Error('Khong mo duoc file: ' + file.fsName);
    var text = file.read();
    file.close();
    return parseOrders(text);
}
