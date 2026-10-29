// Turns the Playwright videos of the demo scenarios into MP4 and GIF files with ffmpeg (D-0000-13), and joins the
// two pages of the race into one side-by-side video with each side captioned "Customer A" or "Customer B".
// Usage: node scripts/e2e-media.mjs <evidence dir>   (the folder that holds video/*.webm)
// ffmpeg must be on the PATH. The captions are drawn by Chromium, because ffmpeg builds often lack drawtext.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const dir = process.argv[2];
if (!dir) {
  console.error("Usage: node scripts/e2e-media.mjs <evidence dir>");
  process.exit(1);
}
const videos = join(dir, "video");

function ffmpeg(args) {
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args], {
    stdio: "inherit",
  });
}

/** MP4 (H.264, even size) and a GIF at most 960 wide, 8 frames a second. */
function toMp4AndGif(input, name) {
  const mp4 = join(videos, `${name}.mp4`);
  ffmpeg([
    "-i",
    input,
    "-vf",
    "pad=ceil(iw/2)*2:ceil(ih/2)*2",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    mp4,
  ]);
  gif(mp4, name);
}

function gif(mp4, name) {
  ffmpeg([
    "-i",
    mp4,
    "-vf",
    "fps=8,scale='min(960,iw)':-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse",
    join(videos, `${name}.gif`),
  ]);
}

const startOf = (name) => {
  const file = join(videos, `${name}.start.json`);
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")).seconds : 0;
};

async function captions(widths) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const width of widths) {
    for (const who of ["A", "B"]) {
      await page.setViewportSize({ width, height: 56 });
      await page.setContent(
        `<body style="margin:0;background:#111827;color:#fff;font:600 24px/56px system-ui,sans-serif;text-align:center">Customer ${who}</body>`,
      );
      await page.screenshot({
        path: join(videos, `caption-${width}-${who}.png`),
      });
    }
  }
  await browser.close();
}

const files = readdirSync(videos);
const raceWidths = [
  ...new Set(
    files
      .map((f) => /^race-(\d+)-a\.webm$/.exec(f)?.[1])
      .filter(Boolean)
      .map(Number),
  ),
];
await captions(raceWidths);

for (const width of raceWidths) {
  const a = `race-${width}-a`;
  const b = `race-${width}-b`;
  const mp4 = join(videos, `race-side-by-side-${width}.mp4`);
  ffmpeg([
    "-ss",
    String(startOf(a)),
    "-i",
    join(videos, `${a}.webm`),
    "-ss",
    String(startOf(b)),
    "-i",
    join(videos, `${b}.webm`),
    "-i",
    join(videos, `caption-${width}-A.png`),
    "-i",
    join(videos, `caption-${width}-B.png`),
    "-filter_complex",
    "[2:v][0:v]vstack[l];[3:v][1:v]vstack[r];[l][r]hstack=shortest=1,pad=ceil(iw/2)*2:ceil(ih/2)*2[v]",
    "-map",
    "[v]",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    mp4,
  ]);
  gif(mp4, `race-side-by-side-${width}`);
  for (const f of [
    `${a}.webm`,
    `${b}.webm`,
    `${a}.start.json`,
    `${b}.start.json`,
    `caption-${width}-A.png`,
    `caption-${width}-B.png`,
  ])
    rmSync(join(videos, f), { force: true });
}

for (const file of readdirSync(videos)) {
  if (!file.endsWith(".webm")) continue;
  const name = file.slice(0, -".webm".length);
  toMp4AndGif(join(videos, file), name);
  rmSync(join(videos, file));
  rmSync(join(videos, `${name}.start.json`), { force: true });
}
console.log(`Videos written to ${videos}`);
