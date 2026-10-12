#target illustrator
#include "../lib/json.jsx"
#include "../lib/nester_bridge.jsx"

// Engine 2, phase 0 — can Illustrator start the nester and get its result back?
// Needs no open document. Nests six small rectangles for ~3 seconds and reports how it
// went. On success it shows a summary; on failure, the reason (e.g. Node not installed).

var ROOT = new File($.fileName).parent.parent.fsName;

function rect(wCm, hCm) {
    var w = wCm * 28.3465, h = hCm * 28.3465;
    return { w: w + 1, h: h + 1, pad: 0.5, rings: [[0.5, 0.5, w + 0.5, 0.5, w + 0.5, h + 0.5, 0.5, h + 0.5]] };
}

function main() {
    var job = {
        sheet: { w: 159 * 28.3465, h: 500 * 28.3465 }, gap: 3 * 2.83465, rotations: [0, 180], timeLimit: 3,
        shapes: { A: rect(60, 80), B: rect(30, 100) },
        parts: [{ shape: 'A' }, { shape: 'A' }, { shape: 'B' }, { shape: 'B' }, { shape: 'B' }, { shape: 'B' }]
    };

    var win = new Window('palette', 'Thử bộ xếp hình');
    var status = win.add('statictext', undefined, 'Đang khởi động...');
    status.preferredSize = [320, 20];
    win.show();

    var t0 = (new Date()).getTime(), firstProgress = null, polls = 0;
    try {
        var result = runNester(job, ROOT, function (p, elapsedMs) {
            polls++;
            if (p && firstProgress === null) firstProgress = elapsedMs;
            status.text = p ? 'Thế hệ ' + p.generation + ', ' + p.sheets + ' tấm, ' + Math.round(elapsedMs / 1000) + 's'
                            : 'Đang khởi động... ' + Math.round(elapsedMs / 1000) + 's';
            win.update();
        });
    } finally {
        win.close();
    }
    var total = (new Date()).getTime() - t0;
    alert('Bộ xếp hình chạy được!\n\n'
        + 'Lệnh: ' + nesterCommand(ROOT) + '\n'
        + 'Tiến độ đầu tiên sau: ' + (firstProgress === null ? '—' : firstProgress + ' ms') + ' (' + polls + ' lần kiểm tra)\n'
        + 'Tổng thời gian: ' + total + ' ms\n'
        + 'Kết quả: ' + result.placements.length + ' chi tiết trên ' + result.sheets + ' tấm.\n\n'
        + 'Gửi kết quả này cho Claude.');
}

try {
    main();
} catch (e) {
    alert('Lỗi: ' + e.message + '\nLine: ' + e.line);
}
