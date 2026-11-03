import { installSounds } from "./soundEngine";

export { playSound } from "./soundEngine";
export type { SoundEvent } from "./soundMap";

/* importing this module is what turns the button and popup sounds on */
const remove = installSounds();

/* in dev, editing soundMap.ts re-runs this module; drop the old listeners first so a
   click does not play twice */
import.meta.hot?.dispose(remove);
