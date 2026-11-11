// Shared title/description matching. Comments are never passed to this matcher.
(function () {
    'use strict';
    function normalize(text) { return String(text || '').normalize('NFKC').replace(/\s+/g, ' ').toLowerCase(); }
    function contains(text, phrase) {
        text = normalize(text); phrase = normalize(phrase).trim();
        if (!phrase) return false;
        var escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Unicode letters, marks and numbers are word characters. Punctuation,
        // brackets and hyphens delimit terms, including acronyms such as AI.
        if (new RegExp('(?:^|[^\\p{L}\\p{M}\\p{N}_])' + escaped + '(?=$|[^\\p{L}\\p{M}\\p{N}_])', 'u').test(text)) return true;
        // Retain title-word singular/plural matching without matching fragments.
        if (/^[a-z]{4,}$/.test(phrase) && window.WSHSWordForms) {
            var base = window.WSHSWordForms.normalize(phrase);
            return (text.match(/[\p{L}\p{M}\p{N}_'’]+/gu) || []).some(function (word) {
                return window.WSHSWordForms.normalize(word) === base;
            });
        }
        return false;
    }
    window.WSHSMatching = {
        contains: contains,
        local: function (phrase) { return /^[\p{L}\p{N}]{1,3}$/u.test(normalize(phrase).trim()); }
    };
})();
