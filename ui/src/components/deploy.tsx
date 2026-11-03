import type { ReactNode } from "react";
import { useGpu } from "../game/store";
import { gpusWord, rentWhat } from "./gpuLabels";
import { CartIco } from "./panelIcons";

const EMPTY_NOTES = {
  serve:
    "No models deployed, users cannot use your service. Deploy a model to get started.",
  rd: "No optimizations running. Start Elise on spare GPUs to improve inference.",
} as const;

/** The line above "+ Serve" / "+ Optimize with Elise" when that panel is empty. The
    other panel's line sits invisibly in the same grid cell, so both paragraphs are
    as tall as the longer one at any width and the two buttons line up. */
export function EmptyNote({ which }: { which: keyof typeof EMPTY_NOTES }) {
  const twin = which === "serve" ? "rd" : "serve";
  return (
    <p id={which === "serve" ? "serveEmpty" : "rdEmpty"} className="emptyNote">
      <span>{EMPTY_NOTES[which]}</span>
      <span className="emptyTwin" aria-hidden="true">
        {EMPTY_NOTES[twin]}
      </span>
    </p>
  );
}

/** Deployment count for Serving and R&D, picked from a list up to what fits, with
    a stepper on each side that moves the GPUs it uses by one rental batch. When a
    deployment takes more GPUs than a batch, or the batch is not a whole number of
    deployments, the step is the nearest whole number of deployments under it (at
    least one), and the button says how many GPUs that really is. */
export function DeployCount({
  copies,
  maxCopies,
  perCopy,
  onCopies,
  end,
}: {
  copies: number;
  maxCopies: number;
  perCopy: number;
  onCopies: (n: number) => void;
  end?: ReactNode;
}) {
  const top = Math.max(maxCopies, copies);
  const shown = top < 1 ? 0 : Math.min(Math.max(1, copies), top);
  const label = (n: number) =>
    `${n}${perCopy > 1 ? ` · ${gpusWord(n * perCopy)}` : ""}`;
  const batch = Math.max(1, useGpu()?.rentBlock ?? 1);
  const per = Math.max(1, perCopy);
  const stepCopies = Math.max(1, Math.floor(batch / per));
  const stepGpus = stepCopies * per;
  const down = Math.max(1, shown - stepCopies);
  const up = Math.min(top, shown + stepCopies);
  const canDown = shown > 1;
  const canUp = top >= 1 && shown < top;
  return (
    <div className="serveDeploy">
      <div className="serveJobA">
        <span className="dim">Deployments</span>
        <button
          type="button"
          className="serveStep"
          disabled={!canDown}
          data-tip={`${gpusWord(stepGpus)} fewer`}
          aria-label={`Remove ${gpusWord(stepGpus)}`}
          onClick={() => onCopies(down)}
        >
          −{stepGpus}
        </button>
        <select
          className="serveCount"
          value={shown}
          disabled={top <= 1}
          aria-label="Deployments"
          onChange={e => onCopies(Number(e.target.value))}
        >
          {top < 1 ? (
            <option value={0}>0</option>
          ) : (
            Array.from({ length: top }, (_, i) => i + 1).map(n => (
              <option key={n} value={n}>
                {label(n)}
              </option>
            ))
          )}
        </select>
        <button
          type="button"
          className="serveStep"
          disabled={!canUp}
          data-tip={
            up - shown < stepCopies
              ? `${gpusWord((up - shown) * per)} more, all that is unused`
              : `${gpusWord(stepGpus)} more`
          }
          aria-label={`Add ${gpusWord(stepGpus)}`}
          onClick={() => onCopies(up)}
        >
          +{stepGpus}
        </button>
        {end}
      </div>
    </div>
  );
}

/** Rents one more block of the given GPU type without leaving the card. */
export function RentMore({
  part,
  onRented,
  assigns,
}: {
  part: string;
  /** called with how many GPUs were rented */
  onRented?: (rented: number) => void;
  /** on a live card the new GPUs go straight to it; the tip says so */
  assigns?: string;
}) {
  const buy = useGpu()?.buys.find(b => b.id === part);
  if (!buy) return null;
  const tip = buy.full
    ? `You rent the most ${buy.name} providers allow: ${buy.max}`
    : `${rentWhat(buy)} and add them to ${assigns ?? "your fleet"} · ${buy.cost}`;
  return (
    <span className="serveRentW">
      <span className="dim">Add GPUs</span>
      <button
        type="button"
        className="serveRent"
        disabled={buy.disabled}
        data-tip={tip}
        aria-label={tip}
        onClick={() => {
          const rented = window.__board?.rentAsk(part) || 0;
          if (rented > 0) onRented?.(rented);
        }}
      >
        <CartIco />
        {buy.full ? `Max ${buy.max}` : `${buy.block}× · ${buy.cost}`}
      </button>
    </span>
  );
}
