#include "action.jsx"
#include "select.jsx"

var Transform = (function () {

    function play(doc, item, action) {
        app.activeDocument = doc;

        // Read the name BEFORE the action — afterwards the reference is detached.
        var name = item.name;

        // The reference we were handed may ALREADY be detached — a cross-document
        // duplicate() returns one, and so does any DOM edit nearby. A detached ref
        // reads back perfectly (typename, layer, bounds, editable all fine) but
        // `.selected = true` silently does nothing, so the action then plays against
        // an empty selection. Re-find a live one by name before selecting.
        var target = item;
        if (name) {
            try { target = doc.pageItems.getByName(name); } catch (eP) {}
        }

        select(target);               // clears, selects, and redraws — all required
        app.doScript(action.actionName, action.setName);

        // An action detaches the reference it was given: the item still reads back
        // fine, but `.selected = true` on it silently stops working, so the NEXT
        // action would play against an empty selection. Re-find the live one.
        //
        // By NAME, not doc.selection[0]: an action does not reliably leave only
        // the transformed object selected. It may leave several items — or the
        // group's children — selected, and [0] is then an arbitrary one. That
        // silently substituted a stray path for the design in nhay_size.jsx.
        //
        // getByName is the native C-level lookup, not the interpreted tree walk
        // findAllItemsByName does, and it runs once per play against a redraw and
        // a doScript that each cost far more.
        var fresh = item;
        if (name) {
            try { fresh = doc.pageItems.getByName(name); } catch (e) {}
        }

        doc.selection = null;
        return fresh;
    }

    // Every play gets its OWN set name, so a set is only ever loaded — never
    // unloaded and reloaded mid-run. Reusing one name meant each play unloaded the
    // set it was about to replace, and Illustrator's action engine is unreliable
    // under that churn: a 97% shrink on M_LEFT_PANT_DESIGN, well inside the
    // artboard, was refused while the right pant's identical scale succeeded.
    // Everything loaded is unloaded together by cleanup() at the end of the run.
    var loadedSets = [];
    var playCount  = 0;

    function uniqueNames(kind) {
        playCount++;
        var setName = 'MK_' + kind + '_' + playCount;
        loadedSets.push(setName);
        return { setName: setName, actionName: kind + '_' + playCount };
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
        var n = uniqueNames('SCALE');
        return play(doc, item, Action.createScale({
            setName:      n.setName,
            actionName:   n.actionName,
            scaleH: sx,
            scaleV: sy,
            scaleOriginX: (b[0] + b[2]) / 2,
            scaleOriginY: (b[1] + b[3]) / 2,
            scaleStrokes: false
        }));
    }

    function move(doc, item, dx, dy) {
        var n = uniqueNames('MOVE');
        return play(doc, item, Action.createMove({
            setName:    n.setName,
            actionName: n.actionName,
            moveH: dx,
            moveV: dy
        }));
    }

    // Unload everything this run loaded. Must run at the end — and on the error
    // path too, or the leftovers clutter the palette for the next run.
    function cleanup() {
        for (var i = 0; i < loadedSets.length; i++) {
            try { app.unloadAction(loadedSets[i], ''); } catch (e) {}
        }
        loadedSets = [];
        playCount  = 0;
    }

    return {
        scale:   scale,
        move:    move,
        cleanup: cleanup
    };
})();
