import { ThemeProvider, createTheme } from "@mui/material/styles";
import { useEffect } from "react";
import { ArtPage } from "./art/ArtPage";
import { SoundPage } from "./sound/SoundPage";
import { Chart } from "./components/Chart";
import { GpuPanel } from "./components/GpuPanel";
import { Machine } from "./components/Machine";
import { Overlays } from "./components/Overlays";
import { RdPanel, StatsPanel } from "./components/RdPanel";
import { ServingPanel } from "./components/ServingPanel";
import { StartOverlay } from "./components/StartOverlay";
import { TimePanel } from "./components/TimePanel";
import { useClickPunch } from "./components/clickPunch";
import { BrandBar } from "./components/WorkPanel";
import { ColSplit, MobNav } from "./components/layout";
import "./game/store";

declare global {
  interface Window {
    __mkmkEngine?: boolean;
  }
}

const muiTheme = createTheme({
  palette: { mode: "dark" },
  typography: { fontFamily: "inherit" },
});

const MM_BAR = {
  transformBox: "fill-box",
  transformOrigin: "center",
  animation: "mmp 2.4s ease-in-out infinite",
} as const;

const MM_BARS = [
  { x: 185, y: 271, h: 536, fill: "rgb(231, 247, 0)", delay: "-0.6s" },
  { x: 241, y: 346, h: 460, fill: "rgb(189, 222, 0)", delay: "-0.5s" },
  { x: 299, y: 422, h: 210, fill: "rgb(148, 206, 0)", delay: "-0.5s" },
  { x: 355, y: 491, h: 212, fill: "rgb(107, 181, 0)", delay: "-0.4s" },
  { x: 412, y: 422, h: 210, fill: "rgb(66, 165, 0)", delay: "-0.4s" },
  { x: 469, y: 346, h: 462, fill: "rgb(23, 140, 0)", delay: "-0.3s" },
  { x: 525, y: 273, h: 532, fill: "rgb(0, 123, 8)", delay: "-0.2s" },
  { x: 583, y: 346, h: 462, fill: "rgb(0, 99, 48)", delay: "-0.2s" },
  { x: 640, y: 422, h: 210, fill: "rgb(0, 82, 86)", delay: "-0.1s" },
  { x: 696, y: 491, h: 210, fill: "rgb(0, 66, 132)", delay: "-0.0s" },
  { x: 753, y: 422, h: 210, fill: "rgb(0, 41, 170)", delay: "-0.0s" },
  { x: 810, y: 347, h: 458, fill: "rgb(0, 24, 214)", delay: "-2.3s" },
  { x: 866, y: 272, h: 534, fill: "rgb(0, 16, 223)", delay: "-2.3s" },
] as const;

function Sprite() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <g id="mm">
          {MM_BARS.map(bar => (
            <rect
              key={bar.x}
              x={bar.x}
              y={bar.y}
              width="30"
              height={bar.h}
              fill={bar.fill}
              style={{ ...MM_BAR, animationDelay: bar.delay }}
            />
          ))}
        </g>
      </defs>
    </svg>
  );
}

function galleryRoute() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  return path === "/art" || path === "/sound" ? path : null;
}

export function App() {
  const gallery = galleryRoute();
  useClickPunch();

  useEffect(() => {
    if (gallery || window.__mkmkEngine) return;
    window.__mkmkEngine = true;
    void import("virtual:mkmk-engine");
  }, [gallery]);

  if (gallery === "/art") return <ArtPage />;
  if (gallery === "/sound") return <SoundPage />;

  return (
    <ThemeProvider theme={muiTheme}>
      <>
        <Sprite />
        <div id="stage">
          <div id="app">
            <div id="rightSection">
              <div id="workRow">
                <ServingPanel />
                <RdPanel />
              </div>
              <StatsPanel />
              <Machine />
            </div>
            <div id="left">
              <BrandBar />
              <TimePanel />
              <GpuPanel />
              <Chart />
            </div>
            <ColSplit />
            <MobNav />
          </div>
        </div>
        <StartOverlay />
        <Overlays />
      </>
    </ThemeProvider>
  );
}
