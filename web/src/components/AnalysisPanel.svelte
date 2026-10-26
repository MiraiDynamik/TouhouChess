<script>
  import {startAnalysis} from '../analysis.js';
  import {MATE,W,outcome,applyMove,legalMoves,notate} from '../engine.js';
  import {translate} from '../i18n.js';
  let {position,hist,legal,lang,active}= $props();
  let sageOn=$state(false);
  let sage=$state({});
  const tr=(key,...args)=>translate(lang,key,...args);
  // These effects depend on the position/history and their own checkbox only.
  // Language, selection and the other panel never restart an in-progress search.
  $effect(()=>{
    const enabled=sageOn&&active,s=position,h=hist;
    sage={};
    if(enabled&&!outcome(s,legal).over)return startAnalysis(s,h,true,result=>{sage={...sage,...result};});
  });
  function score(value){
    if(value===undefined)return '—';
    const white=position.turn===W?value:-value;
    if(Math.abs(value)>MATE/2)return white>0?'+M':'-M';
    return (white>0?'+':'')+(white/100).toFixed(2);
  }
  function moveText(move){
    if(!move)return '—';
    const found=legal.find(m=>m.from===move.from&&m.to===move.to&&
      (m.promo||null)===(move.promo||null)&&(m.drop||null)===(move.drop||null)&&m.castle===move.castle);
    if(!found)return '—';
    const next=applyMove(position,found);
    return notate(position,found,next,legalMoves(next));
  }
</script>
<div id="evalWrap">
  <label><input id="evSage" type="checkbox" bind:checked={sageOn}> <span>{tr('evSageL')}</span></label>
  {#if active&&sageOn}
    <div id="evalPanel" aria-live="polite">
      <div class="eh">{tr('evHead')}</div>
      {#each [{key:'sage',enabled:sageOn,data:sage}] as panel (panel.key)}
        {#if panel.enabled}
          <div class="er flex gap-2.5 items-baseline whitespace-nowrap" data-analysis={panel.key}>
            <span class="ed">{panel.data.depth?tr('evDepth',panel.data.depth):''}</span>
            <span class="ev">{score(panel.data.score)}</span>
            <span class="em">{outcome(position,legal).over?tr('evOver'):panel.data.depth?tr('evBest',moveText(panel.data.move)):tr('evThinking')}
              {#if panel.data.noWorker}<span class="stop"> {tr('evMainThread')}</span>{/if}
              {#if panel.data.done&&panel.data.depth}<span class="stop"> {tr('evStop')}</span>{/if}
            </span>
          </div>
        {/if}
      {/each}
    </div>
  {/if}
</div>
