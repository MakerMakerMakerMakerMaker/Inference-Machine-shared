import { useEffect, useState } from "react";
import { copyText } from "../game/share";

/* One copy behaviour for every share control: copy the text, then show a small
   "Copied to Clipboard" tip by the control for a moment. */
export function useCopy(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(t);
  }, [copied]);
  const copy = (text: string) => {
    setCopied(false);
    void copyText(text).then(ok => ok && setCopied(true));
  };
  return [copied, copy];
}

/* The tip itself; its parent needs position: relative (.copyWrap). */
export function CopyTip({ show, below }: { show: boolean; below?: boolean }) {
  return (
    <span
      className={"copyTip" + (below ? " below" : "") + (show ? " on" : "")}
      role="status"
      aria-live="polite"
    >
      {show ? "Copied to Clipboard" : ""}
    </span>
  );
}
