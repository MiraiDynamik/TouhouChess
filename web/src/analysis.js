import AnalysisWorker from './analysis.worker.js?worker&inline';
import {analysisSteps,setSearchState,clearSearchDeadline} from './engine.js';

// Each call owns an isolated Worker. Termination also prevents stale results.
export function startAnalysis(position,hist,plain,onResult){
  let worker=null,timer=null,cancelled=false;
  function fallback(){
    worker?.terminate();worker=null;
    const iterator=analysisSteps(position,{hist,plain});
    function step(){
      if(cancelled)return;
      try{
        setSearchState({rep:new Set(hist),end:performance.now()+700});
        const {value,done}=iterator.next();
        if(done){onResult({done:true,noWorker:true});return;}
        if(!value.progress){
          onResult({...value,noWorker:true});
          if(value.depth>=12){onResult({done:true,noWorker:true});return;}
        }
      }catch(error){onResult({done:true,noWorker:true});return;}
      finally{clearSearchDeadline();}
      timer=setTimeout(step,0);
    }
    onResult({noWorker:true});timer=setTimeout(step,0);
  }
  try{
    worker=new AnalysisWorker();
    worker.onmessage=({data})=>{if(!cancelled)onResult(data);};
    worker.onerror=()=>{if(!cancelled)fallback();};
    worker.postMessage({state:position,hist,plain});
  }catch(error){fallback();}
  return ()=>{cancelled=true;worker?.terminate();clearTimeout(timer);};
}
