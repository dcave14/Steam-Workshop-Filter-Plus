// Runs in either page world; relies on stable markup, not extension globals.
function toolbarState() {
    const rect = n => { const r=n.getBoundingClientRect(); return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}; };
    const toolbar=document.querySelector('[data-wshs-toolbar-layout]');
    if(!toolbar)return null;
    const injected=toolbar.querySelector('.wshs-injected-controls');
    const sortIcon=toolbar.querySelector('svg[viewBox="0 0 32 18"]');
    const sort=sortIcon?.closest('button,[role="button"]');
    const nodes=[...injected.querySelectorAll('.hide-subscribed-button'),sort];
    if(nodes.some(n=>!n))return null;
    const controls=nodes.map(rect), rows=[];
    controls.forEach(r=>{let row=rows.find(row=>Math.abs(row[0].top-r.top)<1);if(!row)rows.push(row=[]);row.push(r);});
    rows.sort((a,b)=>a[0].top-b[0].top);rows.forEach(row=>row.sort((a,b)=>a.left-b.left));
    const box=rect(injected), mode=toolbar.dataset.wshsToolbarLayout;
    const equalRows=rows.every(row=>row.every(r=>Math.abs(r.width-row[0].width)<1));
    const filledRows=rows.every(row=>Math.abs(row[0].left-box.left)<1&&Math.abs(row.at(-1).right-box.right)<1);
    const separated=controls.every((a,i)=>controls.every((b,j)=>i===j||a.right<=b.left+.5||b.right<=a.left+.5||a.bottom<=b.top+.5||b.bottom<=a.top+.5));
    const reset=document.querySelector('.wshs-toolbar-reset'),resetBox=reset&&rect(reset);
    const searchRow=reset?.closest('.wshs-search-controls'),gear=searchRow?.querySelector('.SVGIcon_Settings')?.closest('button,[role="button"]'),gearBox=gear&&rect(gear),form=searchRow?.querySelector('form'),formBox=form&&rect(form);
    const right=document.documentElement.getAttribute('data-wshs-sidebar-position')==='right';
    const ordered=gearBox&&formBox&&(right?resetBox.right<=gearBox.left+.5&&gearBox.right<=formBox.left+.5&&gearBox.left-resetBox.right<=8:formBox.right<=gearBox.left+.5&&gearBox.right<=resetBox.left+.5&&resetBox.left-gearBox.right<=8);
    const searchReset=!!ordered&&formBox.width>50&&Math.abs(resetBox.width-gearBox.width)<1&&Math.abs(resetBox.height-gearBox.height)<1&&Math.abs(resetBox.height-formBox.height)<1&&Math.abs(resetBox.top-formBox.top)<1&&Math.abs(gearBox.top-formBox.top)<1;
    const pane=document.querySelector('.wshs-saved-filters')?.parentElement,search=document.querySelector('.wshs-sidebar-search');
    const sidebar=pane&&search&&rect(pane).width>0?{gap:rect(pane).top-rect(search).bottom,search:rect(search),pane:rect(pane)}:null;
    const rowBox=searchRow&&rect(searchRow),searchAligned=!sidebar||rowBox&&Math.abs(rowBox.left-sidebar.pane.left)<1&&Math.abs(rowBox.right-sidebar.pane.right)<1;
    const sortBox=rect(sort),textRects=[],walker=document.createTreeWalker(sort,NodeFilter.SHOW_TEXT);
    for(let n=walker.nextNode();n;n=walker.nextNode())if(n.nodeValue.trim()){const range=document.createRange();range.selectNodeContents(n);textRects.push(...[...range.getClientRects()].map(r=>({left:r.left,right:r.right,top:r.top,bottom:r.bottom})));}
    const sortLabelFits=textRects.length>0&&textRects.every(r=>r.left>=sortBox.left+28&&r.right<=sortBox.right-28&&r.top>=sortBox.top&&r.bottom<=sortBox.bottom);
    const applyButton=toolbar.querySelector('svg[viewBox="0 0 25 24"]')?.closest('button,[role="button"]'),applyBox=applyButton&&rect(applyButton),toolbarBox=rect(toolbar);
    const headerFits=applyBox&&160+applyBox.width+4<=toolbarBox.width+1;
    const apply=applyBox&&{box:applyBox,font:getComputedStyle(applyButton).fontSize,fit:Math.abs(applyBox.width-controls[0].width)<1&&Math.abs(applyBox.height-formBox.height)<1&&getComputedStyle(applyButton).fontSize===getComputedStyle(sort).fontSize&&(Math.abs(applyBox.left-toolbarBox.left)<1||Math.abs(applyBox.right-toolbarBox.right)<1)&&(!headerFits||Math.abs(applyBox.top-formBox.top)<1)&&Math.max(applyBox.bottom,rowBox.bottom)<=controls[0].top+1};
    return {mode,box,controls,rows,equalRows,filledRows,separated,searchReset,searchAligned,sortLabelFits,apply,sidebar,searchRow:rowBox,gear:gearBox,form:formBox,side:document.documentElement.getAttribute('data-wshs-sidebar-position'),reset:resetBox,toolbar:toolbarBox,children:[...toolbar.children].map(n=>({tag:n.tagName,classes:n.className,rect:rect(n),style:n.style.cssText})),inViewport:controls.every(r=>r.left>=-1&&r.right<=innerWidth+1&&r.width>0)};
}
function dropdownFontsState() {
    const menus=[...document.querySelectorAll('.ratings-filter-button,.star-filter-button')].map(button=>{
        const label=button.querySelector('.wshs-button-label')||button,menu=button.parentElement.querySelector('.star-dropdown-content');
        const buttonFont=parseFloat(getComputedStyle(label).fontSize),overflow=[];
        const walker=document.createTreeWalker(menu,NodeFilter.SHOW_TEXT);let largest=0;
        for(let n=walker.nextNode();n;n=walker.nextNode())if(n.nodeValue.trim()){
            const size=parseFloat(getComputedStyle(n.parentElement).fontSize);largest=Math.max(largest,size);
            if(size>buttonFont+.01)overflow.push({text:n.nodeValue.trim(),size});
        }
        return {button:label.textContent,buttonFont,largest,overflow};
    });
    return {fits:menus.length===2&&menus.every(m=>m.overflow.length===0),menus};
}
function applyPanelState() {
    const root=document.querySelector('.wshs-apply-popover:popover-open'),button=document.querySelector('.wshs-apply-filters');
    if(!root||!button)return null;
    const r=root.getBoundingClientRect(),b=button.getBoundingClientRect(),font=parseFloat(getComputedStyle(button).fontSize);
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let largest=0;
    for(let n=walker.nextNode();n;n=walker.nextNode())if(n.nodeValue.trim())largest=Math.max(largest,parseFloat(getComputedStyle(n.parentElement).fontSize));
    const scrollAreas=[root,...root.querySelectorAll('div')].filter(n=>['auto','scroll'].includes(getComputedStyle(n).overflowY)&&n.scrollHeight>n.clientHeight+1&&n.getBoundingClientRect().width>0);
    return {font,largest,width:r.width,buttonWidth:b.width,bounds:{left:r.left,right:r.right,top:r.top,bottom:r.bottom},viewport:{width:innerWidth,height:innerHeight},scrollWidth:root.scrollWidth,clientWidth:root.clientWidth,scrollAreas:scrollAreas.length,fit:Math.abs(r.width-b.width)<1&&r.left>=-1&&r.right<=innerWidth+1&&r.top>=-1&&r.bottom<=innerHeight+1&&root.scrollWidth<=root.clientWidth+1&&largest<=font+.01&&scrollAreas.length<=1};
}
module.exports={toolbarState,dropdownFontsState,applyPanelState};
