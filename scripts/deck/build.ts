/**
 * Builds the user-journey deck (docs/decks/gaff-user-journeys.pdf) from the screenshots the
 * journeys in `tests/deck` took:
 *
 *   pnpm build && pnpm deck:capture   photograph every screen (about 15 minutes)
 *   pnpm deck:build                   lay the deck out and print it to PDF
 *
 * One slide for each screen: the desktop window beside the phone, with the screen's name, who is
 * looking at it, and a line on what happens there. A screen longer than its window carries on
 * over the slides that follow. The deck is a web page first (screenshots/deck/build/deck.html),
 * printed by the same Chromium that took the pictures.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { wordmarkFullStop, wordmarkLetters, wordmarkSize } from '../../src/ui/wordmarkPaths';
import type { Actor, Entry, Journey } from '../../tests/deck/capture';
import { chapters, edits, type Chapter } from './story';

/** DECK_SHOTS and DECK_OUT point a trial build somewhere else. */
const SHOTS = process.env.DECK_SHOTS ?? join('screenshots', 'deck');
const BUILD = join(SHOTS, 'build');
const IMAGES = join(BUILD, 'img');
const OUT = process.env.DECK_OUT ?? join('docs', 'decks', 'gaff-user-journeys.pdf');

/** The slide: 16:9, in CSS pixels. */
const SLIDE = { width: 1280, height: 720 };
/** The grey panel the screens stand on. */
const PANEL = { left: 48, top: 112, width: 1184, height: 564, padding: 16 };
/** What a frame adds around its screenshot. */
const BROWSER_BAR = 20;
const BEZEL = 5;
const GAP = 40;

type Picture = { file: string; width: number; height: number; device: 'desktop' | 'phone' };

type Screen = Entry & {
  run: string;
  chapter: Chapter;
  stageIndex: number;
  /** Its number among its chapter's screens, from 1. */
  number: number;
};

type Slide =
  | { kind: 'html'; html: string; anchor?: string }
  | { kind: 'screen'; screen: Screen; pictures: Picture[]; continued: boolean };

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const ACTORS: Record<Actor, string> = {
  landlord: 'Landlord',
  renter: 'Renter',
  agent: 'Agent',
  teammate: 'Teammate',
  owner: 'Owner',
  referee: 'Referee',
  gaff: 'Gaff’s team',
};

function readRun(run: string): (Entry & { run: string })[] {
  const file = join(SHOTS, run, 'manifest.json');
  if (!existsSync(file)) throw new Error(`No screenshots for “${run}”: run pnpm deck:capture`);
  return (JSON.parse(readFileSync(file, 'utf8')) as Entry[]).map((entry) => ({ ...entry, run }));
}

/** Every chapter's screens, in the order they were met, with the edits applied. */
function screensOf(chapter: Chapter): Screen[] {
  const found = chapter.runs
    .flatMap((run) => readRun(run))
    .filter((entry) => entry.journey === chapter.journey)
    .filter((entry) => !edits.drop.includes(`${entry.run}/${entry.id}`));
  // The chapter's own order of stages first; one it doesn't name follows, as it was met.
  const met: string[] = [];
  for (const entry of found) if (!met.includes(entry.stage)) met.push(entry.stage);
  const named = Object.keys(chapter.stages).filter((stage) => met.includes(stage));
  const stages = [...named, ...met.filter((stage) => !named.includes(stage))];
  // A stage's screens stay together, even when a later run adds to it.
  const ordered = stages.flatMap((stage) => found.filter((entry) => entry.stage === stage));
  return ordered.map((entry, index) => ({
    ...entry,
    ...(edits.change[`${entry.run}/${entry.id}`] ?? {}),
    chapter,
    stageIndex: stages.indexOf(entry.stage),
    number: index + 1,
  }));
}

/** A screenshot as the deck carries it: a JPEG no bigger than the slide can show. */
async function picture(run: string, file: string, device: Picture['device']): Promise<Picture> {
  const source = join(SHOTS, run, file);
  const name = `${run}-${file.replace(/\.png$/, '.jpg')}`;
  const target = join(IMAGES, name);
  // Sharp enough to read full screen, small enough that 500 slides can be sent.
  const width = device === 'desktop' ? 1440 : 520;
  if (!existsSync(target) || statSync(target).mtimeMs < statSync(source).mtimeMs) {
    await sharp(source)
      .resize({ width, withoutEnlargement: true })
      .jpeg({ quality: 70, chromaSubsampling: '4:2:0', mozjpeg: true })
      .toFile(target);
  }
  const size = await sharp(target).metadata();
  return { file: `img/${name}`, width: size.width, height: size.height, device };
}

