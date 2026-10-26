// Exercise the production component's script with the real Svelte runtime.
// Markup is omitted so no DOM dependency is needed; only the worker boundary is mocked.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {compile} from 'svelte/compiler';
const output=await build({
 stdin:{contents:`
  import {flushSync} from 'svelte';
  import {effect_root,render_effect,state as source,get,set} from 'svelte/internal/client';
  import Panel from './web/src/components/AnalysisPanel.svelte';
  import {createGame} from './web/src/game.js';
  export function setup(){
   const game=createGame(),snapshot=source(null);
   const unsubscribe=game.subscribe(value=>set(snapshot,value));
   const props={get position(){return get(snapshot).position},get hist(){return get(snapshot).posHist},
    get legal(){return get(snapshot).legal},get lang(){return get(snapshot).lang},get active(){return get(snapshot).phase==='play'}};
   let panel;
   const destroy=effect_root(()=>render_effect(()=>{panel=Panel(null,props)}));
   flushSync();
   return {game,panel,flush:flushSync,state:()=>get(snapshot),destroy(){destroy();unsubscribe();game.dispose()}};
  }`,resolveDir:process.cwd(),sourcefile:'analysis-panel-harness.js'},
 bundle:true,write:false,format:'esm',platform:'node',conditions:['browser'],
 plugins:[{name:'panel-harness',setup(b){
  b.onLoad({filter:/AnalysisPanel\.svelte$/},args=>{
   const script=readFileSync(args.path,'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
   const instrumented=`<script>${script}\nexport function setEnabledForTest(value){sageOn=value}\nexport function resultForTest(){return sage}\n</script>`;
   return {contents:compile(instrumented,{filename:args.path,generate:'client',dev:false}).js.code,loader:'js',resolveDir:new URL('../web/src/components/',import.meta.url).pathname};
  });
  b.onLoad({filter:/web\/src\/analysis\.js$/},()=>({contents:`export function startAnalysis(position,hist,plain,onResult){
   const job={position,hist,plain,onResult,cancelled:false};globalThis.__analysisJobs.push(job);
   return ()=>{job.cancelled=true;globalThis.__analysisStops++};
  }`,loader:'js'}));
  b.onLoad({filter:/web\/src\/bot\.js$/},()=>({contents:'export function createBotRunner(){throw Error("Unexpected bot load")}',loader:'js'}));
 }}]
});
globalThis.__analysisJobs=[];globalThis.__analysisStops=0;
const {setup}=await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));
const app=setup(),{game,panel,flush,state}=app;
const jobs=globalThis.__analysisJobs;
try{
 game.preset();game.selectSide('b');game.preset();game.start();flush();
 assert.equal(jobs.length,0);
 panel.setEnabledForTest(true);flush();assert.equal(jobs.length,1);
 jobs[0].onResult({depth:8,score:42});flush();
 assert.equal(panel.resultForTest().depth,8);
 for(const action of [()=>game.setBotLevel('hard'),()=>game.flip(),()=>game.toggleLanguage(),()=>game.click(52),()=>game.click(52),()=>game.setBotSide('b')]){
  action();flush();
  assert.equal(jobs.length,1,'unrelated UI updates must not restart analysis');
  assert.equal(globalThis.__analysisStops,0);
  assert.equal(panel.resultForTest().depth,8,'completed analysis depth must survive');
 }
 game.setBotSide('');flush();
 game.click(52);game.click(36);flush(); // e2-e4
 assert.equal(jobs.length,2);assert.equal(globalThis.__analysisStops,1);
 assert.equal(jobs[1].position,state().position);assert.equal(jobs[1].hist,state().posHist);
 assert.equal(panel.resultForTest().depth,undefined);
 game.undo();flush();assert.equal(jobs.length,3);assert.equal(globalThis.__analysisStops,2);
 // Return to the same board with different repetition history must still restart.
 for(const [from,to] of [[62,45],[6,21],[45,62],[21,6]]){game.click(from);game.click(to);flush();}
 assert.equal(jobs.length,7);assert.equal(jobs[6].hist.length,5);
 panel.setEnabledForTest(false);flush();assert.equal(globalThis.__analysisStops,7);
 game.setBotLevel('easy');flush();assert.equal(jobs.length,7);
 panel.setEnabledForTest(true);flush();assert.equal(jobs.length,8);
 game.redeploy();flush();assert.equal(globalThis.__analysisStops,8);
 game.start();flush();assert.equal(jobs.length,9);
 app.destroy();assert.equal(globalThis.__analysisStops,9);
 console.log('Analysis panel: real Svelte effects preserve search across UI changes; move/history/toggle/disposal restart or cancel correctly.');
}finally{delete globalThis.__analysisJobs;delete globalThis.__analysisStops;}
