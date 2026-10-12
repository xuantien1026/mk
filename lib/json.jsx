// JSON for ExtendScript, which (being ES3) has no built-in JSON object.

// Serialize numbers, strings, booleans, null, arrays and plain objects.
function toJSON(v) {
    if (v === null || v === undefined) return 'null';
    var t = typeof v;
    if (t === 'number')  return isFinite(v) ? String(v) : 'null';
    if (t === 'boolean') return String(v);
    if (t === 'string') {
        return '"' + v.replace(/[\\"\u0000-\u001f]/g, function (c) {
            if (c === '"')  return '\\"';
            if (c === '\\') return '\\\\';
            var h = c.charCodeAt(0).toString(16);
            return '\\u' + '0000'.substr(h.length) + h;
        }) + '"';
    }
    var out = [];
    if (Object.prototype.toString.call(v) === '[object Array]') {
        for (var i = 0; i < v.length; i++) out.push(toJSON(v[i]));
        return '[' + out.join(',') + ']';
    }
    for (var k in v) {
        if (v.hasOwnProperty(k)) out.push(toJSON(k) + ':' + toJSON(v[k]));
    }
    return '{' + out.join(',') + '}';
}

// Parse JSON we wrote ourselves (the nester's output) — trusted input only.
function parseJSON(text) {
    return eval('(' + text + ')');
}

function writeTextFile(file, text) {
    file.encoding = 'UTF-8';
    if (!file.open('w')) throw new Error('Không ghi được file ' + file.fsName);
    file.write(text);
    file.close();
}

function readTextFile(file) {
    file.encoding = 'UTF-8';
    if (!file.open('r')) throw new Error('Không đọc được file ' + file.fsName);
    var text = file.read();
    file.close();
    return text;
}
