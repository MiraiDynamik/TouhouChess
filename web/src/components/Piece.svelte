<script>
  import {P} from '../engine.js';
  let {type,color,compact=false}= $props();
  let glyph=$derived(P[type].g);
  let cjk=$derived(!(glyph.codePointAt(0)>=0x2654&&glyph.codePointAt(0)<=0x265F));
</script>
<span class="pc {color} pointer-events-none relative z-[1] leading-none"
  class:cjk class:compact>{glyph}</span>

<style>
  /* 棋子随棋盘缩放；描边保证在深浅格上都清晰。 */
  .pc { font-size: min(8.4vw, 44px); }
  .cjk { font-size: min(7vw, 36px); font-weight: 600; font-family: var(--font-piece); }
  .w { color: var(--color-piece-white); --outline: var(--color-ink); }
  .b { color: var(--color-ink); --outline: var(--color-piece-white); }
  .pc { text-shadow: 0 0 1px var(--outline), 0 1px 0 var(--outline),
    1px 0 0 var(--outline), -1px 0 0 var(--outline), 0 -1px 0 var(--outline); }
  .compact { font-size: 26px; }
</style>
