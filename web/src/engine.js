// The only frontend engine boundary. Components use JavaScript, engine stays TS.
import {loadWeights} from '../../engine/index.ts';
import weights from '../../engine/weights.json';
loadWeights(weights);
export * from '../../engine/index.ts';
