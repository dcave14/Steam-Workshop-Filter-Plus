// Keeps filter classes on Steam's React-owned cards. React writes a redrawn
// card's className whole, which drops a class such as hidden-item without
// adding or removing a node, so a filtered card would come back into view.
//
// WSHSFilterClasses.set(node, name, on) toggles the class and remembers that
// the node should carry it. Only nodes that currently carry a remembered class
// are watched, and only their own class attribute, so Steam's hover and
// animation class changes on visible cards cost nothing here.
(function () {
    'use strict';
    var expected = new WeakMap(), watched = new WeakSet(), listeners = [];
    // Per class, the nodes remembered as carrying it, so clear() reaches a node
    // whose class React already dropped. Detached nodes are pruned.
    var holders = new Map();
    function prune(nodes) { nodes.forEach(function (node) { if (!node.isConnected) nodes.delete(node); }); }
    function missing(node) {
        var names = expected.get(node);
        if (!names || !node.isConnected) return false;
        for (var i = 0; i < names.length; i++) if (!node.classList.contains(names[i])) return true;
        return false;
    }
    // Compare the final state of the batch: the geometry pass removes and
    // restores filter classes synchronously, and our own writes always leave
    // the node as remembered, so neither reports a loss.
    var observer = new MutationObserver(function (records) {
        for (var i = 0; i < records.length; i++) {
            if (!missing(records[i].target)) continue;
            listeners.forEach(function (listener) { listener(); });
            return;
        }
    });
    function set(node, name, on) {
        var names = expected.get(node), index = names ? names.indexOf(name) : -1;
        if (on && index === -1) {
            if (names) names.push(name); else expected.set(node, [name]);
            var nodes = holders.get(name);
            if (!nodes) holders.set(name, nodes = new Set());
            if (nodes.size >= 512) prune(nodes);
            nodes.add(node);
            if (!watched.has(node)) { watched.add(node); observer.observe(node, { attributes: true, attributeFilter: ['class'] }); }
        } else if (!on && index !== -1) {
            names.splice(index, 1);
            holders.get(name).delete(node);
        }
        if (node.classList.contains(name) !== !!on) node.classList.toggle(name, !!on);
    }
    window.WSHSFilterClasses = {
        set: set,
        // Removes the class from every node remembered as carrying it.
        clear: function (name) {
            var nodes = holders.get(name);
            if (nodes) Array.from(nodes).forEach(function (node) { set(node, name, false); });
        },
        // Called once per batch of class changes in which a card lost a
        // remembered class; the listener re-runs its filters.
        onLost: function (listener) { if (typeof listener === 'function') listeners.push(listener); }
    };
})();
