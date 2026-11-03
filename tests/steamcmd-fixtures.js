// Offline Steam pages for SteamCMD edge cases. Card markup mirrors Steam's
// current React grid: preview, details, and a hover actions row holding a
// Quick View Panel (30px frame, 22px svg tile), lifted 5px on hover.
const APP = '294100';
const link = id => '/sharedfiles/filedetails/?id=' + id;
const magnifier = '<svg class="SVGIcon_Button SVGIcon_MagnifyingGlass" viewBox="0 0 100 100"><path d="M41 12a29 29 0 1 0 18 52l23 24a3 3 0 0 0 4-4L63 60a29 29 0 0 0-22-48zm0 6a23 23 0 1 1 0 46 23 23 0 0 1 0-46z" fill="currentColor"/></svg>';
const steamCss = `body{margin:0;background:#1b2838;color:#acb2b8;font:14px Arial}a{color:#fff;text-decoration:none}
.grid{display:grid;grid-template-columns:repeat(4,242px);gap:16px;padding:40px 30px}
.card{position:relative;background:#2a2e35;box-shadow:#00000094 1px 1px 10px;transition:transform .2s ease-in-out,box-shadow .2s}
.card:hover{transform:translateY(-5px)}
.details{position:relative;display:flex;flex-direction:column;gap:2px;padding:10px}
.actions{opacity:0;display:flex;gap:4px;position:absolute;bottom:1px;right:1px}
.card:hover .actions{opacity:1}
.qv{box-sizing:border-box;width:30px;height:30px;padding:2px;cursor:pointer;color:#acb2b8}
.qv svg{background:#ffffff1a;border-radius:3px;width:22px;height:22px;padding:1px}
.qv:hover{color:#fff}
.aspectratio_16x9{aspect-ratio:16/9;background:#070707}.aspectratio_16x9 a{display:block;height:100%}`;

const escape = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function card(id, title) {
    return `<div class="card Panel"><div class="aspectratio_16x9"><a href="${link(id)}"><img alt="" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="></a></div>` +
        `<div class="details"><div class="stars">★★★★★</div><div class="title"><a href="${link(id)}">${escape(title)}</a></div>` +
        `<div class="author"><a href="/profiles/76561198000000000/myworkshopfiles?appid=${APP}">By Fixture Creator</a></div>` +
        `<div class="actions"><div class="qv Panel" role="button" tabindex="0">${magnifier}</div></div></div></div>`;
}

// cards: [{id, title}]
function browse(cards) {
    return `<!doctype html><html data-wshs-page-hydrated="1"><head><meta charset="utf-8"><title>Workshop fixture</title><style>${steamCss}</style></head>` +
        `<body><div id="CommunityTemplate"><div class="grid Panel">${cards.map(c => card(c.id, c.title)).join('')}</div><div style="height:2000px"></div></div></body></html>`;
}

// Public item page, as workshop-dependencies.js and the item button read it.
function item(id, title, required, options = {}) {
    const requiredHtml = required.length ? `<div id="RequiredItems">${required.map(r => `<a href="https://steamcommunity.com/workshop/filedetails/?id=${r}"><div class="requiredItem">Mod ${r}</div></a>`).join('')}</div>` : '';
    const subscribe = options.noSubscribe ? '' : `<a onclick="SubscribeItem( '${id}', '${APP}' );" id="SubscribeItemBtn" class="btn_green_white_innerfade btn_border_2px btn_medium"><span>Subscribe</span></a>`;
    return `<!doctype html><html><head><meta charset="utf-8"><title>Steam Workshop::${title}</title><style>body{background:#1b2838;color:#acb2b8;font:14px Arial;margin:30px}.game_area_purchase_game{position:relative;width:640px;height:80px;background:#000}.game_area_purchase_game>div{position:absolute;right:16px;top:16px}.btn_medium{display:inline-block;border-radius:2px;cursor:pointer}.btn_border_2px{border:2px solid #000}.btn_medium>span{display:block;padding:0 15px;font-size:15px;line-height:30px}.btn_green_white_innerfade{background:#5c7e10;color:#d2efa9}.btn_darkblue_white_innerfade{background:#2a475e;color:#fff}</style></head><body>` +
        `<div class="workshopItemTitle">${title}</div><div class="game_area_purchase_game"><h1>Subscribe to download</h1><div>${subscribe}</div></div>` +
        `<div class="workshopItemDescription">Fixture description</div>${requiredHtml}<div style="height:1500px"></div></body></html>`;
}

