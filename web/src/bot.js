import BotWorker from './bot.worker.js?worker&inline';
export function startBot(position,hist,level,onResult,onError){
  let worker=null,cancelled=false;
  try{
    worker=new BotWorker();
    worker.onmessage=({data})=>{
      if(cancelled||data.progress)return;
      worker.terminate();
      if(data.error)onError(data.error);else onResult(data);
    };
    worker.onerror=()=>{worker.terminate();if(!cancelled)onError('Worker unavailable');};
    worker.postMessage({state:position,hist,level});
  }catch(error){worker?.terminate();onError(String(error));}
  return ()=>{cancelled=true;worker?.terminate();};
}
