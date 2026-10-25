import {timedMove} from './engine.js';
// Protocol only; all move selection and search remain in engine/.
self.onmessage=({data})=>{
  try{
    const result=timedMove(data.state,data.level,{hist:data.hist,
      onDepth:result=>self.postMessage({progress:true,depth:result.depth})});
    const m=result.move;
    self.postMessage({...result,move:m?{from:m.from,to:m.to,promo:m.promo,drop:m.drop,castle:m.castle}:null});
  }catch(error){self.postMessage({error:String(error.message||error)});}
};
