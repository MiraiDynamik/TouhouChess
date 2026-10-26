<script>
  import {untrack} from 'svelte';
  import {startAnalysis} from '../analysis.js';
  import {MATE,W,outcome,applyMove,legalMoves,notate} from '../engine.js';
  import {translate} from '../i18n.js';
  let {position,hist,legal,lang,active}= $props();
  let sageOn=$state(false);
  let sage=$state({});
  const tr=(key,...args)=>translate(lang,key,...args);
  // Parent props read the whole game store. Derived equality boundaries keep
  // unrelated store updates from cancelling this position's analysis worker.
  let analysisPosition=$derived(position);
  let analysisHistory=$derived(hist);
  let analysisEnabled=$derived(sageOn&&active);
  $effect(()=>{
    const enabled=analysisEnabled,s=analysisPosition,h=analysisHistory;
    return untrack(()=>{
      sage={};
      if(enabled&&!outcome(s,legal).over)return startAnalysis(s,h,true,result=>{sage={...sage,...result};});
    });
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
<div id="evalWrap" class="mt-2.5">
  <label class="mr-3 cursor-pointer select-none text-[12.5px] text-muted"><input id="evSage" type="checkbox" bind:checked={sageOn}> <span>{tr('evSageL')}</span></label>
  {#if active&&sageOn}
    <div id="evalPanel" class="mt-2 rounded-md border border-solid border-line bg-panel px-2.5 py-2 text-[12.5px] leading-[1.75]" aria-live="polite">
      <div class="eh mb-1 text-[11.5px] text-muted">{tr('evHead')}</div>
      {#each [{key:'sage',enabled:sageOn,data:sage}] as panel (panel.key)}
        {#if panel.enabled}
          <div class="er flex gap-2.5 items-baseline whitespace-nowrap" data-analysis={panel.key}>
            <span class="ed w-[7em] flex-none tabular-nums">{panel.data.depth?tr('evDepth',panel.data.depth):''}</span>
            <span class="ev w-[4.5em] flex-none font-semibold tabular-nums">{score(panel.data.score)}</span>
            <span class="em flex-1 overflow-hidden text-ellipsis">{outcome(position,legal).over?tr('evOver'):panel.data.depth?tr('evBest',moveText(panel.data.move)):tr('evThinking')}
              {#if panel.data.noWorker}<span class="stop text-stopped"> {tr('evMainThread')}</span>{/if}
              {#if panel.data.done&&panel.data.depth}<span class="stop text-stopped"> {tr('evStop')}</span>{/if}
            </span>
          </div>
        {/if}
      {/each}
    </div>
  {/if}
</div>
