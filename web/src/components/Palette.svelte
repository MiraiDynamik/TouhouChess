<script>
  import {P,fmt} from '../engine.js';
  import {translate,pieceName} from '../i18n.js';
  let {lang,pick,onPick}= $props();
  const tiers=[['tierVanilla',['k','q','r','b','n','p']],
    ['tierKedama',['keda','onmyo','ghost']],
    ['tierFairy',['rabbit','fairy','daiyousei','sunny','cirno']],
    ['tierHuman',['reimu','sanae']],['tierYoukai',['lumia','koishi','iku']],
    ['tierMagician',['alice']],['tierSage',['yukari']]];
</script>
<div id="palette" class="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-1.5 my-2.5">
  {#each tiers as [tier,pieces]}
    <div class="tier col-span-full mt-1 border-t [border-top-style:solid] border-line pt-[5px] text-xs leading-[1.5] text-subtle">{translate(lang,tier)}</div>
    {#each pieces as type}
      <button class="px-[5px] py-1.5 text-left text-xs leading-[1.3]" aria-pressed={pick===type} onclick={()=>onPick(type)}>
        <span class="g mr-1 font-glyph text-[15px]">{P[type].g}</span>{pieceName(lang,type)}<span class="v float-right text-subtle">{fmt(P[type].cost)}</span>
      </button>
    {/each}
  {/each}
</div>
