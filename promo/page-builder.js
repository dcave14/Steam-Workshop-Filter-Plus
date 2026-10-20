// page-builder.js
// Builds the mock browser and one Steam Workshop page per game. Styling copies
// the extension's injected controls (styles.css) on Steam's new layout.

(function () {
    const data = window.SCENE_DATA;

    const STAR = 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z';
    const EYE_OFF = '<path fill="currentColor" fill-rule="evenodd" d="M12 4.5C6.9 4.5 3 8.53 1.8 12c1.2 3.47 5.1 7.5 10.2 7.5s9-4.03 10.2-7.5C21 8.53 17.1 4.5 12 4.5zm0 12a4.5 4.5 0 110-9 4.5 4.5 0 010 9z"/><path d="M4.2 2.5l17.3 19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
    const CHEVRON = '<svg class="chev" viewBox="0 0 12 8"><path fill="currentColor" d="M5.62915 7.5L0 0L11.2583 0L5.62915 7.5Z"/></svg>';
    const CHECK = 'M9.55 17.6L3.4 11.45l2.12-2.12 4.03 4.03 8.93-8.93 2.12 2.12L9.55 17.6z';
    const SORT = '<path d="M3 6h11M3 11h8M3 16h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M18 5v13m-3.5-3.5L18 18l3.5-3.5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';

    function el(tag, cls, html) {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (html !== undefined) n.innerHTML = html;
        return n;
    }

    function starsHTML(count) {
        let s = '';
        for (let i = 0; i < 5; i++) {
            s += `<svg viewBox="0 0 24 24"><path d="${STAR}" fill="${i < count ? '#1a9fff' : '#3b4350'}"/></svg>`;
        }
        return s;
    }

    function buildChrome(browser) {
        const strip = el('div', 'tabstrip');
        strip.appendChild(el('div', 'dots', '<i></i><i></i><i></i>'));
        const tabBg = el('div', 'tab-bg');
        strip.appendChild(tabBg);
        const tabs = data.games.map(g => {
            const t = el('div', 'tab', `<span class="fav"></span><span class="tab-title">${g.tab}</span><span class="tab-x">×</span>`);
            strip.appendChild(t);
            return t;
        });
        strip.appendChild(el('div', 'tab-plus', '+'));
        browser.appendChild(strip);

        const bar = el('div', 'toolbar');
        bar.innerHTML = `
            <span class="nav-ico">&#8592;</span><span class="nav-ico">&#8594;</span><span class="nav-ico">&#8635;</span>
            <div class="omnibox"><span class="lock"></span><span><span class="host"></span><span class="path"></span></span></div>
            <div class="ext-pin"><img src="../icons/icon-source.png" alt=""><span class="ext-badge">ON</span></div>
            <div class="avatar"></div>`;
        browser.appendChild(bar);
        return {
            tabs,
            tabBg,
            host: bar.querySelector('.host'),
            path: bar.querySelector('.path'),
            extBadge: bar.querySelector('.ext-badge')
        };
    }

    function buildControls() {
        const controls = el('div', 'controls');
        const pitch = 256 + 16;

        const star = el('div', 'wbtn star-btn');
        star.style.left = pitch + 'px';
        star.innerHTML = `<svg class="lico" viewBox="0 0 24 24"><path fill="currentColor" d="${STAR}"/></svg>
            <span class="lbl">Star Rating</span>${CHEVRON}<div class="flash"></div><div class="ring"></div>`;

        const hide = el('div', 'wbtn hide-btn');
        hide.style.left = pitch * 2 + 'px';
        hide.innerHTML = `<svg class="lico" viewBox="0 0 24 24">${EYE_OFF}</svg>
            <span class="lbl">Hide Subscribed</span>
            <svg class="slot" viewBox="0 0 24 24"><path fill="currentColor" d="${CHECK}"/></svg>
            <div class="flash"></div><div class="ring"></div>`;

        const sort = el('div', 'wbtn sort-btn');
        sort.style.left = pitch * 3 + 'px';
        sort.innerHTML = `<svg class="lico" viewBox="0 0 24 24">${SORT}</svg><span class="lbl">${data.sortLabel}</span>${CHEVRON}`;

        const dropdown = el('div', 'dropdown');
        dropdown.style.left = pitch + 'px';
        const opts = data.starOptions.map(text => {
            const o = el('div', 'opt', text);
            dropdown.appendChild(o);
            return o;
        });

        controls.append(star, hide, sort, dropdown);
        return { controls, star, hide, sort, dropdown, opts };
    }

    function buildCard(game, card, index) {
        const n = el('div', 'card');
        const content = el('div', 'content');
        content.innerHTML = `<div class="thumb">${window.thumbSVG(card.art, game.id + index + card.title)}</div>
            <div class="info"><div class="stars">${starsHTML(card.stars)}</div>
            <div class="title">${card.title}</div><div class="author">By ${card.author}</div></div>`;
        n.appendChild(content);
        let badge = null;
        if (card.sub) {
            badge = el('div', 'sub-badge', `<svg viewBox="0 0 24 24"><path fill="currentColor" d="${CHECK}"/></svg>Subscribed`);
            content.appendChild(badge);
        }
        let skeleton = null;
        if (card.batch) {
            skeleton = el('div', 'skeleton', '<div class="sk-thumb"></div><div class="sk-line" style="width:40%"></div><div class="sk-line" style="width:70%"></div><div class="sk-line" style="width:45%"></div><div class="sheen"></div>');
            n.appendChild(skeleton);
        }
        return { el: n, data: card, content, badge, skeleton, sheen: skeleton && skeleton.querySelector('.sheen') };
    }

    function buildPage(game) {
        const page = el('div', 'page');
        const scroller = el('div', 'scroller');
        const c = el('div', 'container');

        const banner = el('div', 'banner', window.bannerSVG(game.id));
        banner.appendChild(el('div', 'banner-text', `<div class="banner-title">${game.title}</div><div class="banner-sub">${game.subtitle}</div>`));
        c.appendChild(banner);

        c.appendChild(el('div', 'steam-nav',
            '<span>Home</span><span class="sel">Browse <i class="caret"></i></span><span>Your Items <i class="caret"></i></span><span>Discussions</span><span>About</span>'));

        c.appendChild(el('div', 'browsing',
            `<div class="browsing-title">Browsing: Items<span>(Subscribe to add to your game)</span></div>
             <div class="browsing-count">${game.entries} entries matching filters</div>`));

        const cols = el('div', 'cols');
        const side = el('div', 'sidebar');
        side.innerHTML = `<div class="search-row"><div class="search">${game.search}</div><div class="gear">&#9881;</div></div>
            <div class="side-label">SPECIAL FILTERS:</div><div class="side-select">None</div>
            <div class="side-label">CATEGORIES</div>` +
            game.categories.map(cat => `<div class="cat"><i>+</i><i>&minus;</i>${cat}</div>`).join('');
        const main = el('div', 'main');
        const ctl = buildControls();
        const grid = el('div', 'grid');
        main.append(ctl.controls, grid);
        cols.append(side, main);
        c.appendChild(cols);
        scroller.appendChild(c);
        page.appendChild(scroller);

        const cards = game.cards.map((card, i) => {
            const built = buildCard(game, card, i);
            grid.appendChild(built.el);
            return built;
        });

        return {
            game,
            el: page,
            scroller,
            grid,
            cards,
            star: ctl.star,
            hide: ctl.hide,
            sort: ctl.sort,
            dropdown: ctl.dropdown,
            opts: ctl.opts,
            starLbl: ctl.star.querySelector('.lbl'),
            hideLbl: ctl.hide.querySelector('.lbl'),
            hideSlot: ctl.hide.querySelector('.slot')
        };
    }

    window.buildScene = function () {
        const browser = document.getElementById('browser');
        const chrome = buildChrome(browser);
        const viewport = el('div', 'viewport');
        browser.appendChild(viewport);
        const pages = data.games.map(g => {
            const p = buildPage(g);
            viewport.appendChild(p.el);
            return p;
        });
        return { browser, chrome, viewport, pages };
    };
})();
