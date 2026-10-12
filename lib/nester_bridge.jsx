// Run layout engine 2 — the nester in nester/ — from Illustrator. Needs json.jsx.
//
// ExtendScript can't wait for a process, so: write job.json to a fresh temp folder,
// start the nester hidden through a .vbs (no console window), then poll the folder for
// progress.json / result.json / error.txt (see nester/cli.js). If the nester can't even
// start (e.g. Node missing), cmd leaves failed.txt behind instead.

// How long to wait past job.timeLimit before giving up. Generous: before its search
// starts, the nester computes how every pair of shapes fits together, which takes
// minutes for many sizes (not yet optimized).
var NESTER_SETUP_ALLOWANCE = 60 * 60; // seconds

// root: the scripts folder (the one holding nester/). Uses nester/nest.exe when
// bundled, otherwise Node from the PATH.
function nesterCommand(root) {
    var exe = new File(root + '/nester/nest.exe');
    if (exe.exists) return '"' + exe.fsName + '"';
    return 'node "' + new File(root + '/nester/cli.js').fsName + '"';
}

// The most telling line of an error output: the first "...Error..." line, else the first.
function errorLine(text) {
    var lines = text.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
        if (/Error/.test(lines[i])) return lines[i];
    }
    return lines[0];
}

function removeFolder(folder) {
    var files = folder.getFiles();
    for (var i = 0; i < files.length; i++) files[i].remove();
    folder.remove();
}

// Nest job (see nester/index.js) and return its result. onPoll(progress, elapsedMs) is
// called every poll while waiting — progress is nester/cli.js's progress.json, or null
// before the search has started.
function runNester(job, root, onPoll) {
    var dir = new Folder(Folder.temp.fsName + '/mk_nest_' + (new Date()).getTime());
    dir.create();
    var path = function (name) { return dir.fsName + '\\' + name; };

    writeTextFile(new File(path('job.json')), toJSON(job));
    var cmd = nesterCommand(root) + ' "' + path('job.json') + '" "' + dir.fsName + '"'
            + ' 2> "' + path('stderr.txt') + '" || type nul > "' + path('failed.txt') + '"';
    var vbs = new File(path('run.vbs'));
    writeTextFile(vbs, 'CreateObject("WScript.Shell").Run "cmd /c ""' + cmd.replace(/"/g, '""') + '""", 0, False\r\n');
    if (!vbs.execute()) throw new Error('Không chạy được ' + vbs.fsName);

    var result = new File(path('result.json')), error = new File(path('error.txt'));
    var failed = new File(path('failed.txt')), progress = new File(path('progress.json'));
    var start = (new Date()).getTime();
    var deadline = start + ((job.timeLimit || 60) + NESTER_SETUP_ALLOWANCE) * 1000;
    var last = null;
    for (;;) {
        if (result.exists) {
            var r = parseJSON(readTextFile(result));
            try { removeFolder(dir); } catch (e) { /* the OS cleans temp eventually */ }
            return r;
        }
        if (error.exists) throw new Error('Bộ xếp hình (nester) lỗi:\n' + errorLine(readTextFile(error)));
        if (failed.exists) {
            $.sleep(200); // let cmd finish writing stderr
            throw new Error('Không chạy được bộ xếp hình (nester). Máy đã cài Node.js và chạy "npm install" chưa?\n'
                + errorLine(readTextFile(new File(path('stderr.txt')))));
        }
        var now = (new Date()).getTime();
        if (now > deadline) throw new Error('Bộ xếp hình (nester) chạy quá lâu. Thư mục: ' + dir.fsName);
        if (progress.exists) {
            try { last = parseJSON(readTextFile(progress)); } catch (e) { /* being replaced; next poll */ }
        }
        if (onPoll) onPoll(last, now - start);
        $.sleep(300);
    }
}
