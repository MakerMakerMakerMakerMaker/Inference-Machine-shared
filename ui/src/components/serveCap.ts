import type { ServeJobView } from "../game/types";

/* Every GPU on the deployment is busy but the market would still take more:
   adding copies would earn more, so the card's outline pulses green and, on a
   phone, the Serving tab gets a bubble. Not when its GPU type is at the rental
   cap, since there is no more of it to rent. */
export function atCapacity(job: ServeJobView) {
  return !job.mine && !job.down && !!job.utilMax && !job.shareMax && !job.rentCapped;
}
