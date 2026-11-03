import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSync, transformSync } from "esbuild";
import type { Plugin } from "vite";

const UI = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const GAME = path.resolve(UI, "..");
const ENGINE_DIR = path.join(UI, "src", "engine");
/* The frame loop imports the game, which imports the rest. */
const ENGINE_ENTRY = path.join(ENGINE_DIR, "loop.ts");

const ENGINE_ID = "virtual:mkmk-engine";
const NEWS_ID = "virtual:mkmk-news";

function readGame(...parts: string[]) {
  return readFileSync(path.join(GAME, ...parts), "utf8");
}

/* catalog/improvements.csv: a `title` header, then one title per line. Titles
   never span lines, so a quoted one only needs its quotes undone. */
function loadImprovements() {
  const [, ...rows] = readGame("catalog", "improvements.csv").trimEnd().split("\n");
  return rows.map(r => (r.startsWith('"') ? r.slice(1, -1).replaceAll('""', '"') : r));
}

function loadEventArt(): Record<string, string> {
  const file = path.join(UI, "src", "art", "sprites.ts");
  const js = transformSync(readFileSync(file, "utf8"), {
    loader: "ts",
    format: "cjs",
    sourcefile: file,
  }).code;
  const module = { exports: {} as { EVENT_ART?: Record<string, string> } };
  new Function("exports", "module", js)(module.exports, module);
  const art = module.exports.EVENT_ART;
  if (!art?.cloud?.includes('viewBox="0 0 24 24"')) {
    throw new Error("sprites.ts did not export 24x24 EVENT_ART");
  }
  return art;
}

/* The news each picture goes with, for the /art page, read out of game.ts so the
   text has one home. The empty-month headlines are two parallel array literals;
   every other piece of news is an object literal with title, then art, then an
   ask or html line. Pictures nothing here mentions are left out. */
function loadArtNews(): Record<string, { title: string; text: string }[]> {
  const src = readFileSync(path.join(ENGINE_DIR, "game.ts"), "utf8");
  const literal = (name: string): string[] => {
    const m = src.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\n\\]);`));
    if (!m) throw new Error(`game.ts has no ${name} array`);
    return new Function(`return ${m[1]}`)() as string[];
  };
  const out: Record<string, { title: string; text: string }[]> = {};
  const add = (art: string, title: string, text: string) =>
    (out[art] ??= []).push({ title, text });
  const arts = literal("NOOP_ART");
  literal("NOOP_NEWS").forEach((html, i) => {
    if (arts[i]) add(arts[i], "", html);
  });
  const str = `("(?:[^"\\\\]|\\\\.)*")`;
  const event = new RegExp(
    `title: ${str},\\s*art: "(\\w+)",\\s*(?:(?:ask|html): ${str})?`,
    "g"
  );
  for (const m of src.matchAll(event)) {
    add(m[2], JSON.parse(m[1]) as string, m[3] ? (JSON.parse(m[3]) as string) : "");
  }
  return out;
}

/* One strict IIFE, the same text the page runs and the leaderboard replays. Tree
   shaking stays off so console and test code reaching into game.ts through
   __board.eval finds everything that is defined. */
function assembleEngine() {
  const out = buildSync({
    entryPoints: [ENGINE_ENTRY],
    bundle: true,
    format: "iife",
    target: "es2022",
    treeShaking: false,
    write: false,
    banner: { js: '"use strict";' },
    define: {
      __IMPROVEMENTS_JSON__: JSON.stringify(loadImprovements()),
      __EVENT_ART_JSON__: JSON.stringify(loadEventArt()),
    },
    logOverride: { "direct-eval": "silent" },
  });
  const engine = out.outputFiles[0].text.replace(/\n$/, "");
  const ver = createHash("sha256").update(engine).digest("hex").slice(0, 12);
  return engine.split("__GAME_VERSION__").join(ver);
}

function isBoardFile(file: string) {
  const rel = path.relative(GAME, file);
  return (
    rel.startsWith(`ui${path.sep}src${path.sep}engine${path.sep}`) ||
    rel.startsWith(`ui${path.sep}src${path.sep}art${path.sep}`) ||
    rel.startsWith(`catalog${path.sep}`)
  );
}

export function boardPlugin(): Plugin {
  let engine: string | null = null;
  const source = () => (engine ??= assembleEngine());
  return {
    name: "mkmk-board",
    resolveId(id) {
      if (id === ENGINE_ID || id === NEWS_ID) return `\0${id}`;
    },
    load(id) {
      if (id === `\0${NEWS_ID}`)
        return `export default ${JSON.stringify(loadArtNews())};`;
      if (id === `\0${ENGINE_ID}`) {
        // Classic script, not ESM: the engine is one IIFE and Vite must not
        // parse it as a module. The same text is written to
        // engine.js so the leaderboard can replay it without a page.
        const src = source();
        return `const s=document.createElement("script");s.text=${JSON.stringify(src)};document.body.appendChild(s);`;
      }
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "engine.js",
        source: source(),
      });
    },
    handleHotUpdate({ file, server }) {
      if (!isBoardFile(file)) return;
      engine = null;
      for (const id of [ENGINE_ID, NEWS_ID]) {
        const mod = server.moduleGraph.getModuleById(`\0${id}`);
        if (mod) server.moduleGraph.invalidateModule(mod);
      }
      server.ws.send({ type: "full-reload" });
      return [];
    },
  };
}
