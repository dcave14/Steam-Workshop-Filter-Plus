// English title-word normalization. pluralize 8.0.0 is bundled locally (MIT).
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./pluralize.js'));
    else root.WSHSWordForms = factory(root.pluralize);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (pluralize) {
    'use strict';
    // Singular names/mass nouns that otherwise resemble English plurals.
    var unchanged = new Set(['chaos', 'cosmos', 'corps', 'sos', 'mars', 'venus', 'zeus', 'ares', 'hades',
        'physics', 'ethics', 'economics', 'mathematics', 'politics']);
    var special = { cookies: 'cookie', dies: 'die', brownies: 'brownie', newbies: 'newbie',
        selfies: 'selfie', smoothies: 'smoothie', calories: 'calorie' };
    function normalize(word) {
        // Leave possessives, acronyms with digits and other languages intact.
        if (!/^[a-z]+$/i.test(word) || unchanged.has(word.toLowerCase())) return word;
        var exact = special[word.toLowerCase()];
        if (exact) {
            if (word === word.toUpperCase()) return exact.toUpperCase();
            return word[0] === word[0].toUpperCase() ? exact[0].toUpperCase() + exact.slice(1) : exact;
        }
        return pluralize.singular(word);
    }
    return { normalize: normalize };
});
