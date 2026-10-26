/* PGN/SAN boundary. Legality and transitions always come from the shared rules. */
import {P} from './pieces.js';
import {nm,file,rank} from './board.js';
import {legalMoves,applyMove,vanishPass,inCheck,hasLegal} from './rules.js';

export const START_FEN='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const ordinary=t=>['p','n','b','r','q','k'].includes(t);
const square=x=>{if(!/^[a-h][1-8]$/.test(x))throw Error('Invalid square: '+x);return (8-Number(x[1]))*8+x.charCodeAt(0)-97;};
const clone=x=>JSON.parse(JSON.stringify(x));
export const recordedMove=m=>Object.fromEntries(['from','to','promo','drop','castle','epc','dbl','cost'].filter(k=>m[k]!==undefined).map(k=>[k,m[k]]));
const sameMove=(a,b)=>['from','to','promo','drop','castle'].every(k=>(a[k]??null)===(b[k]??null));
export function resolveRecordedMove(s,m){
  const found=legalMoves(s).find(x=>sameMove(x,m));
  if(!found)throw Error('Illegal move: '+JSON.stringify(m));
  return found;
}
export const nextPosition=(s,m)=>vanishPass(applyMove(s,m));

function checkedState(s){
  if(!s||!Array.isArray(s.b)||s.b.length!==64||!['w','b'].includes(s.turn))throw Error('Invalid initial position');
  const b=s.b.map(p=>{
    if(p===null)return null;
    if(!p||!Object.hasOwn(P,p.t)||!['w','b'].includes(p.c)||![undefined,0,1].includes(p.mark))throw Error('Invalid piece');
    return {t:p.t,c:p.c,...(p.mark?{mark:1}:{})};
  });
  for(const c of ['w','b'])if(b.filter(p=>p?.c===c&&P[p.t].royal).length!==1)throw Error('Exactly one royal per side is required');
  if(!Number.isInteger(s.half)||s.half<0||!Number.isInteger(s.full)||s.full<1)throw Error('Invalid move counters');
  if(s.ep!==null&&(!Number.isInteger(s.ep)||s.ep<0||s.ep>63))throw Error('Invalid en passant square');
  const cas={};for(const k of ['w0','w7','b0','b7']){if(typeof s.cas?.[k]!=='boolean')throw Error('Invalid castling rights');cas[k]=s.cas[k];}
  for(const c of ['w','b'])if(!Number.isFinite(s.ammo?.[c])||s.ammo[c]<0)throw Error('Invalid ammunition');
  const result={b,turn:s.turn,cas,ep:s.ep,half:s.half,full:s.full,ammo:{w:s.ammo.w,b:s.ammo.b}};
  if(inCheck(result,s.turn==='w'?'b':'w'))throw Error('The side that just moved is in check');
  return result;
}
export function fromFEN(fen){
  const parts=fen.trim().split(/\s+/);if(parts.length!==6)throw Error('FEN must have six fields');
  const [board,turn,rights,ep,half,full]=parts;
  const b=[];const rows=board.split('/');if(rows.length!==8)throw Error('FEN must have eight ranks');
  for(const row of rows){const start=b.length;for(const ch of row){
    if(/[1-8]/.test(ch))b.push(...Array(Number(ch)).fill(null));
    else if(/[pnbrqk]/i.test(ch))b.push({t:ch.toLowerCase(),c:ch===ch.toUpperCase()?'w':'b'});
    else throw Error('Unknown FEN piece');
  }if(b.length-start!==8)throw Error('Invalid FEN rank');}
  if(!/^(?:-|K?Q?k?q?)$/.test(rights)||!rights||!/^\d+$/.test(half)||!/^\d+$/.test(full))throw Error('Invalid FEN fields');
  const cas={w7:rights.includes('K'),w0:rights.includes('Q'),b7:rights.includes('k'),b0:rights.includes('q')};
  const s=checkedState({b,turn,cas,ep:ep==='-'?null:square(ep),half:Number(half),full:Number(full),ammo:{w:0,b:0}});
  for(const [flag,k,r,c] of [['w7',60,63,'w'],['w0',60,56,'w'],['b7',4,7,'b'],['b0',4,0,'b']]){
    if(cas[flag]&&!(b[k]?.t==='k'&&b[k]?.c===c&&b[r]?.t==='r'&&b[r]?.c===c))throw Error('Castling rights do not match king/rook');
  }
  if(b.some((p,i)=>p?.t==='p'&&(rank(i)===0||rank(i)===7)))throw Error('Unpromoted pawn on last rank');
  if(s.ep!==null){const pawn=s.ep+(turn==='w'?8:-8);
    if(rank(s.ep)!==(turn==='w'?2:5)||b[s.ep]||b[pawn]?.t!=='p'||b[pawn]?.c===turn)throw Error('Invalid en passant target');}
  return s;
}
export function toFEN(s){
  if(s.b.some(p=>p&&(!ordinary(p.t)||p.mark)))throw Error('Fairy pieces require TFC extension');
  const rows=[];for(let r=0;r<8;r++){let row='',empty=0;for(let f=0;f<8;f++){
    const p=s.b[r*8+f];if(!p){empty++;continue;}if(empty){row+=empty;empty=0;}row+=p.c==='w'?p.t.toUpperCase():p.t;
  }if(empty)row+=empty;rows.push(row);}
  const rights=[['w7','K'],['w0','Q'],['b7','k'],['b0','q']].filter(([k])=>s.cas[k]).map(([,v])=>v).join('')||'-';
  return `${rows.join('/')} ${s.turn} ${rights} ${s.ep===null?'-':nm(s.ep)} ${s.half} ${s.full}`;
}
export function san(s,m,moves=legalMoves(s)){
  const p=s.b[m.from];let text;
  if(m.castle!==undefined)text=m.castle===7?'O-O':'O-O-O';
  else if(m.drop)text=`D${m.drop}_${nm(m.from)}_${nm(m.to)}`;
  else if(!ordinary(p.t))text=`X${p.t}_${nm(m.from)}${s.b[m.to]||m.epc?'x':'-'}${nm(m.to)}`+(m.promo?'='+m.promo:'');
  else{
    const capture=!!(s.b[m.to]||m.epc);let dis='';
    if(p.t!=='p'){
      const others=moves.filter(x=>!x.drop&&x.from!==m.from&&x.to===m.to&&s.b[x.from]?.t===p.t);
      if(others.length)dis=others.every(x=>file(x.from)!==file(m.from))?nm(m.from)[0]:others.every(x=>rank(x.from)!==rank(m.from))?nm(m.from)[1]:nm(m.from);
    }
    text=(p.t==='p'?(capture?nm(m.from)[0]:''):p.t.toUpperCase()+dis)+(capture?'x':'')+nm(m.to)+(m.promo?'='+m.promo.toUpperCase():'');
  }
  const next=nextPosition(s,m);
  return text+(inCheck(next,next.turn)?hasLegal(next)?'+':'#':'');
}
const normalized=s=>s.replace(/0/g,'O').replace(/[!?]+$/,'').replace(/[+#]+$/,'');
const results=['1-0','0-1','1/2-1/2','*'];

// One game/mainline only. Comments, NAGs and RAVs are explicitly reported as omitted.
export function parsePGN(text){
  if(typeof text!=='string'||text.length>2_000_000)throw Error('PGN is too large');
  text=text.replace(/^\uFEFF/,'').replace(/^%[^\n]*$/gm,'').trim();
  const headers=Object.create(null);let match;
  const tag=/^\[([A-Za-z0-9_]+)\s+"((?:\\.|[^"\\])*)"\s*\]\s*/;
  while((match=tag.exec(text))){if(Object.hasOwn(headers,match[1]))throw Error('Duplicate PGN tag');headers[match[1]]=match[2].replace(/\\(["\\])/g,'$1');text=text.slice(match[0].length);}
  if(headers.Variant&&!['Standard','Chess','Touhou Fairy Chess'].includes(headers.Variant))throw Error('Unsupported Variant: '+headers.Variant);
  let initial;
  if(headers.Variant==='Touhou Fairy Chess'){
    if(headers.TFCVersion!=='1'||!headers.TFCState)throw Error('Unsupported or missing TFC version/state');
    initial=checkedState(JSON.parse(decodeURIComponent(headers.TFCState)));
  }else{
    if(headers.TFCState||headers.TFCVersion)throw Error('TFC tags require Variant');
    if(headers.SetUp&&!['0','1'].includes(headers.SetUp))throw Error('Invalid SetUp tag');
    if(headers.SetUp==='1'&&!headers.FEN)throw Error('SetUp requires FEN');
    initial=fromFEN(headers.FEN||START_FEN);
  }
  let clean='',depth=0,annotated=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(ch==='{'){annotated=true;const end=text.indexOf('}',i+1);if(end<0)throw Error('Unclosed comment');i=end;clean+=' ';continue;}
    if(ch===';'){annotated=true;const end=text.indexOf('\n',i);i=end<0?text.length:end;clean+=' ';continue;}
    if(ch==='('){depth++;annotated=true;continue;}if(ch===')'){if(!depth)throw Error('Unmatched variation');depth--;clean+=' ';continue;}
    if(!depth)clean+=ch;
  }
  if(depth)throw Error('Unclosed variation');
  if(/[\[\]{}]/.test(clean))throw Error('Only one PGN game can be imported at a time');
  if(/\$\d+|[!?]/.test(clean))annotated=true;
  clean=clean.replace(/\$\d+/g,' ').replace(/\d+\.(?:\.\.)?/g,' ');
  const moves=[],states=[initial],notations=[];let result=null;
  for(const token of clean.trim().split(/\s+/).filter(Boolean)){
    if(results.includes(token)){if(result!==null)throw Error('Multiple results');result=token;continue;}
    if(result!==null)throw Error('Moves after result');
    if(token==='e.p.')continue;
    if(moves.length>=5000)throw Error('Too many moves');
    const s=states.at(-1),legal=legalMoves(s),candidates=legal.filter(m=>normalized(san(s,m,legal))===normalized(token));
    if(candidates.length!==1)throw Error(`Ply ${moves.length+1}: illegal or ambiguous SAN "${token}"`);
    const m=candidates[0];moves.push(recordedMove(m));notations.push(san(s,m,legal));states.push(nextPosition(s,m));
  }
  if(headers.Result&&!results.includes(headers.Result))throw Error('Invalid Result tag');
  if(result&&headers.Result&&result!==headers.Result)throw Error('Result tag and movetext disagree');
  return {initial,moves,states,notations,headers:{...headers},result:result||headers.Result||'*',
    warnings:annotated?['Only the mainline is imported; comments, annotations and variations are omitted.']:[]};
}

export function exportPGN({initial,moves,headers={},result='*'}){
  if(!results.includes(result))throw Error('Invalid result');
  let s=checkedState(initial);const extension=s.b.some(p=>p&&(!ordinary(p.t)||p.mark));
  const h={Event:'?',Site:'?',Date:'????.??.??',Round:'?',White:'?',Black:'?',...headers,Result:result};
  for(const key of ['FEN','SetUp','Variant','TFCVersion','TFCState'])delete h[key];
  if(extension){h.Variant='Touhou Fairy Chess';h.TFCVersion='1';h.TFCState=encodeURIComponent(JSON.stringify(s));}
  else{const fen=toFEN(s);if(fen!==START_FEN){h.SetUp='1';h.FEN=fen;}}
  const tokens=[];
  moves.forEach((record,i)=>{const m=resolveRecordedMove(s,record);
    if(s.turn==='w')tokens.push(s.full+'.');else if(i===0)tokens.push(s.full+'...');
    tokens.push(san(s,m));s=nextPosition(s,m);
  });tokens.push(result);
  const escape=x=>String(x).replace(/[\r\n]/g,' ').replace(/\\/g,'\\\\').replace(/"/g,'\\"');
  const lines=[];let line='';for(const token of tokens){
    if(line&&line.length+token.length+1>79){lines.push(line);line='';}
    line+=(line?' ':'')+token;
  }if(line)lines.push(line);
  return Object.entries(h).filter(([k])=>/^[A-Za-z0-9_]+$/.test(k)).map(([k,v])=>`[${k} "${escape(v)}"]`).join('\n')+'\n\n'+lines.join('\n')+'\n';
}
