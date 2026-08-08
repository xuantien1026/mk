#include "action.jsx"
#include "select.jsx"

var Transform = (function () {
    function play(doc, item, action) {
        app.activeDocument = doc;
        select(item);                 // clears, selects, and redraws — all required
        app.doScript(action.actionName, action.setName);
        var fresh = (doc.selection && doc.selection.length > 0) ? doc.selection[0] : item;
        doc.selection = null;
        return fresh;
    }

    function scale(doc, item, sx, sy) {
        return play(doc, item, Action.createScale({
            scaleH: sx,
            scaleV: sy,
            scaleOriginX: 0,
            scaleOriginY: 0,
            scaleStrokes: false
        }));
    }

    function move(doc, item, dx, dy) {
        return play(doc, item, Action.createMove({
            moveH: dx,
            moveV: dy
        }));
    }

    function cleanup() {
        try { app.unloadAction('MKSCALESET', ''); } catch (e1) {}
        try { app.unloadAction('MKMOVESET',  ''); } catch (e2) {}
    }

    return {
        scale:   scale,
        move:    move,
        cleanup: cleanup
    };
})();
