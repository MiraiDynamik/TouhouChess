import {analysisSteps,setPosHist,setSearchState} from './engine.js';
// Protocol only. Search lives in engine/search.ts.
self.onmessage=({data})=>{
  setPosHist(data.hist);setSearchState();
  for(const result of analysisSteps(data.state,{hist:data.hist,plain:data.plain})){
    if(!result.progress)self.postMessage(result);
  }
  self.postMessage({done:true});
};
