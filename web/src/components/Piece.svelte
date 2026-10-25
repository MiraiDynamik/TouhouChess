<script>
  import {P} from '../engine.js';
  let {type,color}= $props();
  let glyph=$derived(P[type].g);
  let cjk=$derived(!(glyph.codePointAt(0)>=0x2654&&glyph.codePointAt(0)<=0x265F));
</script>
<span class="pc {color}" class:cjk>{glyph}</span>
