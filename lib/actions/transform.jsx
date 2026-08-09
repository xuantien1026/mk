#include "action.jsx"
#include "select.jsx"

var Transform = (function () {

    // Exchange a possibly-detached reference for a live one.
    //
    // Illustrator hands out references that stop working while still reading back
    // perfectly: typename, layer, bounds and editable all report fine, but
    // `.selected = true` silently does nothing — so an action plays against an empty
    // selection. A cross-document duplicate() produces one, and so does doScript.
    // Looking the item up again by name is the only way to get a usable handle.
    //
    // Needs a unique name; an unnamed item is handed back as-is. getByName is the
    // native C-level lookup, not the interpreted walk findAllItemsByName does.
    function relive(doc, item) {
        if (!item.name) return item;
        try {
            return doc.pageItems.getByName(item.name);
        } catch (e) {
            return item;
        }
    }

    // Returns a live reference to the transformed item — always keep it and discard
    // the one you passed in.
    function play(doc, item, action) {
        app.activeDocument = doc;

        var target = relive(doc, item);   // the caller's reference may be dead already
        select(target);                   // clears, selects, and redraws — all required
        app.doScript(action.actionName, action.setName);

        doc.selection = null;
        return relive(doc, target);       // doScript kills it again
    }

    // Scale about the item's own centre.
    //
    // NOT about the ruler origin: on a 16299pt artboard, scaling an item that
    // sits at x≈10000 by 130% about (0,0) throws it past 13000 and Illustrator
    // refuses the transform outright. About its own centre the item stays put,
    // and if the .aia origin space (detX/detY) turns out not to match the DOM's,
    // the error is a fraction of the item's SIZE rather than of its distance
    // from the origin — small enough for the caller's re-centring move to absorb.
    function scale(doc, item, sx, sy) {
        var b = item.geometricBounds;   // [left, top, right, bottom]
        return play(doc, item, Action.createScale({
            scaleH: sx,
            scaleV: sy,
            scaleOriginX: (b[0] + b[2]) / 2,
            scaleOriginY: (b[1] + b[3]) / 2,
            scaleStrokes: false
        }));
    }

    function move(doc, item, dx, dy) {
        return play(doc, item, Action.createMove({
            moveH: dx,
            moveV: dy
        }));
    }

    // Drop both sets. Call at the end of a run, and on the error path too, or they
    // linger in the Actions palette.
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
