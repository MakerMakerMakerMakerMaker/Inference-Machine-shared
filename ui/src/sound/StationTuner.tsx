import { useSyncExternalStore } from "react";
import { STATION_LIST, stationId, subscribeStation, tuneStation } from "./musicEngine";

/* The radio dial: the station on air between a step back and a step forward along
   the list, wrapping round. With one station the steps stay disabled. The name is
   a polite live region, so a screen reader hears where the dial landed. */
export function StationTuner() {
  const id = useSyncExternalStore(subscribeStation, stationId);
  const at = STATION_LIST.find(s => s.id === id) ?? STATION_LIST[0];
  const only = STATION_LIST.length < 2;
  return (
    <div className="stationTuner" role="group" aria-label="Radio station">
      <span className="stationLabel">Station</span>
      <div className="stationDial">
        <button
          type="button"
          aria-label="Previous station"
          disabled={only}
          onClick={() => tuneStation(-1)}
        >
          ◀
        </button>
        <span className="stationName" aria-live="polite">
          {at.name}
        </span>
        <button
          type="button"
          aria-label="Next station"
          disabled={only}
          onClick={() => tuneStation(1)}
        >
          ▶
        </button>
      </div>
    </div>
  );
}
