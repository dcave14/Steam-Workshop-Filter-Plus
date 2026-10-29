const assert = require('assert/strict');
const vm = require('vm'), fs = require('fs'), path = require('path');
const context = {window:{WSHSWordForms:require('../title-word-inflection')}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../filter-matching.js'),'utf8'),context);
const {contains,local} = context.window.WSHSMatching;
const cases = [
    ['AI','AI',true], ['ai survivors','AI',true], ['[AI] textures','AI',true],
    ['AI-powered helpers','AI',true], ['Rain collectors','AI',false],
    ['Train station','AI',false], ['Sailing','AI',false], ['Terrain','AI',false],
    ['Aim training','AI',false], ['AI2 tools','AI',false], ['AI_tools','AI',false],
    ['工具AI工具','AI',false], ['ＡＩ textures','AI',true], ['naïve','AI',false],
    ['aí','AI',false], ['AI\u0301 helpers','AI',false], ['AI’s tools','AI',true],
    ['Uses Project   Viewpoint now','Project Viewpoint',true],
    ['Uses Project Viewpoints','Project Viewpoint',false], ['Tools (C++)','C++',true],
    ['a.b tools','a.b',true], ['axb tools','a.b',false], ['anything','',false],
    ['Workbenches','workbench',true], ['weapons','weapon',true],
    ['WorkbenchTools','workbench',false], ['Mars','mar',false]
];
for (const [text,term,expected] of cases) assert.equal(contains(text,term),expected,`${term} in ${text}`);
assert.equal(local('AI'),true);assert.equal(local('ＮＰＣ'),true);assert.equal(local('rain'),false);
console.log(cases.length+3+' shared matching checks passed.');
