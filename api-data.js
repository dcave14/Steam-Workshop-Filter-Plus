// Shared, deliberately limited public response schema for the extension and service.
(function (root) {
    'use strict';
    function integer(value) {
        if (typeof value !== 'number' && !(typeof value === 'string' && /^\d+$/.test(value))) return null;
        var n = Number(value); return Number.isSafeInteger(n) && n >= 0 ? n : null;
    }
    function validIds(ids) { return Array.isArray(ids) && ids.length > 0 && ids.length <= 100 && ids.every(function (id) { return typeof id === 'string' && /^\d{1,20}$/.test(id); }); }
    function required(row) {
        if (row.file_type === 2) return [];
        if (!Array.isArray(row.children)) return row.num_children === 0 || row.num_children === '0' ? [] : null;
        if (Number(row.num_children) > row.children.length) return null;
        var ids = [];
        for (var child of row.children) {
            var id = child && child.publishedfileid;
            if (Number.isSafeInteger(id) && id >= 0) id = String(id);
            if (typeof id !== 'string' || !/^\d{1,20}$/.test(id)) return null;
            ids.push(id);
        }
        return Array.from(new Set(ids));
    }
    function parseRows(payload, requested) {
        var rows = payload && payload.response && payload.response.publishedfiledetails;
        if (!Array.isArray(rows)) return [];
        return rows.filter(function (row) { return row && row.result === 1 && requested.indexOf(String(row.publishedfileid)) !== -1 && typeof row.title === 'string'; }).map(function (row) {
            var votes = row.vote_data || {};
            var up = integer(votes.votes_up), down = integer(votes.votes_down);
            return { id: String(row.publishedfileid), title: row.title, ids: required(row),
                description: typeof row.file_description === 'string' ? row.file_description : typeof row.description === 'string' ? row.description : null,
                size: integer(row.file_size), ratings: integer(row.total_votes) ?? (up !== null && down !== null ? up + down : null), updated: Date.now() };
        });
    }
    root.WSHSApiData = { validIds: validIds, parseRows: parseRows };
})(globalThis);
