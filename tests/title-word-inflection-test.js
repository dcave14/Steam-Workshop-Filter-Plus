const assert=require('assert/strict');
const {normalize}=require('../title-word-inflection');
const pairs={
 workbenches:'workbench',benches:'bench',weapons:'weapon',bodies:'body',wolves:'wolf',knives:'knife',
 mice:'mouse',children:'child',people:'person',teeth:'tooth',feet:'foot',women:'woman',men:'man',
 machines:'machine',classes:'class',buses:'bus',statuses:'status',boxes:'box',patches:'patch',
 glass:'glass',gas:'gas',status:'status',bus:'bus',analysis:'analysis',series:'series',species:'species',
 news:'news',equipment:'equipment',fish:'fish',sheep:'sheep',chaos:'chaos',cosmos:'cosmos',corps:'corps',
 Atlas:'Atlas',Mars:'Mars',Venus:'Venus',SOS:'SOS',CSS:'CSS',Rimless:'Rimless',Abyss:'Abyss',
 Workbenches:'Workbench',WORKBENCHES:'WORKBENCH',"Man's":"Man's",'M00n1ght':'M00n1ght','工具箱':'工具箱','兵器':'兵器',
 batteries:'battery',colonies:'colony',flies:'fly',dies:'die',ties:'tie',calves:'calf',leaves:'leaf',
 indices:'index',matrices:'matrix',lives:'life',wives:'wife',proofs:'proof',roofs:'roof',pianos:'piano',
 heroes:'hero',potatoes:'potato',tomatoes:'tomato',cookies:'cookie',zombies:'zombie',dice:'die',
 brownies:'brownie',newbies:'newbie',selfies:'selfie',smoothies:'smoothie',calories:'calorie',
 physics:'physics',ethics:'ethics',economics:'economics',mathematics:'mathematics',politics:'politics',
 Cookies:'Cookie',COOKIES:'COOKIE'
};
for(const [input,expected] of Object.entries(pairs))assert.equal(normalize(input),expected,input);
console.log(Object.keys(pairs).length+' title-word inflection checks passed.');