/** The slides one screen takes: the top of the page first, then scrolled down. */
async function slidesFor(screen: Screen): Promise<Slide[]> {
  const limit = edits.parts[`${screen.run}/${screen.id}`] ?? 3;
  const desktop = await Promise.all(
    screen.desktop.slice(0, limit).map((file) => picture(screen.run, file, 'desktop')),
  );
  const phone = await Promise.all(
    screen.phone.slice(0, limit).map((file) => picture(screen.run, file, 'phone')),
  );
  const slides: Slide[] = [
    { kind: 'screen', screen, pictures: [desktop.shift()!, phone.shift()!], continued: false },
  ];
  while (desktop.length > 0 || phone.length > 0) {
    const pictures: Picture[] = [];
    if (desktop.length > 0) {
      pictures.push(desktop.shift()!);
      if (phone.length > 0) pictures.push(phone.shift()!);
      // The last of the desktop page leaves room for one more of the phone's.
      if (desktop.length === 0 && phone.length === 1) pictures.push(phone.shift()!);
    } else {
      pictures.push(...phone.splice(0, 4));
    }
    slides.push({ kind: 'screen', screen, pictures, continued: true });
  }
  return slides;
}

/** Sizes the frames to stand side by side on the panel, as large as they fit. */
function framed(pictures: Picture[]): { picture: Picture; width: number; height: number }[] {
  const room = {
    width: PANEL.width - PANEL.padding * 2 - GAP * (pictures.length - 1),
    height: PANEL.height - PANEL.padding * 2,
  };
  // A frame's whole height is T; its screenshot is T less its bar or bezel, at its own shape.
  const around = (p: Picture) => (p.device === 'desktop' ? BROWSER_BAR : BEZEL * 2);
  const beside = (p: Picture) => (p.device === 'desktop' ? 0 : BEZEL * 2);
  const shape = (p: Picture) => p.width / p.height;
  const shapes = pictures.reduce((sum, p) => sum + shape(p), 0);
  const fixed = pictures.reduce((sum, p) => sum + beside(p) - shape(p) * around(p), 0);
  const total = Math.min(room.height, (room.width - fixed) / shapes);
  return pictures.map((p) => {
    const height = total - around(p);
    return { picture: p, width: height * shape(p), height };
  });
}

/** A screen's address as the window's bar shows it: readable, and short. */
function shownAddress(path: string): string {
  const [pathname = '', query = ''] = path.split('?');
  let readable = query;
  try {
    readable = decodeURIComponent(query);
  } catch {
    // Left as it is.
  }
  const short = readable && readable.length <= 26 && !readable.startsWith('next=');
  return `gaff.ie${pathname === '/' && !short ? '' : pathname}${short ? `?${readable}` : ''}`;
}

const wordmark = (height: number, ink = 'currentColor') =>
  `<svg class="wordmark" viewBox="0 0 ${wordmarkSize.width} ${wordmarkSize.height}" height="${height}" role="img" aria-label="Gaff"><path fill="${ink}" d="${wordmarkLetters}"/><path fill="#3a5fa8" d="${wordmarkFullStop}"/></svg>`;

function frame(
  { picture: p, width, height }: ReturnType<typeof framed>[number],
  screen: Screen,
): string {
  const image = `<img src="${p.file}" width="${width.toFixed(1)}" height="${height.toFixed(1)}" alt="">`;
  if (p.device === 'phone') return `<div class="phone">${image}</div>`;
  const where =
    screen.kind === 'email'
      ? `<span class="where mail">Email · ${escape(screen.path)}</span>`
      : `<span class="where">${escape(shownAddress(screen.path))}</span>`;
  return `<div class="browser"><div class="bar"><i></i><i></i><i></i>${where}</div>${image}</div>`;
}

function progress(screen: Screen, stages: string[]): string {
  const marks = stages
    .map((_, index) => {
      const state =
        index < screen.stageIndex ? 'done' : index === screen.stageIndex ? 'now' : 'todo';
      return `<i class="${state}"></i>`;
    })
    .join('');
  return `<div class="progress">${marks}</div>`;
}

