export const ART_PX = 24;

type Palette = Record<string, string>;

const FRAME_MS = 300;

// A wheel that turns as one rigid drawing: the pixels painted in `ink` rotate
// about (cx, cy) by `step` degrees each frame (negative turns the other way).
// `ink` lists its colours bottom to top. Redrawing a turning gear frame by frame
// cannot keep its teeth the same shape on a 24px grid; rotating the drawing does.
// Pixels farther than `rim` from the centre are teeth: only the upright one is
// kept, and it is copied around the wheel `teeth` times, so every tooth matches.
// `from` is the angle the wheel starts at.
type Spin = {
  ink: string;
  cx: number;
  cy: number;
  step: number;
  teeth: number;
  rim: number;
  from?: number;
};

// Each row holds every animation frame side by side, separated by spaces.
// `order` is the playback sequence of frame indices (defaults to 0, 1, 2, ...).
// `once` plays that sequence a single time and stays on its last frame. The clock
// starts when the <svg> is inserted, so insert a fresh copy to play it again.
function pix(
  rows: readonly string[],
  pal: Palette,
  order?: readonly number[],
  spins: readonly Spin[] = [],
  once = false
): string {
  const repeat = once ? `repeatCount="1" fill="freeze"` : `repeatCount="indefinite"`;
  const frames = rows[0].split(" ").map((_, f) => rows.map(row => row.split(" ")[f]));
  if (
    rows.length !== ART_PX ||
    frames.some(fr => fr.some(row => row?.length !== ART_PX))
  ) {
    throw new Error("news art must be 24x24");
  }
  const ink = (f: number, x: number, y: number) => {
    const c = frames[f][y][x];
    return c !== "." && pal[c] ? c : "";
  };
  const still = (x: number, y: number) =>
    frames.every((_, f) => ink(f, x, y) === ink(0, x, y));
  const layer = (f: number, keep: (x: number, y: number) => boolean) => {
    let body = "";
    for (let y = 0; y < ART_PX; y++) {
      let x = 0;
      while (x < ART_PX) {
        const c = keep(x, y) ? ink(f, x, y) : "";
        if (!c) {
          x++;
          continue;
        }
        let n = 1;
        while (x + n < ART_PX && keep(x + n, y) && ink(f, x + n, y) === c) n++;
        body += `<rect x="${x}" y="${y}" width="${n}" height="1" fill="${pal[c]}"/>`;
        x += n;
      }
    }
    return body;
  };
  const spinOf = (x: number, y: number) => {
    const c = ink(0, x, y);
    return c ? spins.find(s => s.ink.includes(c)) : undefined;
  };
  // A turned wheel is drawn smooth, and separate pixel rects would show hairline
  // seams. So each colour is one path, and it also covers every pixel of the
  // colours listed after it, which paint on top: no edge sits over bare background.
  const paths = (s: Spin, keep: (x: number, y: number) => boolean) => {
    let out = "";
    [...s.ink].forEach((c, i) => {
      const under = s.ink.slice(i);
      const on = (x: number, y: number) =>
        keep(x, y) && under.includes(ink(0, x, y) || ".");
      let d = "";
      for (let y = 0; y < ART_PX; y++) {
        let x = 0;
        while (x < ART_PX) {
          if (!on(x, y)) {
            x++;
            continue;
          }
          let n = 1;
          while (x + n < ART_PX && on(x + n, y)) n++;
          d += `M${x} ${y}h${n}v1h${-n}z`;
          x += n;
        }
      }
      if (d && pal[c]) out += `<path d="${d}" fill="${pal[c]}"/>`;
    });
    return out;
  };
  const wheel = (s: Spin) => {
    const r = (x: number, y: number) => Math.hypot(x + 0.5 - s.cx, y + 0.5 - s.cy);
    const upright = (x: number, y: number) =>
      Math.abs(Math.atan2(x + 0.5 - s.cx, s.cy - y - 0.5)) < Math.PI / s.teeth;
    // A tooth reaches a pixel into the body, so the body's edge never shows a seam.
    const tooth = paths(s, (x, y) => r(x, y) > s.rim - 1 && upright(x, y));
    let out = "";
    for (let k = 0; k < s.teeth; k++) {
      out += `<g transform="rotate(${(k * 360) / s.teeth} ${s.cx} ${s.cy})">${tooth}</g>`;
    }
    return out + paths(s, (x, y) => r(x, y) <= s.rim);
  };
  // Wheels go underneath, so whatever stands still is painted over them.
  let body = "";
  for (const s of spins) {
    const n = Math.round(360 / Math.abs(s.step));
    const values = Array.from(
      { length: n },
      (_, i) => `${(s.from ?? 0) + i * s.step} ${s.cx} ${s.cy}`
    );
    const keyTimes = values.map((_, i) => +(i / n).toFixed(4));
    body +=
      `<g shape-rendering="geometricPrecision">` +
      `<animateTransform attributeName="transform" type="rotate" values="${values.join(";")}" ` +
      `keyTimes="${keyTimes.join(";")}" dur="${n * FRAME_MS}ms" calcMode="discrete" ` +
      `repeatCount="indefinite"/>` +
      `${wheel(s)}</g>`;
  }
  body += layer(0, (x, y) => still(x, y) && !spinOf(x, y));
  if (frames.length > 1) {
    const seq = order ?? frames.map((_, f) => f);
    const keyTimes = seq.map((_, i) => +(i / seq.length).toFixed(4)).join(";");
    frames.forEach((_, f) => {
      const values = seq.map(s => (s === f ? "visible" : "hidden")).join(";");
      body +=
        `<g visibility="${seq[0] === f ? "visible" : "hidden"}">` +
        `<animate attributeName="visibility" values="${values}" keyTimes="${keyTimes}" ` +
        `dur="${seq.length * FRAME_MS}ms" calcMode="discrete" ${repeat}/>` +
        `${layer(f, (x, y) => !still(x, y))}</g>`;
    });
  }
  return `<svg viewBox="0 0 24 24" width="24" height="24" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${body}</svg>`;
}

export type NewsArt = { key: string; name: string; svg: string };

