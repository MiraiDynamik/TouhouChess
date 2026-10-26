import BotWorker from './bot.worker.js?worker&inline';
// One runner per game session. Completed workers retain their bounded TT.
// Cancellation of an in-flight synchronous search must still terminate it.
export function createBotRunner(){
  let worker=null,pending=null;
  const dispose=()=>{if(pending)pending.cancelled=true;pending=null;worker?.terminate();worker=null;};
  function startBot(position,hist,level,onResult,onError){
    if(pending)dispose();
    const job={cancelled:false,done:false};pending=job;
    try{
      worker??=new BotWorker();
      worker.onmessage=({data})=>{
        if(job.cancelled||pending!==job||data.progress)return;
        job.done=true;pending=null;
        if(data.error){dispose();onError(data.error);}else onResult(data);
      };
      worker.onerror=()=>{if(job.cancelled||pending!==job)return;dispose();onError('Worker unavailable');};
      worker.postMessage({state:position,hist,level});
    }catch(error){dispose();onError(String(error));}
    return ()=>{job.cancelled=true;if(!job.done&&pending===job)dispose();};
  }
  return {startBot,dispose};
}