function screenSlide(
  slide: Extract<Slide, { kind: 'screen' }>,
  stages: string[],
  count: number,
  page: number,
): string {
  const { screen, pictures, continued } = slide;
  const chips = [
    `<span class="chip ${screen.actor}">${ACTORS[screen.actor]}</span>`,
    screen.kind === 'email' ? '<span class="chip plain">Email</span>' : '',
    screen.kind === 'stand-in' ? '<span class="chip plain">Stand-in screen</span>' : '',
    continued ? '<span class="chip plain">Scrolled down</span>' : '',
  ].join('');
  const meanwhile =
    screen.meanwhile && !continued
      ? `<p class="meanwhile"><b>Meanwhile</b> ${escape(screen.meanwhile)}</p>`
      : '';
  const caption = continued ? 'Further down the same screen.' : escape(screen.caption);
  const title = continued
    ? `<p class="title">${escape(screen.title)}</p>`
    : `<h3 class="title" id="${anchorOf(screen)}">${escape(screen.title)}</h3>`;
  return `<section class="slide screen">
  <header>
    <div class="what">
      <div class="top"><p class="crumb">${escape(screen.chapter.title)} <span>›</span> ${screen.stageIndex + 1}. ${escape(screen.stage)}</p><div class="chips">${chips}</div></div>
      ${title}
    </div>
    <div class="about">${meanwhile}<p class="caption">${caption}</p></div>
  </header>
  <div class="panel">${framed(pictures)
    .map((f) => frame(f, screen))
    .join('')}</div>
  <footer>${wordmark(11)}<span class="chapter">${escape(screen.chapter.title)}</span>${progress(screen, stages)}<span class="count">Screen ${screen.number} of ${count}</span><span class="page">${page}</span></footer>
</section>`;
}

const anchorOf = (screen: Screen) => `s-${screen.run}-${screen.id}`;
const stageAnchor = (journey: Journey, index: number) => `stage-${journey}-${index}`;

const plain = (anchor: string | undefined, body: string, page: number, dark = false) =>
  `<section class="slide ${dark ? 'dark' : 'light'}"${anchor ? ` id="${anchor}"` : ''}>${body}<footer>${wordmark(11, dark ? '#ffffff' : 'currentColor')}<span class="chapter">User journeys, end to end</span><span class="grow"></span><span class="page">${page}</span></footer></section>`;

