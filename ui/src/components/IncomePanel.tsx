import ExpandMore from "@mui/icons-material/ExpandMore";
import IconButton from "@mui/material/IconButton";
import { useState } from "react";
import { fmt$ } from "../engine/format";
import { useGpu, useServe } from "../game/store";
import { RippleText } from "./RippleText";

const PROFIT_TIP = "profit = (revenue - expenses)";
const NOT_SERVING_TIP =
  "Rent on GPUs that are idle or running Elise. The Serving cards count only their own GPUs, so their profits add up to this Profit plus this line.";

/** Profit per day on one Progress tile: `$X/day`, with total revenue and total costs
    per day always shown underneath, and the part of the costs paid for GPUs that
    are not serving (idle, or running Elise), so the Serving cards' profits add up
    to this one. On a phone, where Profit shares the Capital row, the breakdown stays
    a drop-down behind the chevron. Rendered inside the Progress panel's HUD, right
    after Capital. */
export function IncomeStats() {
  const serve = useServe();
  const gpu = useGpu();
  const [open, setOpen] = useState(false);
  const revenue = (serve?.jobs ?? []).reduce((a, j) => a + (j.revenueUsd ?? 0), 0);
  const costs = gpu?.costDay ?? 0;
  const serving = (serve?.jobs ?? []).reduce((a, j) => a + (j.expensesUsd ?? 0), 0);
  const notServing = Math.max(0, costs - serving);
  const profit = revenue - costs;
  const lead = profit < 0 ? "-" : "";

  return (
    <div className={open ? "stat income open" : "stat income"} data-tip={PROFIT_TIP}>
      <div className="l">
        <RippleText text="Profit" />
      </div>
      <div className="v" id="incomeProfit">
        <span className={profit < 0 ? "dn" : "up"}>
          {lead}
          {fmt$(Math.abs(profit))}/day
        </span>
      </div>
      <IconButton
        size="small"
        color="inherit"
        className="incomeToggle"
        aria-expanded={open}
        aria-controls="incomeBreak"
        aria-label={open ? "Hide revenue and costs" : "Show revenue and costs"}
        sx={{ p: 0, width: 16, height: 16, color: "inherit" }}
        onClick={e => {
          e.stopPropagation();
          setOpen(o => !o);
        }}
      >
        <ExpandMore sx={{ fontSize: 16 }} />
      </IconButton>
      <div className="incomeBreak" id="incomeBreak">
        <div className="incomeRow">
          <span className="l">Total revenue</span>
          <span className="up" id="incomeRev">
            +{fmt$(Math.abs(revenue))}/day
          </span>
        </div>
        <div className="incomeRow">
          <span className="l">Total costs</span>
          <span className="dn" id="incomeCost">
            -{fmt$(Math.abs(costs))}/day
          </span>
        </div>
        {notServing >= 0.005 ? (
          <div className="incomeRow sub" data-tip={NOT_SERVING_TIP}>
            <span className="l">of which GPUs not serving</span>
            <span className="dn" id="incomeIdle">
              -{fmt$(notServing)}/day
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