export const NEWS_ART: NewsArt[] = [
  {
    key: "blog",
    name: "Blog post",
    svg: pix(
      [
        "........................ ........................ ........................",
        "........................ ........................ ........................",
        "........................ ........................ ........................",
        ".tttttttttttttttttttttt. .tttttttttttttttttttttt. .tttttttttttttttttttttt.",
        ".trtytgtttttttttttttttt. .trtytgtttttttttttttttt. .trtytgtttttttttttttttt.",
        ".tttttttttttttttttttttt. .tttttttttttttttttttttt. .tttttttttttttttttttttt.",
        ".pppppppppppppppppppppp. .pppppppppppppppppppppp. .pppppppppppppppppppppp.",
        ".pphhhhhhhhhhhhpppppppp. .pphhhhhhhhhhhhpppppppp. .pphhhhhhhhhhhhpppppppp.",
        ".pppppppppppppppppppppp. .pppppppppppppppppppppp. .pppppppppppppppppppppp.",
        ".ppllllllllllllllllllpp. .ppllllllllllllllllllpp. .ppllllllllllllllllllpp.",
        ".pppppppppppppppppppppp. .pppppppppppppppppppppp. .pppppppppppppppppppppp.",
        ".ppllllllllllllllpppppp. .ppllllllllllllllpppppp. .ppllllllllllllllpppppp.",
        ".pppppppppppppppppppppp. .pppppppppppppppppppppp. .pppppppppppppppppppppp.",
        ".pphpppppppppppllllllpp. .pphpppppppppppllllllpp. .pphpppppppbbppllllllpp.",
        ".pphppppppppppppppppppp. .pphpppppppbbpppppppppp. .pphpppppppbbpppppppppp.",
        ".pphpppppppbbppllllllpp. .pphpppppppbbppllllllpp. .pphppppbbpbbppllllllpp.",
        ".pphpppppppbbpppppppppp. .pphppppbbpbbpppppppppp. .pphppppbbpbbpppppppppp.",
        ".pphppppbbpbbppllllpppp. .pphpbbpbbpbbppllllpppp. .pphpbbpbbpbbppllllpppp.",
        ".pphpbbpbbpbbpppppppppp. .pphpbbpbbpbbpppppppppp. .pphpbbpbbpbbpppppppppp.",
        ".pphhhhhhhhhhhppppppppp. .pphhhhhhhhhhhppppppppp. .pphhhhhhhhhhhppppppppp.",
        ".pppppppppppppppppppppp. .pppppppppppppppppppppp. .pppppppppppppppppppppp.",
        "........................ ........................ ........................",
        "........................ ........................ ........................",
        "........................ ........................ ........................",
      ],
      {
        t: "#5b6b7c",
        r: "#e24b4b",
        y: "#f0c14a",
        g: "#3fae5a",
        p: "#f4efe4",
        h: "#1b2128",
        l: "#8aa0b4",
        b: "#3fae5a",
      }
    ),
  },
  {
    key: "storm",
    name: "Cloud outage",
    svg: pix(
      [
        "........................ ........................ ........................",
        "........................ ........................ ........................",
        "..........cccc.......... ..........eeee.......... ..........cccc..........",
        "........cccccccc........ ........eeeeeeee........ ........cccccccc........",
        "...cccc.cccccccccc...... ...eeee.eeeeeeeeee...... ...cccc.cccccccccc......",
        "..cccccccccccccccccccc.. ..eeeeeeeeeeeeeeeeeeee.. ..cccccccccccccccccccc..",
        ".cccccccccccccccccccccc. .eeeeeeeeeeeeeeeeeeeeee. .cccccccccccccccccccccc.",
        ".cccccccccccccccccccccc. .eeeeeeeeeeeeeeeeeeeeee. .cccccccccccccccccccccc.",
        ".dddddddddddddddddddddd. .dddddddddddddddddddddd. .dddddddddddddddddddddd.",
        "..dddddddddddddddddddd.. ..dddddddddddddddddddd.. ..dddddddddddddddddddd..",
        "....ddddddddyyyddddd.... ....ddddddddwwwddddd.... ....dddddddddddddddd....",
        "....b......yyy....b..... .....b.....www...b...... ...b...b...........b....",
        "....b.....yyy.....b..b.. .....b....www....b...... ...b...b...........b....",
        ".........yyyyyy......b.. .........wwwwww......... ........................",
        "...b...b....yyy....b.... ....b.......www...b..... .....b...........b......",
        "...b...b...yyy.....b.... ....b......www....b..b.. .....b...........b......",
        "..........yyy........... ..........www........b.. ........................",
        ".....b....yy.....b...... ...b...b..ww.......b.... ....b.............b.....",
        ".....b...yy......b...... ...b...b.ww........b.... ....b.............b..b..",
        ".........y.............. .........w.............. .....................b..",
        "........................ ........................ ........................",
        "........................ ........................ ........................",
        "........................ ........................ ........................",
        "........................ ........................ ........................",
      ],
      {
        c: "#8a96a3",
        e: "#b9c4cf",
        d: "#5b6674",
        y: "#f7d046",
        w: "#fff8d6",
        b: "#6ab0f3",
      }
    ),
  },
  {
    key: "gear",
    name: "New engine",
    svg: pix(
      [
        "........................",
        "........ooo.............",
        "........ooo.............",
        "...ooo..ooo..ooo........",
        "...ooooooooooooo........",
        "...ooooooooooooo........",
        "....ooodddddooo.........",
        "....oodd...ddoo.........",
        ".oooood.....dooooo......",
        ".oooood.....dooooo......",
        ".oooood.....dooooo......",
        "....oodd...ddoo.........",
        "....ooodddddooo.........",
        "...ooooooooooooo........",
        "...ooooooooooooo........",
        "...ooo..ooo..ooo.ggggg..",
        "........ooo.....ggggggg.",
        "........ooo....ggggwgggg",
        "...............gggwwwggg",
        "...............ggwwwwwgg",
        "...............ggggwgggg",
        "...............ggggwgggg",
        "................ggggggg.",
        ".................ggggg..",
      ],
      { o: "#c5ced8", d: "#8a96a3", g: "#3fae5a", w: "#f4f7fb" },
      undefined,
      // a third of a tooth a frame
      [{ ink: "od", cx: 9.5, cy: 9.5, step: 15, teeth: 8, rim: 6.1 }]
    ),
  },
  {
    key: "chip",
    name: "Proprietary chip",
    svg: pix(
      [
        "........................ ........................ ........................",
        ".....yy..ss..ss..yy..... .....ss..yy..ss..ss..... .....ss..ss..yy..ss.....",
        ".....yy..ss..ss..yy..... .....ss..yy..ss..ss..... .....ss..ss..yy..ss.....",
        ".....yy..ss..ss..yy..... .....ss..yy..ss..ss..... .....ss..ss..yy..ss.....",
        "....kkkkkkkkkkkkkkkk.... ....kkkkkkkkkkkkkkkk.... ....kkkkkkkkkkkkkkkk....",
        ".yyykykkkkkkkkkkkkkksss. .ssskykkkkkkkkkkkkkkyyy. .ssskykkkkkkkkkkkkkksss.",
        ".yyykkeeeeeeeeeeeekksss. .ssskkeeeeeeeeeeeekkyyy. .ssskkeeeeeeeeeeeekksss.",
        "....kkeeeeyyyyeeeekk.... ....kkeeeeyyyyeeeekk.... ....kkeeeeyyyyeeeekk....",
        "....kkeeeyyeeyyeeekk.... ....kkeeeyyeeyyeeekk.... ....kkeeeyyeeyyeeekk....",
        ".ssskkeeeyeeeeyeeekksss. .ssskkeeeyeeeeyeeekksss. .yyykkeeeyeeeeyeeekkyyy.",
        ".ssskkeeeyeeeeyeeekksss. .ssskkeeeyeeeeyeeekksss. .yyykkeeeyeeeeyeeekkyyy.",
        "....kkeeyyyyyyyyeekk.... ....kkeeyyyyyyyyeekk.... ....kkeeyyyyyyyyeekk....",
        "....kkeeyyyyyyyyeekk.... ....kkeeyyyyyyyyeekk.... ....kkeeyyyyyyyyeekk....",
        ".ssskkeeyyykkyyyeekkyyy. .yyykkeeyyykkyyyeekksss. .ssskkeeyyykkyyyeekksss.",
        ".ssskkeeyyykkyyyeekkyyy. .yyykkeeyyykkyyyeekksss. .ssskkeeyyykkyyyeekksss.",
        "....kkeeyyyyyyyyeekk.... ....kkeeyyyyyyyyeekk.... ....kkeeyyyyyyyyeekk....",
        "....kkeeyyyyyyyyeekk.... ....kkeeyyyyyyyyeekk.... ....kkeeyyyyyyyyeekk....",
        ".yyykkeeeeeeeeeeeekksss. .ssskkeeeeeeeeeeeekkyyy. .ssskkeeeeeeeeeeeekksss.",
        ".yyykkkkkkkkkkkkkkkksss. .ssskkkkkkkkkkkkkkkkyyy. .ssskkkkkkkkkkkkkkkksss.",
        "....kkkkkkkkkkkkkkkk.... ....kkkkkkkkkkkkkkkk.... ....kkkkkkkkkkkkkkkk....",
        ".....ss..ss..yy..ss..... .....ss..yy..ss..ss..... .....yy..ss..ss..yy.....",
        ".....ss..ss..yy..ss..... .....ss..yy..ss..ss..... .....yy..ss..ss..yy.....",
        ".....ss..ss..yy..ss..... .....ss..yy..ss..ss..... .....yy..ss..ss..yy.....",
        "........................ ........................ ........................",
      ],
      { s: "#c5ced8", k: "#2a3340", e: "#3b4656", y: "#e8c56b" }
    ),
  },
  {
    key: "hire",
    name: "New engineer",
    svg: pix(
      [
        "........................ ........................ ........................",
        "........................ ........................ ........................",
        "....................p... ........................ ....................p...",
        ".........hhhhhh.....p... .........hhhhhh.....p... ....................p...",
        "........hhhhhhhh..ppppp. ........hhhhhhhh...ppp.. .........hhhhhh...ppppp.",
        "........hssssssh....p... ........hssssssh....p... ........hhhhhhhh....p...",
        "........skksskks....p... ........skksskks........ ........hssssssh....p...",
        "........ssssssss........ ........ssssssss........ ........skksskks........",
        ".........ssssss......... .........ssssss......... ........ssssssss........",
        "..........ssss.......... ..........ssss.......... .........ssssss.........",
        "......uuuuuuuuuuuu...... ......uuuuuuuuuuuu...... ......uuuuuuuuuuuu......",
        ".....uuuuuuuuuuuuuu..... .....uuuuuuuuuuuuuu..... .....uuuuuuuuuuuuuu.....",
        "....uuuuuuuuuuuuuuuu.... ....uuuuuuuuuuuuuuuu.... ....uuuuuuuuuuuuuuuu....",
        "...mmmmmmmmmmmmmmmmmm... ...mmmmmmmmmmmmmmmmmm... ...mmmmmmmmmmmmmmmmmm...",
        "...mmmmmmmmmmmmmmmmmm... ...mmmmmmmmmmmmmmmmmm... ...mmmmmmmmmmmmmmmmmm...",
        "...mmmmmmmmmmmmmmmmmm... ...mmmmmmmmmmmmmmmmmm... ...mmmmmmmmmmmmmmmmmm...",
        "...mmmmmmmmggmmmmmmmm... ...mmmmmmmmGgmmmmmmmm... ...mmmmmmmmggmmmmmmmm...",
        "...mmmmmmmmggmmmmmmmm... ...mmmmmmmmgGmmmmmmmm... ...mmmmmmmmggmmmmmmmm...",
        "...mmmmmmmmmmmmmmmmmm... ...mmmmmmmmmmmmmmmmmm... ...mmmmmmmmmmmmmmmmmm...",
        "...mmmmmmmmmmmmmmmmmm... ...mmmmmmmmmmmmmmmmmm... ...mmmmmmmmmmmmmmmmmm...",
        "..nnnnnnnnnnnnnnnnnnnn.. ..nnnnnnnnnnnnnnnnnnnn.. ..nnnnnnnnnnnnnnnnnnnn..",
        "...nnnnnnnnnnnnnnnnnn... ...nnnnnnnnnnnnnnnnnn... ...nnnnnnnnnnnnnnnnnn...",
        "........................ ........................ ........................",
        "........................ ........................ ........................",
      ],
      {
        h: "#4a3728",
        s: "#f1c7a2",
        k: "#1b2128",
        u: "#4f7fd1",
        m: "#c5ced8",
        n: "#8a96a3",
        g: "#76b900",
        G: "#b6f25a",
        p: "#3fae5a",
      }
    ),
  },
  {
    key: "cloud",
    name: "Cloud partner",
    svg: pix(
      [
        "........................ ........................ ........................",
        "........................ ........................ ........................",
        "........................ ........................ ........................",
        "........................ ........................ ........................",
        "........................ ........................ ........................",
        "........................ ........................ ........................",
        "........ccc............. .........ccc............ ..........ccc...........",
        "......ccccccc........... .......ccccccc.......... ........ccccccc.........",
        "......ccccccc.ccc....... .......ccccccc.ccc...... ........ccccccc.ccc.....",
        ".....ccccccccccccc...... ......ccccccccccccc..... .......ccccccccccccc....",
        ".....cccccccccccccc..... ......cccccccccccccc.... .......cccccccccccccc...",
        "..ccccccccccccccccc..... ...ccccccccccccccccc.... ....ccccccccccccccccc...",
        ".cccccccccccccccccccc... ..cccccccccccccccccccc.. ...cccccccccccccccccccc.",
        ".ccccccccccccccccccccc.. ..ccccccccccccccccccccc. ...ccccccccccccccccccccc",
        ".ccccccccccccccccccccc.. ..ccccccccccccccccccccc. ...ccccccccccccccccccccc",
        ".ccccccccccccccccccccc.. ..ccccccccccccccccccccc. ...ccccccccccccccccccccc",
        "..ccccccccccccccccccc... ...ccccccccccccccccccc.. ....ccccccccccccccccccc.",
        "........................ ........................ ........................",
        "........................ ........................ ........................",
        "........................ ........................ ........................",
        "........................ ........................ ........................",
        "........................ ........................ ........................",
        "........................ ........................ ........................",
        "........................ ........................ ........................",
      ],
      { c: "#d7e7f6" },
      [0, 1, 2, 1]
    ),
  },
  {
    key: "nb",
    name: "Nbibia",
    svg: pix(
      [
        "........................ ........................ ........................",
        "........................ ........................ ........................",
        "........................ ........................ ........................",
        "........................ ........................ ........................",
        "........................ ........................ ........................",
        "s....................... s....................... s.......................",
        "saaaaaaaaaaaaaaaaaaaaaa. saaaaaaaaaaaaaaaaaaaaaa. saaaaaaaaaaaaaaaaaaaaaa.",
        "skkkkmmmmkkkkkkmmmmkkkk. skkkkmmmmkkkkkkmmmmkkkk. skkkkmmmmkkkkkkmmmmkkkk.",
        "skkkmffffmkkkkmffffmkkk. skkkmbbffmkkkkmbbffmkkk. skkkmffbbmkkkkmffbbmkkk.",
        "skkmbffbbbmkkmbffbbbmkk. skkmfbffffmkkmfbffffmkk. skkmffbbffmkkmffbbffmkk.",
        "skkmbffbbbmkkmbffbbbmkk. skkmfbffbbmkkmfbffbbmkk. skkmffbfffmkkmffbfffmkk.",
        "skmfbbaafffmmfbbaafffmk. skmfffaafbbmmfffaafbbmk. skmbffaabffmmbffaabffmk.",
        "skkmfffbffmkkmfffbffmkk. skkmfffbfbmkkmfffbfbmkk. skkmbbbfbbmkkmbbbfbbmkk.",
        "skkmfffbbfmkkmfffbbfmkk. skkmbbbfffmkkmbbbfffmkk. skkmffffbbmkkmffffbbmkk.",
        "skkkmfbbfmkkkkmfbbfmkkk. skkkmbfffmkkkkmbfffmkkk. skkkmfffbmkkkkmfffbmkkk.",
        "skkkkmmmmkkkkkkmmmmkkkk. skkkkmmmmkkkkkkmmmmkkkk. skkkkmmmmkkkkkkmmmmkkkk.",
        "saaaaaaaaaaaaaaaaaaaaaa. saaaaaaaaaaaaaaaaaaaaaa. saaaaaaaaaaaaaaaaaaaaaa.",
        "s....yyyy.yyyyyyyyyy.... s....yyyy.yyyyyyyyyy.... s....yyyy.yyyyyyyyyy....",
        "s....yyyy.yyyyyyyyyy.... s....yyyy.yyyyyyyyyy.... s....yyyy.yyyyyyyyyy....",
        "........................ ........................ ........................",
        "........................ ........................ ........................",
        "........................ ........................ ........................",
        "........................ ........................ ........................",
        "........................ ........................ ........................",
      ],
      {
        s: "#c5ced8",
        k: "#2b313a",
        a: "#76b900",
        y: "#e8c56b",
        m: "#8a96a3",
        f: "#1b2128",
        b: "#5b6674",
      }
    ),
  },
  {
    key: "amb",
    name: "AMB",
    svg: pix(
      [
        "........................ ........................ ........................",
        "........................ ........................ ........................",
        "........................ ........................ ........................",
        "........................ ........................ ........................",
        "........................ ........................ ........................",
        "s....................... s....................... s.......................",
        "saaaaaaaaaaaaaaaaaaaaaa. saaaaaaaaaaaaaaaaaaaaaa. saaaaaaaaaaaaaaaaaaaaaa.",
        "skkkkkkkkkkkkkkkkkkkkkk. skkkkkkkkkkkkkkkkkkkkkk. skkkkkkkkkkkkkkkkkkkkkk.",
        "skkmmmkkkkmmmkkkkmmmkkk. skkmmmkkkkmmmkkkkmmmkkk. skkmmmkkkkmmmkkkkmmmkkk.",
        "skmffbmkkmffbmkkmffbmkk. skmbffmkkmbffmkkmbffmkk. skmbbfmkkmbbfmkkmbbfmkk.",
        "smffbffmmffbffmmffbffmk. smbbfbbmmbbfbbmmbbfbbmk. smfbfffmmfbfffmmfbfffmk.",
        "smbbaffmmbbaffmmbbaffmk. smfbafbmmfbafbmmfbafbmk. smffabbmmffabbmmffabbmk.",
        "smfffbfmmfffbfmmfffbfmk. smffbffmmffbffmmffbffmk. smbbffbmmbbffbmmbbffbmk.",
        "skmffbmkkmffbmkkmffbmkk. skmbbfmkkmbbfmkkmbbfmkk. skmbffmkkmbffmkkmbffmkk.",
        "skkmmmkkkkmmmkkkkmmmkkk. skkmmmkkkkmmmkkkkmmmkkk. skkmmmkkkkmmmkkkkmmmkkk.",
        "skkkkkkkkkkkkkkkkkkkkkk. skkkkkkkkkkkkkkkkkkkkkk. skkkkkkkkkkkkkkkkkkkkkk.",
        "saaaaaaaaaaaaaaaaaaaaaa. saaaaaaaaaaaaaaaaaaaaaa. saaaaaaaaaaaaaaaaaaaaaa.",
        "s....yyyy.yyyyyyyyyy.... s....yyyy.yyyyyyyyyy.... s....yyyy.yyyyyyyyyy....",
        "s....yyyy.yyyyyyyyyy.... s....yyyy.yyyyyyyyyy.... s....yyyy.yyyyyyyyyy....",
        "........................ ........................ ........................",
        "........................ ........................ ........................",
        "........................ ........................ ........................",
        "........................ ........................ ........................",
        "........................ ........................ ........................",
      ],
      {
        s: "#c5ced8",
        k: "#2b313a",
        a: "#e24b4b",
        y: "#e8c56b",
        m: "#8a96a3",
        f: "#1b2128",
        b: "#5b6674",
      }
    ),
  },
  {
    key: "gears",
    name: "Preview drivers",
    svg: pix(
      [
        "........................",
        ".......ooo..............",
        "....o..ooo..o...........",
        "...ooo.ooo.ooo..........",
        "..ooooooooooooo.........",
        "...ooooodooooo..........",
        "....oodddddoo...........",
        ".oooood...dooooo........",
        ".oooodd...ddoooo........",
        ".oooood...dooooo........",
        "....oodddddoo...........",
        "...ooooodooooo..........",
        "..ooooooooooooo.aaa.....",
        "...ooo.ooo.o....aaa.....",
        "....o..ooo...aaaaaaaaa..",
        ".......ooo..aaaaeeeaaaa.",
        ".............aaee.eeaa..",
        "..............ae...ea...",
        ".............aaee.eeaa..",
        "............aaaaeeeaaaa.",
        ".............aaaaaaaaa..",
        "................aaa.....",
        "................aaa.....",
        "........................",
      ],
      { o: "#c5ced8", d: "#8a96a3", a: "#f0a53a", e: "#b86f1c" },
      undefined,
      // meshed: each wheel moves a third of a tooth a frame, the small one backwards,
      // starting with a gap where the big wheel's tooth comes in
      [
        { ink: "od", cx: 8.5, cy: 8.5, step: 15, teeth: 8, rim: 5.1 },
        { ink: "ae", cx: 17.5, cy: 17.5, step: -20, teeth: 6, rim: 3.8, from: -15 },
      ]
    ),
  },
  {
    key: "coin",
    name: "Bitcoin",
    svg: pix(
      [
        "........................ ........................ ........................",
        ".........dddddd......... .........dddddd......... .........dddddd.........",
        "......hhhddyyddddd...... ......hhhddyyddddd...... ......hhhddyyddddd......",
        ".....hhhhyyyyyyyddd..... .....hhhyyyyyyyyddd..... .....hhhyyyyyyyyddd.....",
        "....hhhhyyyyyyyyyydd.... ....hhyyyyyyyyyyyhdd.... ....hhyyyyyyyyyyyydd....",
        "...hhhhyyyyyyyyyyyydd... ...hhyyyyyyyyyyyhhhdd... ...hhyyyyyyyyyyyyyydd...",
        "..hhhhyyyyyyyyyyyyyydd.. ..hhyyyyyyyyyyyhhhyydd.. ..hhyyyyyyyyyyyyyyyydd..",
        "..hhhyyyyybybyyyyyyydd.. ..hhyyyyyybybyhhhyyydd.. ..hhyyyyyybybyyyyyyydd..",
        "..hhyyyybbbbbbbyyyyyyd.. ..hyyyyybbbbbbbhyyyyyd.. ..hyyyyybbbbbbbyyyyyyd..",
        ".ddyyyyyybbyyybbyyyyydd. .ddyyyyyybbyhhbbyyyyydd. .ddyyyyyybbyyybbyyyyydd.",
        ".ddyyyyyybbyyybbyyyyydd. .ddyyyyyybbhhhbbyyyyydd. .ddyyyyyybbyyybbyyyyydd.",
        ".dyyyyyyybbbbbbyyyyyyyd. .dyyyyyyybbbbbbyyyyyyyd. .dyyyyyyybbbbbbyyyyyyyd.",
        ".dyyyyyyybbyyybbyyyyyyd. .dyyyyyyybbhyybbyyyyyyd. .dyyyyyyybbyyybbyyyyyyd.",
        ".ddyyyyyybbyyybbyyyyydd. .ddyyyyyhbbyyybbyyyyydd. .ddyyyyyybbyyybbyyyyydd.",
        ".ddyyyyyybbyyybbyyyyydd. .ddyyyyhhbbyyybbyyyyydd. .ddyyyyyybbyyybbyyyyydd.",
        "..dyyyyybbbbbbbyyyyyyd.. ..dyyyhhbbbbbbbyyyyyyd.. ..dyyyyybbbbbbbyyyyyyd..",
        "..ddyyyyyybybyyyyyyydd.. ..ddyhhhyybybyyyyyyydd.. ..ddyyyyyybybyyyyyyydd..",
        "..ddyyyyyyyyyyyyyyyydd.. ..ddhhhyyyyyyyyyyyyydd.. ..ddyyyyyyyyyyyyyyyydd..",
        "...ddyyyyyyyyyyyyyydd... ...ddhyyyyyyyyyyyyydd... ...ddyyyyyyyyyyyyyydd...",
        "....ddyyyyyyyyyyyydd.... ....ddyyyyyyyyyyyydd.... ....ddyyyyyyyyyyyydd....",
        ".....dddyyyyyyyyddd..... .....dddyyyyyyyyddd..... .....dddyyyyyyyyddd.....",
        "......dddddyyddddd...... ......dddddyyddddd...... ......dddddyyddddd......",
        ".........dddddd......... .........dddddd......... .........dddddd.........",
        "........................ ........................ ........................",
      ],
      { d: "#c98f1f", y: "#f0c14a", h: "#fbe08a", b: "#8a5a12" }
    ),
  },
  {
    key: "founder",
    name: "Wild entrepreneur",
    svg: pix(
      [
        "........................ ........................ ........................",
        "..................o..o.. ..................o..o.. ..................o..o..",
        "..................o..o.. ..................o..o.. ..................o..o..",
        "..................oooo.. ..................oooo.. ..................oooo..",
        ".................co..oc. .................co..oc. .................co..oc.",
        "............ffffffo..o.c ...............ffffffo.c ................c.ffffff",
        "....hhhh......ffffff.o.. ....hhhh.......c.ffffff. ....hhhh.......c..o.ffff",
        "...hhhhhh.....c...oooo.. ...hhhhhh.....c...oooo.. ...hhhhhh.....c...oooo..",
        "...hssssh....c....o..o.. ...hssssh....c....o..o.. ...hssssh....c....o..o..",
        "...hksskh...c.....o..o.. ...hksskh...c.....o..o.. ...hksskh...c.....o..o..",
        "...hssssh..c......o..o.. ...hssssh..c......o..o.. ...hssssh..c......o..o..",
        "....hhhh..pppppp..oooo.. ....hhhh..pppppp..oooo.. ....hhhh..pppppp..oooo..",
        "..hhHHHHhhppppgp..o..o.. ..hhHHHHhhppppGp..o..o.. ..hhHHHHhhppppgp..o..o..",
        "OOhhhhhhhhppppgpOOOOOOOO OOhhhhhhhhppppgpOOOOOOOO OOhhhhhhhhppppgpOOOOOOOO",
        "..hhhhhhhsppggpp..o..o.. ..hhhhhhhsppggpp..o..o.. ..hhhhhhhsppggpp..o..o..",
        "..hhhhhhhhpgpppp..o..o.. ..hhhhhhhhpgpppp..o..o.. ..hhhhhhhhpgpppp..o..o..",
        "..hhhhhhhhpppppp..o..o.. ..hhhhhhhhpppppp..o..o.. ..hhhhhhhhpppppp..o..o..",
        "..hhhhhhhh........o..o.. ..hhhhhhhh........o..o.. ..hhhhhhhh........o..o..",
        "..hhhhhhhh........o..o.. ..hhhhhhhh........o..o.. ..hhhhhhhh........o..o..",
        "...jjjjjj.........o..o.. ...jjjjjj.........o..o.. ...jjjjjj.........o..o..",
        "...jj..jj.........o..o.. ...jj..jj.........o..o.. ...jj..jj.........o..o..",
        "..kkk..kkk........o..o.. ..kkk..kkk........o..o.. ..kkk..kkk........o..o..",
        "........................ ........................ ........................",
        "........................ ........................ ........................",
      ],
      {
        o: "#c0362c",
        O: "#8e2a22",
        c: "#d4543f",
        f: "#9aa5b3",
        h: "#8793a1",
        H: "#5f6a78",
        s: "#f1c7a2",
        k: "#1b2128",
        j: "#3b5a8c",
        p: "#ecf0f3",
        g: "#76b900",
        G: "#b6f25a",
      }
    ),
  },
  {
    key: "lab",
    name: "Scientists",
    svg: pix(
      [
        "....................q... .....................q.. ...................q....",
        "....h..h..h..h.......... ....h..h..h..h.......... ....h..h..h..h..........",
        "...hhhhhhhhhhhh......q.. ...hhhhhhhhhhhh....q.... ...hhhhhhhhhhhh......q..",
        "..hhhhhhhhhhhhhh........ ..hhhhhhhhhhhhhh........ ..hhhhhhhhhhhhhh........",
        "..hhhsssssssshhh...q.... ..hhhsssssssshhh.....q.. ..hhhsssssssshhh....q...",
        "..hhgbbbggbbbghh........ ..hhgwbbggwbbghh........ ..hhgbbbggbbbghh........",
        "..hhgbbbggbbbghh.....q.. ..hhgbbbggbbbghh....q... ..hhgbbbggbbbghh.....q..",
        "...hhsshhhhsshh..ffff... ...hhsshhhhsshh..ffff... ...hhsshhhhsshh..ffff...",
        "......ssssss......ff.... ......ssssss......ff.... ......ssssss......ff....",
        "..ccccltrrtlcccc..ff.... ..ccccltrrtlcccc..ff.... ..ccccltrrtlcccc..ff....",
        ".cccccclrrlcccccc.ff.... .cccccclrrlcccccc.ff.... .cccccclrrlcccccc.ff....",
        ".cccccccrrcccccccffff... .cccccccrrcccccccffff... .cccccccrrcccccccffff...",
        ".cccccccllcccccsfqqqqf.. .cccccccllcccccsfqqqqf.. .cccccccllcccccsfqqqff..",
        ".cccccccllcccccsfqqqqf.. .cccccccllcccccsfqqqqf.. .cccccccllcccccsfqqqqf..",
        ".cccccccllccccc.fqqqqf.. .cccccccllccccc.fqqqqf.. .cccccccllccccc.fqqqqf..",
        ".cccccccllccccc..ffff... .cccccccllccccc..ffff... .cccccccllccccc..ffff...",
        ".cccccccllccccc......... .cccccccllccccc......... .cccccccllccccc.........",
        ".sccccccllcccccs........ .sccccccllcccccs........ .sccccccllcccccs........",
        ".cccccccllccccc......... .cccccccllccccc......... .cccccccllccccc.........",
        "...kkk....kkk........... ...kkk....kkk........... ...kkk....kkk...........",
        "...kkk....kkk........... ...kkk....kkk........... ...kkk....kkk...........",
        "..kkkk....kkkk.......... ..kkkk....kkkk.......... ..kkkk....kkkk..........",
        "........................ ........................ ........................",
        "........................ ........................ ........................",
      ],
      {
        h: "#e7edf4",
        s: "#f1c7a2",
        g: "#58646f",
        b: "#7ad7f0",
        w: "#ffffff",
        c: "#f7f9fb",
        l: "#b9c4cf",
        t: "#6ab0f3",
        r: "#e24b4b",
        k: "#3a4552",
        f: "#d7eef6",
        q: "#7ee787",
      }
    ),
  },
  {
    key: "card",
    name: "GPU credit",
    svg: pix(
      [
        "........................ ........................ ........................",
        "........................ ........................ ........................",
        "........................ ........................ ........................",
        "........................ ........................ ........................",
        "........................ ........................ ........................",
        "..bLLLbbbbbbbbbbbbbbbb.. ..bbbbbbbbbbbbbLLLbbbb.. ..bbbbbbbbbbbbbbbbbbbb..",
        ".bLLLbbbbbbbbbbbbbbbbbb. .bbbbbbbbbbbbbLLLbbbbbb. .bbbbbbbbbbbbbbbbbbbbbb.",
        ".LLLbbbbbbbbbbbbbbbbbbb. .bbbbbbbbbbbbLLLbbbbbbb. .bbbbbbbbbbbbbbbbbbbbbb.",
        ".LLbyyyyybbbbbbbbbbbbbb. .bbbyyyyybbbLLLbbbbbbbb. .bbbyyyyybbbbbbbbbbbbbb.",
        ".Lbbyoyoybbbbbbbbbbbbbb. .bbbyoyoybbLLLbbbbbbbbb. .bbbyoyoybbbbbbbbbbbbbb.",
        ".bbbyyyyybbbbbbbbbbbbbb. .bbbyyyyybLLLbbbbbbbbbb. .bbbyyyyybbbbbbbbbbbbbL.",
        ".bbbyoyoybbbbbbbbbbbbbb. .bbbyoyoyLLLbbbbbbbbbbb. .bbbyoyoybbbbbbbbbbbbLL.",
        ".bbbbbbbbbbbbbbbbbbbbbb. .bbbbbbbLLLbbbbbbbbbbbb. .bbbbbbbbbbbbbbbbbbbLLL.",
        ".bbbwwwbwwwbwwwbwwwbbbb. .bbbwwwLwwwbwwwbwwwbbbb. .bbbwwwbwwwbwwwbwwwLLLb.",
        ".bbbbbbbbbbbbbbbbbbbbbb. .bbbbbLLLbbbbbbbbbbbbbb. .bbbbbbbbbbbbbbbbbLLLbb.",
        ".bbbwwwwwwbbbbbbrrbaabb. .bbbwwwwwwbbbbbbrrbaabb. .bbbwwwwwwbbbbbbrrLaabb.",
        ".bbbbbbbbbbbbbbbrroaabb. .bbbLLLbbbbbbbbbrroaabb. .bbbbbbbbbbbbbbbrroaabb.",
        ".bbbbbbbbbbbbbbbbrbabbb. .bbLLLbbbbbbbbbbbrbabbb. .bbbbbbbbbbbbbbLLrbabbb.",
        "..bbbbbbbbbbbbbbbbbbbb.. ..LLLbbbbbbbbbbbbbbbbb.. ..bbbbbbbbbbbbLLLbbbbb..",
        "........................ ........................ ........................",
        "........................ ........................ ........................",
        "........................ ........................ ........................",
        "........................ ........................ ........................",
        "........................ ........................ ........................",
      ],
      {
        b: "#3d6fd8",
        L: "#6f96e8",
        y: "#e8c56b",
        o: "#b88a2e",
        w: "#e7eef6",
        r: "#e24b4b",
        a: "#f0a53a",
      }
    ),
  },
  {
    key: "car",
    name: "Car thief",
    svg: pix(
      [
        "........................ ........................ ........................",
        "........................ ........................ ........................",
        "........................ ...gggggggggggggggggg... ........................",
        "...gggggggggggggggggg... ...gkkkgkkkggkkkgkkkg... ...gggggggggggggggggg...",
        "...gkkkgkkkggkkkgkkkg... ...gkkkgkkkggkkkgkkkg... ...gkkkgkkkggkkkgkkkg...",
        "...gkkkgkkkggkkkgkkkg... ...gggggggggggggggggg... ...gkkkgkkkggkkkgkkkg...",
        "...gggggggggggggggggg... ...yyyyyyyy.yyyyyyyyy... ...gggggggggggggggggg...",
        "...yyyyyyyy.yyyyyyyyy... ........................ ...yyyyyyyy.yyyyyyyyy...",
        "........................ ........................ ........................",
        "........................ ........rrrrrrr......... ........................",
        "........rrrrrrr......... ......rrcccrcccrr....... ........rrrrrrr.........",
        "......rrcccrcccrr....... ....rrrccccrccccrrr..... wwww..rrcccrcccrr.......",
        "www.rrrccccrccccrrr..... ..rrrrrrrrrrrrrrrrrrrrr. ....rrrccccrccccrrr.....",
        "..rrrrrrrrrrrrrrrrrrrrr. .errrrrrrrrrrrrrrrrrrrl. ..rrrrrrrrrrrrrrrrrrrrr.",
        ".errrrrrrrrrrrrrrrrrrrl. .dddddddddddddddddddddd. .errrrrrrrrrrrrrrrrrrrl.",
        ".ddddkkkkddddddddkkkkdd. ..dddkkkkddddddddkkkkdd. .ddddkkkkddddddddkkkkdd.",
        "..ddkkkkkkddddddkkkkkkd. ....kkkkkk......kkkkkk.. ..ddkkkkkkddddddkkkkkkd.",
        "....kksskk......kksskk.. ....kkskkk......kkskkk.. ....kkkskk......kkkskk..",
        "....kksskk......kksskk.. ....kkkskk......kkkskk.. ....kkskkk......kkskkk..",
        ".....kkkk........kkkk... .....kkkk........kkkk... .....kkkk........kkkk...",
        "........................ ........................ ........................",
        "........................ ........................ ........................",
        "........................ ........................ ........................",
        "........................ ........................ ........................",
      ],
      {
        g: "#1f8a4c",
        k: "#1b2128",
        y: "#e8c56b",
        r: "#e24b4b",
        d: "#a8322f",
        c: "#9fd3f0",
        e: "#7a1f1f",
        l: "#ffe38a",
        s: "#c5ced8",
        w: "#5b6674",
      }
    ),
  },
  {
    key: "moon",
    name: "Moon base",
    svg: pix(
      [
        "........................ ........................ ........................",
        "...........bb........... ...........bb........... ...........bb...........",
        "..........bbbb.......... ..........bbbb.......... ..........bbbb..........",
        ".........rrrrrr......... .........rrrrrr......... .........rrrrrr.........",
        ".........bbbbbb......... .........bbbbbb......... .........bbbbbb.........",
        "........bbbbbbbb........ ........bbbbbbbb........ ........bbbbbbbb........",
        "........bbbwwbbb........ ........bbbwwbbb........ ........bbbwwbbb........",
        "........bbwbbwbb........ ........bbwbbwbb........ ........bbwbbwbb........",
        "........bbwbbwbb........ ........bbwbbwbb........ ........bbwbbwbb........",
        "........bbbwwbbb........ ........bbbwwbbb........ ........bbbwwbbb........",
        "........bbbbbbbb........ ........bbbbbbbb........ ........bbbbbbbb........",
        "........bbbbbbbb........ ........bbbbbbbb........ ........bbbbbbbb........",
        ".......rbbbbbbbbr....... .......rbbbbbbbbr....... .......rbbbbbbbbr.......",
        "......rrbbbbbbbbrr...... ......rrbbbbbbbbrr...... ......rrbbbbbbbbrr......",
        ".....rrrbbbbbbbbrrr..... .....rrrbbbbbbbbrrr..... .....rrrbbbbbbbbrrr.....",
        ".....rrr.boyyob.rrr..... .....rrr.boyyob.rrr..... .....rrr.boyyob.rrr.....",
        ".....rr...oyyo...rr..... .....rr...oyyo...rr..... .....rr....yy....rr.....",
        "...........oo........... ..........oyyo.......... ...........oo...........",
        "...........oo........... ...........oo........... ........................",
        "........................ ...........oo........... ........................",
        "...........oo........... ...........oo........... ...........oo...........",
        "........................ ........................ ........................",
        "........................ ........................ ........................",
        "........................ ........................ ........................",
      ],
      {
        b: "#e7edf4",
        w: "#1b2128",
        r: "#e24b4b",
        d: "#6b7785",
        y: "#f0c14a",
        o: "#f08a3a",
      }
    ),
  },
  {
    key: "oil",
    name: "New oil",
    svg: pix(
      [
        "........................ ........................ ........................",
        "........................ ........................ ........................",
        "......tttttttttttt...... ......tttttttttttt...... ......tttttttttttt......",
        ".....ddddddkkkkdddd..... .....ddddddkkkkdddd..... .....ddddddkkkkdddd.....",
        ".....bhbkkbbkkbbbss..... .....bhbkkbbkkbbbss..... .....bhbkkbbkkbbbss.....",
        ".....bhbkkbbkkbbbss..... .....bhbkkbbkkbbbss..... .....bhbkkbbkkbbbss.....",
        ".....bhbkbbbkkbbbss..... .....bhbkkbbkkbbbss..... .....bhbkkbbkkbbbss.....",
        ".....ddddddddkdddds..... .....dddkddddkdddds..... .....dddkddddkdddds.....",
        ".....bhbbbbbbkbbbss..... .....bhbbbbbbkbbbss..... .....bhbbbbbbkbbbss.....",
        ".....bhbyyybbbyyyss..... .....bhbyyybbkyyyss..... .....bhbyyybbbyyyss.....",
        ".....bhyybyybbbybss..... .....bhyybyybkbybss..... .....bhyybyybbbybss.....",
        ".....bhyybyybbbybss..... .....bhyybyybbbybss..... .....bhyybyybbbybss.....",
        ".....bhyyyyybbbybss..... .....bhyyyyybbbybss..... .....bhyyyyybbbybss.....",
        ".....bhyybyybbbybss..... .....bhyybyybbbybss..... .....bhyybyybkbybss.....",
        ".....bhyybyybbbybss..... .....bhyybyybbbybss..... .....bhyybyybkbybss.....",
        ".....bhyybyybbyyyss..... .....bhyybyybbyyyss..... .....bhyybyybbyyyss.....",
        ".....bhbbbbbbbbbbss..... .....bhbbbbbbbbbbss..... .....bhbbbbbbbbbbss.....",
        ".....ddddddddddddds..... .....ddddddddddddds..... .....ddddddddddddds.....",
        ".....bhbbbbbbbbbbss..... .....bhbbbbbbbbbbss..... .....bhbbbbbbbbbbss.....",
        ".....bhbbbbbbbbbbss..... .....bhbbbbbbbbbbss..... .....bhbbbbbbbbbbss.....",
        ".....bhbbbbbbbbbbss..... .....bhbbbbbbbbbbss..... .....bhbbbbbbbbbbss.....",
        ".....dddddddddddddd..... .....dddddddddddddd..... .....dddddddddddddd.....",
        "........................ ........................ ........................",
        "........................ ........................ ........................",
      ],
      {
        t: "#4a8fd4",
        b: "#2f6fb0",
        d: "#1f4a78",
        h: "#5aa0e6",
        s: "#245a91",
        y: "#f0c14a",
        k: "#101318",
      }
    ),
  },
  {
    key: "dance",
    name: "Robot dance",
    svg: pix(
      [
        "........................ ........................ ........................",
        "........................ ...........nn........... ........................",
        "...........nn........... ...........n.n.......... ...........nn...........",
        "...........n.n.......... ...........n............ ...........n.n..........",
        "...........n............ .........nnn............ ...........n............",
        ".....a...nnn............ .....a...nnn............ .....a...nnn............",
        ".....m...nnn.....hhhh... .....m...........hhhh... .....m...nnn.....hhhh...",
        ".m.mmmmmm.....s.hhhhhh.. .m.mmmmmm.m...s.hhhhhh.s ...mmmmmm.m.....hhhhhh.s",
        ".m.mcmmcm.....s..ssss... .m.mcmmcm.m...s..ssss..s ...mcmmcm.m......ssss..s",
        ".m.mmmmmm.....s..ssss... .m.mmmmmm.m...s..ssss..s ...mmmmmm.m......ssss..s",
        ".m...mm.......s...ss.... .m...mm...m...s...ss...s .....mm...m.......ss...s",
        ".mmmmmmmmmm...sssppppsss .mmmmmmmmmm...sssppppsss .mmmmmmmmmm...sssppppsss",
        "....mmmm..m......pppp..s ....mmmm.........pppp... .m..mmmm......s..pppp...",
        "....mddm..m......pppp..s ....mddm.........pppp... .m..mddm......s..pppp...",
        "....mmmm..m......pppp..s ....mmmm.........pppp... .m..mmmm......s..pppp...",
        "....mmmm.........jjjj... ....mmmm.........jjjj... ....mmmm.........jjjj...",
        "....m..m.........j..j... ....m..m.........j..j... ....m..m.........j..j...",
        "....m..m.........j..j... ....m..m.........j..j... ....m..m.........j..j...",
        "...mm..mm.......kk..kk.. ...mm..mm.......kk..kk.. ...mm..mm.......kk..kk..",
        "........................ ........................ ........................",
        ".gefgefgefgefgefgefgefg. .efgefgefgefgefgefgefge. .fgefgefgefgefgefgefgef.",
        "........................ ........................ ........................",
        "........................ ........................ ........................",
        "........................ ........................ ........................",
      ],
      {
        a: "#e24b4b",
        m: "#c5ccd6",
        c: "#58d6d6",
        d: "#6b7785",
        n: "#f0c14a",
        h: "#4a3728",
        s: "#f1c7a2",
        p: "#e87fb0",
        j: "#3d6fd8",
        k: "#1b2128",
        f: "#7a4fd1",
        g: "#e24b8f",
        e: "#3fb6e2",
      },
      [0, 1, 2, 1]
    ),
  },
  {
    key: "loop",
    name: "RSI startup",
    svg: pix(
      [
        "..............gg........ ........................ ........................",
        ".........gggggggg....... .........gggggg......... .........gggggg.........",
        "......gggggggggggg...... ......gggggggggggg...... ......gggggggggggg......",
        ".....gggg....gggg....... .....gggg......gggg..... .....gggg......gggg.....",
        "....ggg......gg......... ....ggg..........ggg.... ....ggg..........ggg....",
        "...ggg.....ll........... ...ggg.....ll.....ggg... ...ggg......l.....ggg...",
        "..ggg...llllllll........ ..ggg...llllllll...ggg.. ..ggglllll..llll...ggg..",
        "..gg...lll....lll...gg.. ..gg...lll....lll...gg.. .......lll....lll...gg..",
        "..gg..ll........ll..gg.. ..gg..ll........ll..gg.. ......llll......ll..gg..",
        ".gg...ll........ll...gg. .gg...ll........ll.l.gg. ......ll.l......ll...gg.",
        ".gg...l....ww....l...gg. .gg...l....ww...llll.gg. ......l....ww....l...gg.",
        ".gg..ll...wwww...ll..gg. .gg..ll...wwww..lll..gg. .....ll...wwww...ll..gg.",
        ".gg..ll...wwww...ll..gg. .gg..ll...wwww...ll..gg. .gg..ll...wwww...ll..gg.",
        ".gg...l....ww....l...gg. .gg...l....ww........gg. gggg..l....ww....l...gg.",
        ".gg...ll........ll...gg. .gg...ll.............gg. ggggg.ll........ll...gg.",
        "..gg......l.....ll..gg.. ..gg..ll........ll..gg.. gggg..ll........ll..gg..",
        "..gg.....ll...lll...gg.. ..gg...lll....lll...gg.. ..gg...lll....lll...gg..",
        "..ggg...llllllll...ggg.. ..ggg...llllllll.ggggg.. ..ggg...llllllll...ggg..",
        "...ggg...llll.....ggg... ...ggg.....ll....gggg... ...ggg.....ll.....ggg...",
        "....ggg...l......ggg.... ....ggg..........gggg... ....ggg..........ggg....",
        ".....gggg......gggg..... .....gggg........ggggg.. .....gggg......gggg.....",
        "......gggggggggggg...... ......gggggg.....g...... ......gggggggggggg......",
        ".........gggggg......... .........ggg............ .........gggggg.........",
        "........................ ........................ ........................",
      ],
      { g: "#3fae5a", l: "#7ee787", w: "#d9ffd9" }
    ),
  },
  {
    key: "stamp",
    name: "Cybernetics",
    svg: pix(
      [
        "........................ ........................ ........................",
        "...pppppppppppps........ ...pppppppppppps........ ...pppppppppppps........",
        "...ppppppppppppss....... ...ppppppppppppss....... ...ppppppppppppss.......",
        "...ppppppppppppsss...... ...ppppppppppppsss...... ...ppppppppppppsss......",
        "...ppppkppkkkppssss..... ...ppppkppkkkppssss..... ...ppppkppkkkppssss.....",
        "...pppkpkppkppppppp..... ...pppkpkppkppppppp..... ...pppkpkppkppppppp.....",
        "...pprrrrrrrrrrpppp..... ...pprrrrrrrrrrpppp..... ...pprrrrrrrrrrpppp.....",
        "...pppkpkppkppppppp..... ...pppkpkppkppppppp..... ...pppkpkppkppppppp.....",
        "...pppkpkpkkkpppppp..... ...pppkpkpkkkpppppp..... ...pppkpkpkkkpppppp.....",
        "...pppppppppppppppp..... ...pppppppppppppppp..... ...pppppppppppppppp.....",
        "...pppppppppppppppp..... ...pppppppppppppppp..... ...pppppppppppppppp.....",
        "...ppllllllllllllpp..... ...pplllllllllrrrrr..... ...ppllllllllllllpp.....",
        "...pppppppppppppppp..... ...ppppppppprrrrprrrr... ...ppppppppppprrrrr.....",
        "...ppllllllllllllpp..... ...ppllllllrrrlllpprrr.. ...ppllllllllrrrlrrr....",
        "...pppppppppppppppp..... ...pppppppprrpprrrp.rr.. ...ppppppppprrppppprr...",
        "...ppllllllllllllpp..... ...pplllllrrllrrrrr..rr. ...pplllllllrllrrrp.r...",
        "...pppppppppppppppp..... ...ppppppprrpprrrrr..rr. ...ppppppppprprrrrr.r...",
        "...ppllllllpppppppp..... ...pplllllrrpprrrrr..rr. ...ppllllllprprrrrr.r...",
        "...pppppppppppppppp..... ...ppppppprrpprrrrr..rr. ...ppppppppprpprrrp.r...",
        "...pppppppppppppppp..... ...pppppppprrpprrrp.rr.. ...ppppppppprrppppprr...",
        "...pppppppppppppppp..... ...pppppppprrrppppprrr.. ...pppppppppprrrprrr....",
        "...pppppppppppppppp..... ...ppppppppprrrrprrrr... ...ppppppppppprrrrr.....",
        "........................ ..............rrrrr..... ........................",
        "........................ ........................ ........................",
      ],
      { p: "#f4efe4", s: "#c9c2b2", k: "#1b2128", r: "#e24b4b", l: "#8aa0b4" },
      [0, 0, 1, 2, 2, 2, 2, 2]
    ),
  },
  {
    key: "eighties",
    name: "The eighties",
    svg: pix(
      [
        "........................ ........................ ........................",
        "........................ ........................ ........................",
        "........bb....bb........ ........bb....bb........ ........bb....bb........",
        ".........bb..bb......... .........bb..bb......... .........bb..bb.........",
        "..........bbbb.......... ..........bbbb.....w.... ..........bbbb..........",
        "....w....rrrrrr......... .........rrrrrr...www... .........rrrrrr.........",
        "...www....bbbb.......... ..........bbbb.....w.... ..........bbbb..........",
        "....w....bbbbbb......... .........bbbbbb......... .........bbbbbb.........",
        ".......bbbbbbbbbb....... .......bbbbbbbbbb....... .......bbbbbbbbbb.......",
        ".....bbbbbbbbbbbbbb..... .....bbbbbbbbbbbbbb..... .....bbbbbbbbbbbbbb.....",
        "....bbbbbbbb$bbbbbdd.... ....bbbbbbbb$bbbbbdd.... ....bbbbbbbb$bbbbbdd....",
        "...bbbbbbbb$$$$bbbbdd... ...bbbbbbbb$$$$bbbbdd... ...bbbbbbbb$$$$bbbbdd...",
        "...bbbbbbb$b$bbbbbbdd... ...bbbbbbb$b$bbbbbbdd... ...bbbbbbb$b$bbbbbbdd...",
        "..bbbbbbbbb$$$bbbbbbdd.. ..bbbbbbbbb$$$bbbbbbdd.. ..bbbbbbbbb$$$bbbbbbdd..",
        "..bbbbbbbbbb$b$bbbbbdd.. ..bbbbbbbbbb$b$bbbbbdd.. ..bbbbbbbbbb$b$bbbbbdd..",
        "..bbbbbbbb$$$$bbbbbbdd.. ..bbbbbbbb$$$$bbbbbbdd.. ..bbbbbbbb$$$$bbbbbbdd..",
        "..bbbbbbbbbb$bbbbbbbdd.. ..bbbbbbbbbb$bbbbbbbdd.. ..bbbbbbbbbb$bbbbbbbdd..",
        "..bbbbbbbbbbbbbbbbbbdd.. ..bbbbbbbbbbbbbbbbbbdd.. ..bbbbbbbbbbbbbbbbbbdd..",
        "...bbbbbbbbbbbbbbbbdd... ...bbbbbbbbbbbbbbbbdd... ...bbbbbbbbbbbbbbbbdd...",
        "....bbbbbbbbbbbbbbdd.... ....bbbbbbbbbbbbbbdd.... ....bbbbbbbbbbbbbbdd....",
        "......dddddddddddd...... ......dddddddddddd...... ......dddddddddddd..w...",
        "........................ ........................ ...................www..",
        "........................ ........................ ....................w...",
        "........................ ........................ ........................",
      ],
      { b: "#c9a26b", d: "#8a6a3e", r: "#6b4a2a", $: "#3fae5a", w: "#fff6d0" }
    ),
  },
  {
    key: "sand",
    name: "Last month",
    svg: pix(
      [
        "........................ ........................ ........................",
        "........................ ........................ ........................",
        ".....vvvvvvvvvvvvvv..... .....vvvvvvvvvvvvvv..... .....vvvvvvvvvvvvvv.....",
        ".....wwwwwwwwwwwwww..... .....wwwwwwwwwwwwww..... .....wwwwwwwwwwwwww.....",
        ".....v.giiiiiiiig.v..... .....v.giiiiiiiig.v..... .....v.giiiiiiiig.v.....",
        ".....v.giiiiiiiig.v..... .....v.giiiiiiiig.v..... .....v.giiiiiiiig.v.....",
        ".....v.giiiiiiiig.v..... .....v.giiiiiiiig.v..... .....v.giiiiiiiig.v.....",
        ".....v.giiiiiiiig.v..... .....v.giiiiiiiig.v..... .....v.giiiiiiiig.v.....",
        ".....v..giiiiiig..v..... .....v..giiiiiig..v..... .....v..giiiiiig..v.....",
        ".....v...gssssg...v..... .....v...giiiig...v..... .....v...giiiig...v.....",
        ".....v....gssg....v..... .....v....gssg....v..... .....v....giig....v.....",
        ".....v.....gg.....v..... .....v.....gg.....v..... .....v.....gg.....v.....",
        ".....v.....gg.....v..... .....v.....gg.....v..... .....v.....gg.....v.....",
        ".....v....gssg....v..... .....v....gssg....v..... .....v....giig....v.....",
        ".....v...gissig...v..... .....v...giiiig...v..... .....v...gssssg...v.....",
        ".....v..gissssig..v..... .....v..gissssig..v..... .....v..gssssssg..v.....",
        ".....v.gissssssig.v..... .....v.gssssssssg.v..... .....v.gssssssssg.v.....",
        ".....v.gssssssssg.v..... .....v.gssssssssg.v..... .....v.gssssssssg.v.....",
        ".....v.gssssssssg.v..... .....v.gssssssssg.v..... .....v.gssssssssg.v.....",
        ".....v.gssssssssg.v..... .....v.gssssssssg.v..... .....v.gssssssssg.v.....",
        ".....wwwwwwwwwwwwww..... .....wwwwwwwwwwwwww..... .....wwwwwwwwwwwwww.....",
        ".....vvvvvvvvvvvvvv..... .....vvvvvvvvvvvvvv..... .....vvvvvvvvvvvvvv.....",
        "........................ ........................ ........................",
        "........................ ........................ ........................",
      ],
      { w: "#c4874a", v: "#8a5a2e", g: "#bfe3f5", i: "#2a3a48", s: "#f0c14a" }
    ),
  },
];