async function main(): Promise<void> {
  mkdirSync(IMAGES, { recursive: true });
  mkdirSync(join('docs', 'decks'), { recursive: true });

  // Lay the deck out twice: once to learn each slide's page, then with the pages written in.
  const books = await Promise.all(
    chapters.map(async (chapter) => {
      const screens = screensOf(chapter);
      const stages = [...new Set(screens.map((screen) => screen.stage))];
      const slides = new Map<Screen, Slide[]>();
      for (const screen of screens) slides.set(screen, await slidesFor(screen));
      return { chapter, screens, stages, slides };
    }),
  );

  const FRONT = 3; // The cover, how to read it, and the contents.
  let page = FRONT;
  const pages = new Map<string, number>();
  for (const book of books) {
    pages.set(`chapter-${book.chapter.journey}`, ++page);
    pages.set(`map-${book.chapter.journey}`, ++page);
    book.stages.forEach((stage, index) => {
      pages.set(stageAnchor(book.chapter.journey, index), ++page);
      for (const screen of book.screens.filter((s) => s.stage === stage)) {
        pages.set(anchorOf(screen), page + 1);
        page += book.slides.get(screen)!.length;
      }
    });
  }
  // The last slide says what the deck leaves out.
  const total = page + 1;
  const screenCount = books.reduce((sum, book) => sum + book.screens.length, 0);

  const html: string[] = [];
  let at = 0;
  const add = (slide: string) => {
    at += 1;
    html.push(slide);
  };

  // The cover.
  add(
    `<section class="slide dark cover">
      ${wordmark(54, '#ffffff')}
      <h1 class="plain">User journeys, end to end</h1>
      <p class="lead">Every screen of letting a home and renting one on Gaff, on desktop and on a phone.</p>
      <ol class="three">${books
        .map(
          (book) =>
            `<li><b>${escape(book.chapter.title)}</b><span>${escape(book.chapter.who)}</span><em>${book.screens.length} screens</em></li>`,
        )
        .join('')}</ol>
      <p class="made">${escape(edits.made)}</p>
    </section>`,
  );

  // How to read it.
  add(
    plain(
      undefined,
      `<div class="pad">
        <p class="eyebrow">Before you start</p>
        <h2 class="big">How to read this deck</h2>
        <div class="columns">
          <div>
            <h4>One screen, one slide</h4>
            <p>Each slide is one screen of Gaff as it stands today: the desktop window on the left, the same screen on a phone on the right. The bar on the window says where the screen is.</p>
            <p>A screen longer than its window carries on over the next slide or two, marked <span class="chip plain">Scrolled down</span>.</p>
          </div>
          <div>
            <h4>Who is looking</h4>
            <p>A chip names whose screen it is: ${(
              ['landlord', 'renter', 'agent', 'owner', 'referee', 'teammate', 'gaff'] as const
            )
              .map((actor) => `<span class="chip ${actor}">${ACTORS[actor]}</span>`)
              .join(' ')}</p>
            <p><b class="mean">Meanwhile</b> says what someone else did between two screens, so each journey reads on its own.</p>
            <p><span class="chip plain">Email</span> is a message Gaff sent, as it arrives.</p>
          </div>
          <div>
            <h4>What’s real and what isn’t</h4>
            <p>The screens are the real product, walked through by a script and photographed. Nothing is drawn or mocked up.</p>
            <p>The people, homes and agency are made up. Three things are stand-ins in this copy: the search map (Google Maps in production), the ID check (Stripe Identity in production, marked <span class="chip plain">Stand-in screen</span>) and the AI’s own words (Claude in production).</p>
            <p>To mark who came to a viewing, the script moves the viewing to “now”, so the viewing day’s screens show the hour they were photographed.</p>
          </div>
        </div>
      </div>`,
      at + 1,
    ),
  );

  // The contents.
  add(
    plain(
      undefined,
      `<div class="pad">
        <p class="eyebrow">${screenCount} screens · ${total} slides</p>
        <h2 class="big">Contents</h2>
        <div class="contents">${books
          .map(
            (book, index) => `<div>
              <a class="part" href="#chapter-${book.chapter.journey}"><b>${index + 1}. ${escape(book.chapter.title)}</b><span>${pages.get(`chapter-${book.chapter.journey}`)}</span></a>
              ${book.stages
                .map(
                  (stage, s) =>
                    `<a href="#${stageAnchor(book.chapter.journey, s)}"><span>${s + 1}. ${escape(stage)}</span><span>${pages.get(stageAnchor(book.chapter.journey, s))}</span></a>`,
                )
                .join('')}
            </div>`,
          )
          .join('')}</div>
      </div>`,
      at + 1,
    ),
  );

  for (const [index, book] of books.entries()) {
    const { chapter, screens, stages, slides } = book;
    // The chapter's cover.
    add(
      `<section class="slide dark chapter-cover" id="chapter-${chapter.journey}">
        <p class="eyebrow">Journey ${index + 1} of ${books.length}</p>
        <h1 class="plain">${escape(chapter.title)}</h1>
        <p class="lead">${escape(chapter.summary)}</p>
        <dl>${chapter.cast.map(([name, role]) => `<div><dt>${escape(name)}</dt><dd>${escape(role)}</dd></div>`).join('')}</dl>
        <footer>${wordmark(11, '#ffffff')}<span class="chapter">User journeys, end to end</span><span class="grow"></span><span class="page">${at + 1}</span></footer>
      </section>`,
    );
    // Its map: every stage, and where it starts.
    add(
      plain(
        undefined,
        `<div class="pad">
          <p class="eyebrow">${escape(chapter.title)} · ${screens.length} screens</p>
          <h2 class="big">The journey at a glance</h2>
          <div class="map ${stages.length > 12 ? 'dense' : ''}">${stages
            .map((stage, s) => {
              const inStage = screens.filter((screen) => screen.stage === stage);
              return `<a href="#${stageAnchor(chapter.journey, s)}"><i>${s + 1}</i><b>${escape(stage)}</b><span>${escape(chapter.stages[stage] ?? '')}</span><em>${inStage.length} ${inStage.length === 1 ? 'screen' : 'screens'} · page ${pages.get(stageAnchor(chapter.journey, s))}</em></a>`;
            })
            .join('')}</div>
        </div>`,
        at + 1,
      ),
    );
    for (const [s, stage] of stages.entries()) {
      const inStage = screens.filter((screen) => screen.stage === stage);
      add(
        plain(
          stageAnchor(chapter.journey, s),
          `<div class="pad divider">
            <div class="lhs">
              <p class="eyebrow">${escape(chapter.title)} · stage ${s + 1} of ${stages.length}</p>
              <h2 class="big">${escape(stage)}</h2>
              <p class="lead">${escape(chapter.stages[stage] ?? '')}</p>
            </div>
            <ol class="index ${inStage.length > 26 ? 'tiny' : inStage.length > 13 ? 'two' : ''}">${inStage
              .map(
                (screen) =>
                  `<li><a href="#${anchorOf(screen)}"><span>${escape(screen.title)}</span><i>${ACTORS[screen.actor] === ACTORS[chapter.journey] ? '' : ACTORS[screen.actor]}</i><em>${pages.get(anchorOf(screen))}</em></a></li>`,
              )
              .join('')}</ol>
          </div>`,
          at + 1,
        ),
      );
      for (const screen of inStage) {
        for (const slide of slides.get(screen)!) {
          if (slide.kind === 'screen') add(screenSlide(slide, stages, screens.length, at + 1));
        }
      }
    }
  }

  // What it leaves out.
  add(
    plain(
      undefined,
      `<div class="pad">
        <p class="eyebrow">To finish</p>
        <h2 class="big">What this deck leaves out</h2>
        <div class="columns">
          <div>
            <h4>Not on these three journeys</h4>
            <ul>${edits.leftOut.map((line) => `<li>${escape(line)}</li>`).join('')}</ul>
          </div>
          <div>
            <h4>States you only meet when something goes wrong</h4>
            <ul>${edits.states.map((line) => `<li>${escape(line)}</li>`).join('')}</ul>
          </div>
          <div>
            <h4>Making it again</h4>
            <p>The deck is made from the product itself. After a change to any screen:</p>
            <p><code>pnpm build</code><br><code>pnpm deck:capture</code><br><code>pnpm deck:build</code></p>
            <p>The journeys are in <code>tests/deck</code>, the layout in <code>scripts/deck</code>.</p>
          </div>
        </div>
      </div>`,
      at + 1,
    ),
  );

  if (at !== total) throw new Error(`Counted ${total} slides and laid out ${at}`);

  const fonts = resolve('public', 'fonts');
  const sheet = `<!doctype html><html lang="en-IE"><head><meta charset="utf-8"><title>Gaff: user journeys, end to end</title><style>
@font-face { font-family: 'DM Sans'; font-weight: 100 1000; src: url('file://${fonts}/dm-sans-latin-ext-opsz-normal.woff2') format('woff2-variations'); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }
@font-face { font-family: 'DM Sans'; font-weight: 100 1000; src: url('file://${fonts}/dm-sans-latin-opsz-normal.woff2') format('woff2-variations'); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
${readFileSync(join('scripts', 'deck', 'deck.css'), 'utf8')}
</style></head><body>${html.join('\n')}</body></html>`;
  writeFileSync(join(BUILD, 'deck.html'), sheet);

  const browser = await chromium.launch();
  const tab = await browser.newPage({ viewport: SLIDE });
  await tab.goto(`file://${resolve(BUILD, 'deck.html')}`, { waitUntil: 'load', timeout: 300_000 });
  await tab.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((image) => image.decode().catch(() => null)));
  });
  // Words that have outgrown their place on a slide are said, not printed over something else.
  const spilt = await tab.evaluate(() => {
    const found: string[] = [];
    document.querySelectorAll('.slide').forEach((slide, index) => {
      const page = slide.getBoundingClientRect();
      for (const part of ['.what', '.about', '.index', '.map', '.columns', '.contents', 'dl']) {
        const box = slide.querySelector(part)?.getBoundingClientRect();
        if (!box) continue;
        const fits =
          box.top >= page.top + 8 && box.bottom <= page.bottom - 34 && box.right <= page.right - 40;
        if (!fits) found.push(`page ${index + 1}: ${part} doesn’t fit`);
      }
    });
    return found;
  });
  for (const line of spilt) console.warn(line);
  await tab.pdf({
    path: OUT,
    width: `${SLIDE.width}px`,
    height: `${SLIDE.height}px`,
    printBackground: true,
    outline: true,
    tagged: true,
  });
  await browser.close();
  const megabytes = (statSync(OUT).size / 1_048_576).toFixed(1);
  console.log(`Deck: ${total} slides, ${screenCount} screens, ${megabytes} MB at ${OUT}`);
}

void main();
