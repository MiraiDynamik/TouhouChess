import {writable} from 'svelte/store';
import * as E from './engine.js';

// Session/controller only: all rules, evaluation and search come from the engine.
export function createGame({loadBot=()=>import('./bot.js')}={}){
  let state={phase:'deploy',side:E.W,pick:null,deploy:{w:new Map(),b:new Map()},
    position:null,legal:[],selected:null,lastMove:null,history:[],log:[],posHist:[],
    choices:null,flipped:false,lang:'zh',botSide:'',botLevel:'normal',thinking:false,botError:false};
  // Published snapshots must never be mutated by the next action. Svelte may
  // still be reading the previous snapshot while derived values are updating.
  const store=writable({...state});
  let botTimer=null,disposed=false,cancelBot=null,botGeneration=0;
  let botAPI=null;
  const publish=()=>store.set({...state});
  const sync=()=>E.setPosHist(state.posHist);
  const stopBot=()=>{botGeneration++;clearTimeout(botTimer);botTimer=null;cancelBot?.();cancelBot=null;state.thinking=false;state.botError=false;};
  function scheduleBot(){
    stopBot();
    if(disposed||state.phase!=='play'||state.choices||!state.botSide.includes(state.position.turn))return;
    sync();
    if(E.outcome(state.position,state.legal).over)return;
    state.thinking=true;
    const generation=botGeneration;
    const fail=()=>{if(generation!==botGeneration||disposed)return;state.thinking=false;state.botError=true;publish();};
    botTimer=setTimeout(async()=>{
      botTimer=null;
      try{
        const module=await loadBot();
        if(generation!==botGeneration||disposed)return;
        botAPI??=module.createBotRunner?module.createBotRunner():module;
        cancelBot=botAPI.startBot(state.position,state.posHist,state.botLevel,result=>{
          if(generation!==botGeneration||disposed)return;
          const m=result.move;
          const move=m&&state.legal.find(x=>x.from===m.from&&x.to===m.to&&
            (x.promo||null)===(m.promo||null)&&(x.drop||null)===(m.drop||null)&&x.castle===m.castle);
          if(!move){fail();return;}
          state.thinking=false;commit(move);
        },fail);
      }catch(error){fail();}
    },60);
  }

  function commit(move){
    stopBot();
    const s=state.position,dark=E.darkSet(s),hidden=dark.has(move.from)||dark.has(move.to);
    const next=move._n||E.applyMove(s,move);
    state.history=[...state.history,{position:s,lastMove:state.lastMove,log:state.log}];
    state.log=[...state.log,hidden?'⋯':E.notate(s,move,next,E.legalMoves(next))];
    state.position=E.vanishPass(next);
    state.posHist=[...state.posHist,E.posKey(state.position)];sync();
    state.lastMove={from:move.from,to:move.to};state.selected=null;state.choices=null;
    state.legal=E.legalMoves(state.position);scheduleBot();publish();
  }
  return {
    subscribe:store.subscribe,
    selectSide(side){state.side=side;publish();},
    selectPiece(type){state.pick=state.pick===type?null:type;publish();},
    preset(){
      const back=['r','n','b','q','k','b','n','r'],dep=new Map();
      const row=state.side===E.W?7:0,pawn=state.side===E.W?6:1;
      for(let f=0;f<8;f++){dep.set(E.at(row,f),back[f]);dep.set(E.at(pawn,f),'p');}
      state.deploy={...state.deploy,[state.side]:dep};publish();
    },
    clear(){state.deploy={...state.deploy,[state.side]:new Map()};publish();},
    click(i){
      if(state.phase==='deploy'){
        const dep=new Map(state.deploy[state.side]);
        if(dep.has(i))dep.delete(i);
        else if(E.canDeploy(state.deploy,state.side,state.pick,i))dep.set(i,state.pick);
        else return;
        state.deploy={...state.deploy,[state.side]:dep};publish();return;
      }
      sync();
      if(state.choices||E.outcome(state.position,state.legal).over)return;
      if(state.selected!==null){
        const candidates=state.legal.filter(m=>m.from===state.selected&&m.to===i);
        const unique=[...new Map(candidates.map(m=>[
          [m.promo||'',m.drop||'',m.castle??''].join('|'),m])).values()];
        if(unique.length===1){commit(unique[0]);return;}
        if(unique.length>1){stopBot();state.choices=unique;publish();return;}
      }
      const piece=state.position.b[i];
      state.selected=E.darkSet(state.position).has(i)||(piece&&piece.c===state.position.turn)?i:null;
      publish();
    },
    choose(move){if(state.choices?.includes(move))commit(move);},
    start(){
      if(!E.readySide(state.deploy.w)||!E.readySide(state.deploy.b))return;
      stopBot();botAPI?.dispose?.();state.position=E.buildState(state.deploy.w,state.deploy.b);
      state.history=[];state.log=[];state.lastMove=null;state.selected=null;state.choices=null;
      state.posHist=[E.posKey(state.position)];sync();state.legal=E.legalMoves(state.position);
      state.phase='play';scheduleBot();publish();
    },
    undo(){
      stopBot();if(!state.history.length){publish();return;}
      const previous=state.history.at(-1);
      state.history=state.history.slice(0,-1);state.position=previous.position;
      state.lastMove=previous.lastMove;state.log=previous.log;state.selected=null;state.choices=null;
      state.posHist=state.posHist.slice(0,-1);sync();state.legal=E.legalMoves(state.position);publish();
    },
    redeploy(){stopBot();botAPI?.dispose?.();state.phase='deploy';state.choices=null;state.selected=null;publish();},
    flip(){state.flipped=!state.flipped;publish();},
    toggleLanguage(){state.lang=state.lang==='zh'?'en':'zh';publish();},
    setBotSide(side){state.botSide=side;scheduleBot();publish();},
    setBotLevel(level){state.botLevel=level;scheduleBot();publish();},
    dispose(){disposed=true;stopBot();botAPI?.dispose?.();},
  };
}