export const EVENT_ART: Record<string, string> = Object.fromEntries(
  NEWS_ART.map(item => [item.key, item.svg])
);

// Riches that popcorn up from the bottom of the window once profit is very high
// (LuxuryPopcorn.tsx), with the start card's GPU and the dancing robot: a bag of
// money, a private jet, a sports car, a gold watch, a beach villa, a diamond, a
// ruby, an emerald, a sapphire, gold bars, a martini, a top hat and monocle, a bow
// tie and a T-bone steak.
export const LUXURY_ART: NewsArt[] = [
  {
    key: "bag",
    name: "Bag of money",
    svg: pix(
      [
        "........................",
        "........................",
        "..........kkkk..........",
        ".........kbbbbk.........",
        "..........kbbk..........",
        "...........kk...........",
        "..........ryyr..........",
        ".........kbbbbk.........",
        "........kbbbbbbk........",
        ".......kbbbbbbbbk.......",
        "......kbbbbggbbbbk......",
        ".....kbbbbgggggbbbk.....",
        ".....kbbbgggbbbbbbk.....",
        "....kbbbbbgggggbbbbk....",
        "....kbbbbbbbbbgggbbk....",
        "....kbbbbbbbbbgggbbk....",
        "....kbbbbgggggggbbbk....",
        "....kbbbbbbggbbbbbbk....",
        "....kdbbbbbbbbbbbbdk....",
        ".....kddbbbbbbbbddk.....",
        "......kkddddddddkk......",
        "........kkkkkkkk........",
        "........................",
        "........................",
      ],
      {
        k: "#3a2615",
        b: "#c8954e",
        d: "#9a6a32",
        g: "#2f8f3a",
        r: "#e8c56b",
        y: "#b88a2e",
      }
    ),
  },
  {
    key: "jet",
    name: "Private jet",
    svg: pix(
      [
        "........................",
        "........................",
        "........................",
        "........................",
        "...tt...................",
        "...ttt..................",
        "...tttt.................",
        "...wttww................",
        "...wwwwwwwwwwwwwwww.....",
        "..wwwwwwwwwwwwwwwwwww...",
        ".wwwswswswswswswswwgww..",
        ".wwwwwwwwwwwwwwwwwwggww.",
        "..lllllllllllllllllllll.",
        "...llllllwwwwwlllllll...",
        ".........wwwwwww........",
        "..........wwwwwww.......",
        "...........kk...........",
        "........................",
        "........................",
        "..ccc.......ccc.....cc..",
        "........................",
        "........................",
        "........................",
        "........................",
      ],
      {
        w: "#e7eef6",
        l: "#9aabbc",
        s: "#3fb6e2",
        g: "#2a3a48",
        t: "#e24b4b",
        k: "#243040",
        c: "#c4d4e6",
      }
    ),
  },
  {
    key: "car",
    name: "Sports car",
    svg: pix(
      [
        "........................",
        "........................",
        "........................",
        "........................",
        "........................",
        "........................",
        "........................",
        "........................",
        "..........rrrrrr........",
        "........rrggggggrr......",
        "......rrrgggrgggggrr....",
        "...rrrrrrrrrrrrrrrrrrrr.",
        "..rrrrrrrrrrrrrrrrrrrryr",
        ".yrrrrrrrrrrrrrrrrrrrrrr",
        ".rrrrrrrrrrrrrrrrrrrrrrr",
        ".ddkkkddddddddddddkkkdd.",
        "...kkkkk........kkkkk...",
        "...kkhkk........kkhkk...",
        "...kkkkk........kkkkk...",
        "....kkk..........kkk....",
        "........................",
        "........................",
        "........................",
        "........................",
      ],
      {
        r: "#e24b4b",
        d: "#9e2a2a",
        g: "#bfe3f5",
        k: "#1b2128",
        h: "#9aabbc",
        y: "#f0c14a",
      }
    ),
  },
  {
    key: "watch",
    name: "Gold watch",
    svg: pix(
      [
        "........................",
        "..........bbbb..........",
        "..........bbbb..........",
        "..........bbbb..........",
        "..........bbbb..........",
        "........oooooooo........",
        "......ooyyyyyyyyoo......",
        ".....oyyffffffffyyo.....",
        ".....oyffffkfffffyo.....",
        "....oyfffffkffffffyo....",
        "....oyfffffkffffffyoc...",
        "....oyfffffkkkkfffyoc...",
        "....oyffffffffffffyo....",
        "....oyffffffffffffyo....",
        ".....oyffffffffffyo.....",
        ".....oyyffffffffyyo.....",
        "......ooyyyyyyyyoo......",
        "........oooooooo........",
        "..........bbbb..........",
        "..........bbbb..........",
        "..........bbbb..........",
        "..........bbbb..........",
        "........................",
        "........................",
      ],
      {
        o: "#b88a2e",
        y: "#f0c14a",
        f: "#fdf6e3",
        k: "#2a3a48",
        b: "#8a5a2e",
        c: "#e8c56b",
      }
    ),
  },
  {
    key: "villa",
    name: "Luxury villa",
    svg: pix(
      [
        "........................",
        "........................",
        "..pp....................",
        ".pppp...................",
        "pp.ppp..................",
        "...t....................",
        "...t...wwwwwwwwwwwwwwwww",
        "...t...wwwwwwwwwwwwwwwww",
        "...t...wgggggwwwgggggggw",
        "...t...wgggggwwwgggggggw",
        "...t...wwwwwwwwwwwwwwwww",
        "...t.wwwwwwwwwwwwww.....",
        "...t.wwwwwwwwwwwwww.....",
        "...t.wgggggggwwddww.....",
        "...t.wgggggggwwddww.....",
        "...t.wgggggggwwddww.....",
        "sssssssssssssssssssssss.",
        "qqqqqqqqqqqqqqqqqqqqqqq.",
        "qaaaaaaaaaaaaaaaaaaaaaq.",
        "qaAaaaaAAaaaaaAaaaaaaaq.",
        "qaaaaaaaaaaaaaaaaaaaaaq.",
        "qqqqqqqqqqqqqqqqqqqqqqq.",
        "........................",
        "........................",
      ],
      {
        w: "#f2efe6",
        g: "#3fb6e2",
        d: "#8a5a2e",
        p: "#3a9a48",
        t: "#8a5a2e",
        s: "#d8c9a8",
        q: "#c4c0b4",
        a: "#3f8fe2",
        A: "#bfe3f5",
      }
    ),
  },
  {
    key: "diamond",
    name: "Diamond",
    svg: pix(
      [
        "........................",
        "........................",
        "........................",
        "........................",
        ".......oooooooooo.......",
        "......oLLwLLwLLwLo......",
        ".....oLwwLLwwLLwwLo.....",
        "....oLLLLLLLLLLLLLLLo...",
        "...ooooooooooooooooooo..",
        "...obbLLbbbwwbbbLLbbbo..",
        "....obbLLbbwwbbLLbbbo...",
        ".....obbLLbwwbLLbbbo....",
        "......obbLLwwLLbbbo.....",
        ".......obbLwwLbbbo......",
        "........obbwwbbbo.......",
        ".........obwwbbo........",
        "..........owwbo.........",
        "...........oo...........",
        "........................",
        "........................",
        "........................",
        "........................",
        "........................",
        "........................",
      ],
      { o: "#5b8fb0", L: "#bfe9ff", w: "#ffffff", b: "#8fd3f4" }
    ),
  },
  {
    key: "ruby",
    name: "Ruby",
    svg: pix(
      [
        "........................",
        "........................",
        "........................",
        "........................",
        "........oooooooo........",
        "......ooRRRRRRRRoo......",
        ".....oRRrrrrrrrrRRo.....",
        "....oRrrhhrrrrrrrrRo....",
        "....oRrhhrrrrrrrrrRo....",
        "...oRrrhrrppppprrrrRo...",
        "...oRrrrrppppppprrrRo...",
        "...oRrrrrppppppprrrRo...",
        "...oRrrrrppppppprrrRo...",
        "...oRrrrrrppppprrrrRo...",
        "....oRrrrrrrrrrrrrRo....",
        "....oRrrrrrrrrrrrrRo....",
        ".....oRRrrrrrrrrRRo.....",
        "......ooRRRRRRRRoo......",
        "........oooooooo........",
        "........................",
        "........................",
        "........................",
        "........................",
        "........................",
      ],
      {
        o: "#5a0a1a",
        R: "#9e1630",
        r: "#d8233f",
        p: "#f04a62",
        h: "#ffc4cf",
        d: "#7a0f22",
      }
    ),
  },
  {
    key: "emerald",
    name: "Emerald",
    svg: pix(
      [
        "........................",
        "........................",
        "........................",
        "........................",
        "........................",
        "......oooooooooooo......",
        ".....oGGGGGGGGGGGGo.....",
        "....oGggggggggggggGo....",
        "....oGgLLLLLLLLLLgGo....",
        "....oGgLhhllllllLgGo....",
        "....oGgLhlllllllLgGo....",
        "....oGgLllllllllLgGo....",
        "....oGgLllllllllLgGo....",
        "....oGgLllllllllLgGo....",
        "....oGgLLLLLLLLLLgGo....",
        "....oGggggggggggggGo....",
        ".....oGGGGGGGGGGGGo.....",
        "......oooooooooooo......",
        "........................",
        "........................",
        "........................",
        "........................",
        "........................",
        "........................",
      ],
      {
        o: "#0a3d1f",
        G: "#137a3e",
        g: "#1fa356",
        L: "#2fd06e",
        l: "#5ee893",
        h: "#c8f7d6",
      }
    ),
  },
  {
    key: "sapphire",
    name: "Sapphire",
    svg: pix(
      [
        "........................",
        "........................",
        "........................",
        "..........oooo..........",
        "........ooBBBBoo........",
        ".......oBBbbbbBBo.......",
        "......oBbbhhbbbbBo......",
        ".....oBbbhhbbbbbbBo.....",
        ".....oBbhbbbllbbbBo.....",
        "....oBbbbbbllllbbbBo....",
        "....oBbbbbllllllbbBo....",
        "....oBbbbbllllllbbBo....",
        "....oBbbbbbllllbbbBo....",
        "....oBbbbbbbllbbbbBo....",
        ".....oBbbbbbbbbbbBo.....",
        ".....oBbbbbbbbbbdBo.....",
        "......oBbbbbbbbddBo.....",
        ".......oBbbbbbbbBo......",
        "........ooBBBBoo........",
        "..........oooo..........",
        "........................",
        "........................",
        "........................",
        "........................",
      ],
      {
        o: "#0b1f5c",
        B: "#1a3d9e",
        b: "#2f5fd8",
        l: "#5c8cf0",
        h: "#c4d8ff",
        d: "#14307a",
      }
    ),
  },
  {
    key: "goldbars",
    name: "Gold bars",
    svg: pix(
      [
        "........................",
        "........................",
        "........................",
        "........................",
        "........................",
        "........................",
        "........................",
        "........oooooooo........",
        ".......ohhhhhhhhyo......",
        "......oyyyyyyyyyyyo.....",
        "......oddddddddddddo....",
        "...oooooooo.oooooooo....",
        "..ohhhhhhhhyohhhhhhhhyo.",
        ".oyyyyyyyyyyoyyyyyyyyyyo",
        ".oddddddddddoddddddddddo",
        ".oooooooooooooooooooooo.",
        "........................",
        "........................",
        "........................",
        "........................",
        "........................",
        "........................",
        "........................",
        "........................",
      ],
      { o: "#7a5512", h: "#fff1a8", y: "#f0c14a", d: "#c8962a" }
    ),
  },
  {
    key: "martini",
    name: "Martini",
    svg: pix(
      [
        "........................",
        "........................",
        "................k.......",
        "...............k........",
        "..wwwwwwwwwwwwkwwwwwww..",
        "...wccccccccckcccccw....",
        "....wcccccgggcccccw.....",
        ".....wccccgrgccccw......",
        "......wcccgggcccw.......",
        ".......wcccccccw........",
        "........wcccccw.........",
        ".........wcccw..........",
        "..........www...........",
        "...........w............",
        "...........w............",
        "...........w............",
        "...........w............",
        "...........w............",
        "...........w............",
        ".........wwwww..........",
        ".......wwwwwwwww........",
        "........................",
        "........................",
        "........................",
      ],
      { w: "#d8e4ee", c: "#bfe3f5", g: "#6fa83a", r: "#e24b4b", k: "#8a5a2e" }
    ),
  },
  {
    key: "tophat",
    name: "Top hat and monocle",
    svg: pix(
      [
        "........................",
        "........................",
        "........................",
        "......kkkkkkkkkkkk......",
        "......khkkkkkkkkkk......",
        "......khkkkkkkkkkk......",
        "......khkkkkkkkkkk......",
        "......khkkkkkkkkkk......",
        "......khkkkkkkkkkk......",
        "......rrrrrrrrrrrr......",
        "......rrrrrrrrrrrr......",
        "...kkkkkkkkkkkkkkkkkk...",
        "..kkkkkkkkkkkkkkkkkkkk..",
        "........................",
        "...........ggggg........",
        "..........g.....g.......",
        ".........g.lllll.g......",
        ".........g.lwlll.g......",
        ".........g.lllll.g......",
        "..........g.....g.......",
        "...........ggggg........",
        "................g.......",
        ".................g......",
        "..................g.....",
      ],
      {
        k: "#1b1d22",
        h: "#3a3f48",
        r: "#a8323e",
        g: "#f0c14a",
        l: "#cfe6f2",
        w: "#ffffff",
      }
    ),
  },
  {
    key: "bowtie",
    name: "Bow tie",
    svg: pix(
      [
        "........................",
        "........................",
        "........................",
        "........................",
        "........................",
        "........................",
        "..rr................rr..",
        "..rrrr............rrrr..",
        "..rRrrrr........rrrrRr..",
        "..rRRrrrrr....rrrrrRRr..",
        "..rRRRrrrrrkkrrrrrRRRr..",
        "..rRRRrrrrkkkkrrrrRRRr..",
        "..rRRRrrrrkkkkrrrrRRRr..",
        "..rRRrrrrrrkkrrrrrrRRr..",
        "..rRrrrrr......rrrrrRr..",
        "..rrrrr..........rrrrr..",
        "..rrr..............rrr..",
        "..r..................r..",
        "........................",
        "........................",
        "........................",
        "........................",
        "........................",
        "........................",
      ],
      { r: "#c22a3a", R: "#8a1a28", k: "#5e0f1a" }
    ),
  },
  {
    key: "steak",
    name: "Steak",
    svg: pix(
      [
        "........................",
        "........................",
        "........................",
        "........................",
        ".......ffffffff.........",
        ".....ffmmmmmmmmff.......",
        "....fmmmmmmmmmmmmf......",
        "...fmmkmmmkmmmkmmmf.....",
        "...fmmmkmmmkmmmkmmmf....",
        "..fmmmmmkmmmkmmmkmmf....",
        "..fmmkmmmkmmmkmmmkmmf...",
        "..fbbbbbbbbbbmmkmmmmf...",
        "..fmmmmbbmmkmmmkmmmmmf..",
        "..fmmkmbbmmmkmmmkmmmmf..",
        "...fmmmbbmmmmkmmmkmmmf..",
        "...fmmmbbmkmmmkmmmkmf...",
        "....fmmbbmmkmmmkmmmmf...",
        ".....ffmmmmmmmmmmmff....",
        ".......ffffffffffff.....",
        "........................",
        "........................",
        "........................",
        "........................",
        "........................",
      ],
      { f: "#f2e3c6", m: "#b04a33", k: "#5e2015", b: "#efe6d6" }
    ),
  },
];

