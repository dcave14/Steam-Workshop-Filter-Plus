// At most two test browsers: keep functional checks from saturating the desktop.
// Run performance profiles separately so concurrent tests cannot skew timings.
const {spawn}=require('child_process'),fs=require('fs'),path=require('path');
let suites=[
 ['card-discovery-test.js'],['dom-work-regression-test.js'],['observer-work-regression-test.js'],['workshop-geometry-test.js'],
 ['sidebar-alignment-test.js'],['sidebar-page-size-test.js'],
 ['appearance-test.js'],['preview-motion-test.js'],
 ['browse-collections-test.js'],['browse-collections-test.js','--firefox'],
 ['browse-collections-test.js','--firefox','--comfortable'],
 ['collection-design-test.js'],['collection-details-test.js'],['collection-overhaul-test.js'],['collection-overhaul-test.js','--firefox'],
 ['collection-design-test.js','--firefox'],['collection-details-test.js','--firefox'],
 ['collection-filters-test.js'],['collection-size-ratings-test.js'],
 ['collection-subscriptions-test.js'],['filter-groups-test.js'],
 ['group-visibility-test.js'],['group-visibility-test.js','--firefox'],
 ['collection-picker-motion-test.js'],['collection-picker-motion-test.js','--firefox'],
 ['geometry-fallback-work-test.js'],['collection-picker-work-test.js'],['collection-picker-work-test.js','--firefox'],
 ['quick-view-filters-test.js']
];
const root=path.resolve(__dirname,'..'),out=path.join(__dirname,'out','release-1.5.0');fs.mkdirSync(out,{recursive:true});
const only=process.argv.find(a=>a.startsWith('--only='))?.slice(7);
if(only)suites=suites.filter(args=>args[0].split('-test.js')[0].match(new RegExp(only)));
const resultPath=path.join(out,'results.json');
const results=only&&fs.existsSync(resultPath)?JSON.parse(fs.readFileSync(resultPath)).filter(r=>!suites.some(args=>args.join(' ')===r.name)):[];let next=0;
async function worker(){while(next<suites.length){const args=suites[next++],name=args.join(' '),file=name.replace(/[^a-z0-9.-]/gi,'_')+'.log',start=Date.now();
 console.log('RUN '+name);const log=fs.createWriteStream(path.join(out,file));
 const result=await new Promise(resolve=>{const child=spawn(process.execPath,[path.join(__dirname,args[0]),...args.slice(1)],{cwd:root,windowsHide:true});let tail='';
  function output(chunk){log.write(chunk);tail=(tail+chunk).slice(-5000)}child.stdout.on('data',output);child.stderr.on('data',output);
  child.on('error',e=>{output(String(e));resolve({code:1,tail})});child.on('exit',code=>resolve({code,tail}));
 });log.end();results.push({name,code:result.code,seconds:Math.round((Date.now()-start)/1000),log:file});
 console.log((result.code===0?'PASS ':'FAIL ')+name+' ('+results.at(-1).seconds+'s)');if(result.code!==0)console.log(result.tail);
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));
}}
Promise.all([worker(),worker()]).then(()=>{const failed=results.filter(r=>r.code!==0);console.log(results.length+' suites finished; '+failed.length+' failed.');process.exitCode=failed.length?1:0});
