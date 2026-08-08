// action.jsx — build Illustrator actions by filling placeholders in a
// templated .aia, then load the result.
//
// Everything lives behind the single global `Action`. ExtendScript is ES3: no
// modules, no block scope, and #include is a plain textual inline, so an
// unwrapped file would drop every helper into the entry script's namespace.
// The IIFE below is the only way to keep them private.
//
// Public surface:
//   Action.create(params)     build + load an action, returns the resolved
//                             params (incl. .file)
//   Action.buildText(params)  the filled .aia source, nothing written
//   Action.defaults()         the default param set
//
// Why a template of a RECORDED action rather than an action built from scratch:
// hand-authored .aia files load fine but their steps play as "not currently
// available". Only genuinely recorded actions replay reliably. template.aia
// is a byte-for-byte copy of a real recording (ref.aia) with only the values
// swapped for {{PLACEHOLDERS}}, so what gets loaded is still the real thing.
//
// Placeholders and the .aia parameter each one fills:
//
//   {{SET_NAME}}        set name          (hex name field, length-prefixed)
//   {{ACTION_NAME}}     action name       (hex name field, length-prefixed)
//
//   Scale step (adobe_scale):
//   {{SCALE_UNIFORM}}   unfm  boolean     1 = uniform, 0 = non-uniform
//   {{SCALE_STROKES}}   line  boolean     1 = scale strokes & effects
//   {{SCALE_H}}         hozn  percent     horizontal scale
//   {{SCALE_V}}         vtcl  percent     vertical scale
//   {{SCALE_COPY}}      copy  boolean     1 = transform a duplicate
//   {{SCALE_ORIGIN_X}}  detX  points      transform origin
//   {{SCALE_ORIGIN_Y}}  detY  points
//
//   Move step (adobe_move):
//   {{MOVE_H}}          hozn  points      horizontal distance
//   {{MOVE_V}}          vtcl  points      vertical distance (+V = up)
//   {{MOVE_COPY}}       copy  boolean
//
// Units are baked into the template, not templated: 592474723 = percent,
// 592476268 = points. Feeding a percent into a points slot silently misbehaves,
// so the two are kept apart by position.

var Action = (function () {
    // $.fileName under #include is THIS file, so paths here are relative to
    // lib/actions/ — where template.aia sits.
    var TEMPLATE = File(File($.fileName).parent + '/template.aia');

    var TEMP_DIR  = null;   // File(File($.fileName).parent.parent.parent + '/build'); 
    var KEEP_FILE = false;

    function outputFolder() {
        var dir = TEMP_DIR ? Folder(TEMP_DIR) : Folder.temp;
        if (!dir.exists && !dir.create()) {
            throw new Error('Không tạo được thư mục xuất action:\n' + dir.fsName);
        }
        return dir;
    }

    // Name fields are stored as `[ <byte count>\n<hex>\n]`, so the length
    // prefix has to be recomputed whenever the name changes.
    function aiaHex(s) {
        var h = '';
        for (var i = 0; i < s.length; i++) {
            var c = s.charCodeAt(i).toString(16);
            h += (c.length < 2 ? '0' + c : c);
        }
        return h;
    }

    function aiaNameField(s) {
        return '[ ' + s.length + '\n' + aiaHex(s) + '\n]';
    }

    // `unit real` values always carry a decimal point; String(2) would give "2".
    function aiaReal(v) {
        var s = String(Number(v));
        if (s.indexOf('.') === -1 && s.indexOf('e') === -1 && s.indexOf('E') === -1) s += '.0';
        return s;
    }

    // Booleans are plain 0/1 — a decimal point here would break the parse.
    function aiaBool(v) {
        return v ? '1' : '0';
    }

    // ------------------------------------------------------------- defaults

    // Identity transform: scale 100% about the origin, move nothing, copy
    // nothing. Callers override only the fields they care about.
    function actionDefaults() {
        return {
            setName:      'MKSET',
            actionName:   'MKACTION',
            scaleUniform: false,
            scaleStrokes: false,
            scaleH:       100,
            scaleV:       100,
            scaleCopy:    false,
            scaleOriginX: 0,
            scaleOriginY: 0,
            moveH:        0,
            moveV:        0,
            moveCopy:     false
        };
    }

    function withDefaults(params) {
        var p = actionDefaults();
        for (var k in params) {
            if (params.hasOwnProperty(k)) p[k] = params[k];
        }
        return p;
    }

    // ------------------------------------------------------------- building

    // Fill every placeholder in `text` from `params`. Throws if any {{...}} is
    // left over, which catches a template/helper mismatch at build time
    // instead of letting Illustrator fail on a malformed load.
    function fillTemplate(text, params) {
        var p = withDefaults(params);

        var values = {
            SET_NAME:       aiaNameField(p.setName),
            ACTION_NAME:    aiaNameField(p.actionName),
            SCALE_UNIFORM:  aiaBool(p.scaleUniform),
            SCALE_STROKES:  aiaBool(p.scaleStrokes),
            SCALE_H:        aiaReal(p.scaleH),
            SCALE_V:        aiaReal(p.scaleV),
            SCALE_COPY:     aiaBool(p.scaleCopy),
            SCALE_ORIGIN_X: aiaReal(p.scaleOriginX),
            SCALE_ORIGIN_Y: aiaReal(p.scaleOriginY),
            MOVE_H:         aiaReal(p.moveH),
            MOVE_V:         aiaReal(p.moveV),
            MOVE_COPY:      aiaBool(p.moveCopy)
        };

        var out = text.replace(/\{\{(\w+)\}\}/g, function (whole, name) {
            if (!values.hasOwnProperty(name)) {
                throw new Error('Placeholder không xác định trong template: {{' + name + '}}');
            }
            return values[name];
        });

        var leftover = out.match(/\{\{\w*\}\}/);
        if (leftover) throw new Error('Placeholder chưa được thay: ' + leftover[0]);
        return out;
    }

    // Read the template, fill it from `params`, and return the .aia source.
    function buildActionText(params) {
        // open() returns false on a missing file rather than throwing, which
        // would silently yield an empty .aia — check first.
        if (!TEMPLATE.exists) {
            throw new Error('Không tìm thấy file template:\n' + TEMPLATE.fsName);
        }
        TEMPLATE.open('r');
        var text = TEMPLATE.read();
        TEMPLATE.close();
        return fillTemplate(text, params);
    }

    // Build an action from the template and load it into Illustrator. Returns
    // the resolved params so the caller knows the set/action names to play.
    function createAction(params) {
        var p = withDefaults(params);
        var text = buildActionText(p);

        var out = File(outputFolder() + '/' + p.setName + '_' + p.actionName + '.aia');
        out.encoding = 'UTF-8';
        out.open('w');
        out.write(text);
        out.close();

        // Unload first so repeated calls replace the set instead of stacking.
        try { app.unloadAction(p.setName, ''); } catch (e) {}
        app.loadAction(out);
        if (!KEEP_FILE) {
            try { out.remove(); } catch (e2) {}
        }

        p.file = out;   // where it was written, whether or not it still exists
        return p;
    }

    // ---------------------------------------------------------------- api

    return {
        create:    createAction,
        buildText: buildActionText,
        defaults:  actionDefaults
    };
})();
