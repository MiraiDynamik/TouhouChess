/** Internal representation. Public object conversion lives in public.ts.
 * Pieces: five type bits, one color bit, one disappearance bit; zero is empty.
 * Moves: from(6), to(6), promotion(5), drop(5), castle(2), ep(1), double(1),
 * price(6). Price is cost*2+1 (zero means absent). Add one to the unsigned
 * encoding so every legal move is truthy; use JS numbers, not signed Int32.
 * Piece IDs are stable and independent of registration order.
 */
export const compactNames=[undefined,"k","q","r","b","n","p","keda","onmyo","ghost","rabbit","tewi","doll","shanghai","fairy","daiyousei","sunny","cirno","reimu","sanae","lumia","iku","ryuu","koishi","alice","yukari"];
export const compactIds=Object.assign(Object.create(null),Object.fromEntries(compactNames.slice(1).map((t,i)=>[t,i+1])));
export const compactKinds=[];
export const compactTypeId=t=>compactIds[t];
export const compactType=p=>compactNames[p&31];
export const compactColor=p=>(p&32)?'b':'w';
export const compactMark=p=>(p>>>6)&1;
export function compactPiece(t,c,mark=0){
 const id=compactIds[t];if(!id||!['w','b'].includes(c)||![0,1,undefined].includes(mark))throw Error('Invalid piece encoding');
 return id|(c==='b'?32:0)|(mark?64:0);
}
export const compactKind=p=>compactKinds[p&31];
export const compactMarked=p=>p|64;
export function compactMove(from,to,promo,drop,cost,castle,epc,dbl){
 const price=cost==null?0:cost*2+1;
 if(!Number.isInteger(price)||price<0||price>63||from<0||from>63||to<0||to>63)throw Error('Move encoding out of range');
 return ((from|(to<<6)|((compactIds[promo]||0)<<12)|((compactIds[drop]||0)<<17)|
  ((castle==null?0:castle===0?1:2)<<22)|(epc?1<<24:0)|(dbl?1<<25:0)|(price<<26))>>>0)+1;
}
export const compactFrom=m=>(m-1)&63;
export const compactTo=m=>((m-1)>>>6)&63;
export const compactPromo=m=>compactNames[((m-1)>>>12)&31];
export const compactDrop=m=>compactNames[((m-1)>>>17)&31];
export const compactCost=m=>{const n=(m-1)>>>26;return n?(n-1)/2:undefined;};
export const compactCastle=m=>{const n=((m-1)>>>22)&3;return n===1?0:n===2?7:undefined;};
export const compactEpc=m=>((m-1)&(1<<24))?1:undefined;
export const compactDbl=m=>((m-1)&(1<<25))?1:undefined;
// Only root legal-move lists retain children. Recursive search holds no move objects.
export const compactChildren=new WeakMap();
// Stable native sort retains generation order for equal scores, including fractional weights.
let scores=new Float64Array(256),moves=new Float64Array(256),indices=[];
export function compactOrder(s,ms,ply,score){
 const n=ms.length;
 if(n>scores.length){scores=new Float64Array(n*2);moves=new Float64Array(n*2);}
 indices.length=n;
 for(let i=0;i<n;i++){moves[i]=ms[i];scores[i]=score(s,ms[i],ply);indices[i]=i;}
 indices.sort((a,b)=>scores[b]-scores[a]);
 for(let i=0;i<n;i++)ms[i]=moves[indices[i]];
 return ms;
}