// Steam's "Linked collections" block: heading, then a .collections grid of
// .workshopItem tiles (preview link, title link, item count).
function linkedSection(linked) {
    if (!linked || !linked.length) return '';
    const tiles = linked.map(id => `<div class="workshopItem"><a href="${link(id)}"><div class="workshopItemPreviewHolder"><img class="workshopItemPreviewImage" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="></div></a><a href="${link(id)}"><div class="workshopItemTitle">Linked collection ${id}</div></a><div class="workshopCollectionNumChildren">Items</div></div>`).join('');
    return `<div class="collection"><div class="childrenTitle">Linked collections (${linked.length})</div><div class="collectionChildren_wrap"><div class="collections">${tiles}<div style="clear: left"></div></div></div></div>`;
}

// Classic collection page with native item controls. delayControls mounts
// the controls after load, as Steam sometimes does.
function collection(id, ids, options = {}) {
    const rows = ids.map((child, i) => `<div class="collectionItem" id="sharedfile_${child}"><div class="workshopItem"><a href="${link(child)}"><div class="workshopItemPreviewHolder"><img class="workshopItemPreviewImage" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="></div></a></div><div class="collectionItemDetails"><a href="${link(child)}"><div class="workshopItemTitle">${options.titles ? options.titles[i] : 'Collection mod ' + child}</div></a><div class="workshopItemAuthor"><span class="workshopItemAuthorName"><a href="/profiles/76561198000000000/myworkshopfiles?appid=${APP}">Fixture Creator</a></span></div><div class="workshopItemShortDesc">Short mod description</div></div><div class="subscriptionControls"><a class="general_btn subscribe">+</a></div></div>`).join('');
    const controls = `<div class="workshopItemControls" id="ItemControls"><div class="workshopItemControlCtn"><span role="button" id="FavoriteItemBtn" class="general_btn favorite">Favorite</span></div><div class="workshopItemControlCtn"><span role="button" id="AddToCollectionBtn" class="general_btn share">Add to Collection</span></div><div class="vertical_divider"></div></div>`;
    const mount = options.delayControls ? `<div id="controls-slot"></div><script>setTimeout(()=>{document.getElementById('controls-slot').outerHTML=${JSON.stringify(controls)}},${options.delayControls})</script>` : controls;
    return `<!doctype html><html><head><meta charset="utf-8"><title>Steam Workshop::Fixture collection</title><style>body{background:#1b2838;color:#c7d5e0;font:14px Arial;margin:30px}.general_btn{display:inline-block;padding:7px 9px;background:#314353}.workshopItemControlCtn{display:inline-block}.collectionItem{display:flex;border-bottom:1px solid #333}.workshopItem,.workshopItemPreviewHolder,.workshopItemPreviewImage{width:60px;height:60px}.collectionItemDetails{flex:1;margin:0 10px}.subscribeCollection,.collectionChildren{width:900px}</style></head><body>` +
        `<div class="workshopItemTitle">${options.title || 'Fixture collection'}</div>${mount}` +
        `<div class="subscribeCollection"><a class="general_btn subscribe" onclick="SubscribeCollection( '${id}', '${APP}' );"><span class="subscribeText">Subscribe to all</span></a><span class="general_btn subscribe">Unsubscribe from all</span><span class="general_btn subscribe">Save to Collection</span><div style="clear: right"></div></div>` +
        `<div class="workshopItemDescriptionTitle">Items (${ids.length})</div><div class="collectionChildren">${rows}</div>${linkedSection(options.linked)}</body></html>`;
}

module.exports = { APP, browse, item, collection };