// The machine on the start card, before the year begins. The fan steps and the
// status light goes from amber to green.
export const START_GPU = pix(
  [
    "........................ ........................",
    "......bbbbbbbbbbbb...... ......bbbbbbbbbbbb......",
    "......bhhhhhhhhhhb...... ......bhhhhhhhhhhb......",
    "......bggggggggggb...... ......bggggggggggb......",
    "......bkkkcccckkkb...... ......bkkkcccckkkb......",
    "......bkkckkkkckkb...... ......bkkcfkkfckkb......",
    "......bkkckffkckkb...... ......bkkcffkfckkb......",
    "......bkkcffffckkb...... ......bkkckkkkckkb......",
    "......bkkckffkckkb...... ......bkkcffkfckkb......",
    "......bkkckkkkckkb...... ......bkkcfkkfckkb......",
    "......bkkkcccckkkb...... ......bkkkcccckkkb......",
    "......bhkkkkkkkkhb...... ......bhkkkkkkkkhb......",
    "......bhcckcckcchb...... ......bhcckcckcchb......",
    "......bhmmkmmkmmhb...... ......bhmmkmmkmmhb......",
    "......bhkkkkkkkkhb...... ......bhkkkkkkkkhb......",
    "......bhkkaakkkkhb...... ......bhkkvvkkkkhb......",
    "......bhkkaakkkkhb...... ......bhkkvvkkkkhb......",
    "......bbbbbbbbbbbb...... ......bbbbbbbbbbbb......",
    "........................ ........................",
    "........................ ........................",
    ".......pp.pp.pp.pp...... .......pp.pp.pp.pp......",
    ".......pp.pp.pp.pp...... .......pp.pp.pp.pp......",
    "........................ ........................",
    "........................ ........................",
  ],
  {
    b: "#3b4656",
    h: "#9aabbc",
    k: "#243040",
    c: "#8a96a3",
    f: "#e8eef4",
    m: "#5b6674",
    a: "#ffb347",
    v: "#3ddc84",
    g: "#76b900",
    p: "#e8c56b",
  }
);

// Game over. The keyboard cracks down the middle, snaps in two with keys flying,
// and stays broken on the floor. Plays once from the moment it is inserted.
export const BROKEN_KEYBOARD = pix(
  [
    "........................ ........................ ........................",
    "........................ .......kk............... ........................",
    "........................ .......dd......kk....... ........................",
    "........................ ...........kk..dd....... ........................",
    "............y........... ...........dd........... ........................",
    "...........yyy.......... .............y.......... ........................",
    "........y...y...y....... ...........y............ ........................",
    "........................ ............y........... ........................",
    "........................ cccccccccc....cccccccccc ........................",
    "..ccccccccccrccccccccc.. ckkckkckk....ckkckkcgggc ........................",
    "..ckkckkckkrkkckkcgggc.. cddcddcddc....ddcddcGGGc ........................",
    "..cddcddcddcrdcddcGGGc.. cckkckkck....kckkckkckkc ........................",
    "..cckkckkckrckkckkckkc.. ccddcddcdd....cddcddcddc ........................",
    "..ccddcddcddrddcddcddc.. ckkckkckk....kkkkckkckkc cccccccccc....cccccccccc",
    "..ckkckkckkrkkkckkckkc.. cddcddcddd....dddcddcddc ckkckkckk....ckkckkcgggc",
    "..cddcddcdddrddcddcddc.. ccccccccc....ccccccccccc cddcddcddc....ddcddcGGGc",
    "..cccccccccrcccccccccc.. ........................ cckkckkck....kckkckkckkc",
    "........................ ........................ ccddcddcdd....cddcddcddc",
    "........................ ........................ ckkckkckk....kkkkckkckkc",
    "........................ ........................ cddcddcddd....dddcddcddc",
    "........................ ........................ ccccccccc..kkccccccccccc",
    "........................ ........................ ...........dd...........",
    "........................ ........................ ......kk........kk......",
    "........................ ........................ ......dd........dd......",
  ],
  {
    c: "#3b4656",
    k: "#c5ced8",
    d: "#8a96a3",
    g: "#76b900",
    G: "#4f7a00",
    y: "#f0c14a",
    r: "#1b2128",
  },
  [0, 0, 1, 1, 2, 2],
  [],
  true
);
