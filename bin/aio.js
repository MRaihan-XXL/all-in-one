#!/usr/bin/env node
// aio — all-in-one: auto-connect your AI agents to repos, tools, skills & sites
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { banner, getVersion } from '../src/banner.js';
import { COMMANDS, FLAGS, SHORT_FLAGS } from '../src/completion.js';
import { msg } from '../src/messages.js';

const binPath = fileURLToPath(import.meta.url);

const HELP_EN = `
  AIO — all-in-one
  auto-connect every AI agent to repos, tools, skills & websites — 100% LIVE

  Usage
    aio                          Wire up every detected agent (default: setup).
                                 Shows the plan first — interactive → asks [y/N],
                                 non-TTY → plan only; use --yes to write silent.
    aio preview                  Show the exact block that would be written
                                 (plan-only, nothing is written)
    aio init [--copilot]         Project scope: inject the block into ./AGENTS.md
                                 (official standard — Zed/Copilot/Cursor read it);
                                 --copilot also writes .github/copilot-instructions.md
                                 (official Copilot repo mechanism, pointer only).
                                 Same gate: TTY → plan + y/N, non-TTY → plan; --yes writes
    aio status                   Read-only health report (manifest, agents)
    aio ask "<what you need>"    LIVE search across GitHub (630M+ repos, public
                                 skills), npm (3M+ pkgs) + crates — adaptive
                                 sources, every hit prints link + function,
                                 ranked by keyword + popularity, then discarded
                                 (no search storage — results never saved)
    aio agent "<your task>"      AGENTIC COORDINATOR — runs EVERY lane in parallel
                                 (GitHub repos ∥ skills ∥ npm ∥ crates ∥ WEB:
                                 wikipedia+hacker news ∥ LOCAL TOOLS on your PATH),
                                 then synthesizes an ordered route: what to read,
                                 run, clone or install first. --json →
                                 {schemaVersion:1, plan, route, hits, stored:0}
    aio borrow "<keywords>"      Live GitHub search for what you need cloned
      aio borrow --get <owner/repo>   shallow-clone to temp (24h TTL, then purged);
                                      accepts a full https://github.com/... URL too
      aio borrow --list | --clean     inspect / wipe temp clones
    aio skill add <owner/repo|url> [--file <path|dir>] [--name <n>] [--dry-run]
                                 Install a public SKILL.md into ~/.agents/skills
                                 (shared by 40+ agents; ledgered for rollback)
      aio skill list | remove <name>  inspect / remove installed skills (only
                                 byte-identical aio installs are ever removed)
      aio skill search "<query>" [--add]  live skill search — prints ranked hits
                                 with ready-to-run install commands; --add
                                 installs the top hit directly
    aio completion <shell>       Print shell completion script (bash|zsh|fish|pwsh)
    aio doctor [--check|--fix]   Self-diagnosis; --fix = safe auto-repair,
                                 --check = CI gate (exit 1 on issues)
    aio verify                   Self-upgrade pipeline: setup → doctor → tests
                                 (never commits)
    aio update [--check]         Update from npm, then re-run setup;
                                  --check = report only (exit 1 = update available)
    aio rollback                 Strip injected blocks, recorded MCP entries +
                                  aio-installed skills (byte-identical only)
                                  (surgical; backups kept)


  Quick chooser
    find a repo / package / tool  aio ask "<what you need>"   (search, rank, discard)
    do a multi-step task          aio agent "<your task>"     (all lanes, ordered route)
    want the code locally         aio borrow --get <owner/repo>
    install a reusable skill      aio skill search "<query>" --add
    check this machine            aio status · aio doctor --check
    check for a newer release     aio update --check          (exit 1 = update available)
    upgrade self, run all gates   aio verify                  (setup -> doctor -> tests)

  Options
    --yes                        Apply the setup plan without prompting
                                  (required for non-interactive writes)
    --dry-run                    setup: print exactly what would change,
                                  write nothing (diff-first review)
    --show-block                 With the plan, print the exact block content
                                  (also what aio preview shows)
    --file <path|dir>            skill add: install from a local SKILL.md or dir
    --name <name>                skill add: override the installed skill name
    --json                       Machine-readable output (ask / agent / borrow /
                                 doctor / skill search)
    -h, --help                   This help
    -v, --version                Version

  Environment
    AIO_OFFLINE=1, AIO_NO_GH=1, AIO_STATE_DIR, GH_TOKEN, OLLAMA_HOST,
    AIO_OLLAMA_MODEL, AIO_NO_AI=1, AIO_RATE=<calls/min|0> (GitHub search
    budget; 0 disables spacing), AIO_QUIET=1 / AIO_NO_BANNER=1 (no banner),
    AIO_LANG=id (help text in Bahasa Indonesia), NO_COLOR=1

  Note
    aioc is an alias of the same binary — Adobe's App Builder CLI (@adobe/aio)
    also owns the name aio on PATH; use aioc when both are installed.

  What it does
    1. Scans installed agents (opencode, claude, kimi, jcode, …).
    2. Generates a slim context manifest (aio-context.md): pointer + detected
       agents — rules live in the block; catalog data stays LIVE, never stored.
    3. Injects a marker-delimited auto-use block into each agent's instruction
       file — idempotent, always exactly one copy.
    4. Teaches every agent the prompt flow:
       prompt → aio ask (live) → use ephemerally → report → clean.

  Disclosure (injected rule — first line of replies that used aio-surfaced entries):
    [aio] Using [<name>](<url>) (<type>) — <function>
    <type> = repo | cli | service | skill | site
`;

// 10-b: help text in Bahasa Indonesia when AIO_LANG=id — structure mirrors
// HELP_EN line-for-line so the two cannot drift apart in behavior; commands,
// flags and env var names stay English (copy-paste must keep working).
const HELP_ID = `
  AIO — all-in-one
  autokoneksikan setiap AI agent ke repositori, tool, skill & situs — 100% LIVE

  Penggunaan
    aio                          Aktifkan semua agent yang terdeteksi (default: setup).
                                 Rencana ditampilkan dulu — interaktif → tanya [y/N],
                                 non-TTY → hanya rencana; pakai --yes untuk menulis sunyi.
    aio preview                  Tampilkan blok persis yang akan ditulis
                                 (hanya rencana, tidak ada yang ditulis)
    aio init [--copilot]         Cakupan proyek: suntik blok ke ./AGENTS.md
                                 (standar resmi — Zed/Copilot/Cursor membacanya);
                                 --copilot juga menulis .github/copilot-instructions.md
                                 (mekanisme resmi repo Copilot, hanya pointer).
                                 Gerbang sama: TTY → rencana + y/N, non-TTY → rencana; --yes menulis
    aio status                   Laporan kesehatan read-only (manifest, agent)
    aio ask "<apa yang kamu butuh>"  Pencarian LIVE di GitHub (630M+ repo, skill publik),
                                 npm (3M+ paket) + crates — sumber adaptif, setiap
                                 hasil mencetak link + fungsi, diurutkan kata kunci +
                                 popularitas, lalu dibuang (tanpa penyimpanan pencarian
                                 — hasil tidak pernah disimpan)
    aio agent "<tugas kamu>"     KOORDINATOR AGENTIK — jalankan SEMUA lane paralel
                                 (GitHub repos ∥ skills ∥ npm ∥ crates ∥ WEB:
                                 wikipedia+hacker news ∥ TOOL LOKAL di PATH kamu),
                                 lalu sintesis rute berurutan: baca, jalankan,
                                 clone atau install apa duluan. --json →
                                 {schemaVersion:1, plan, route, hits, stored:0}
    aio borrow "<kata kunci>"    Pencarian LIVE GitHub untuk yang ingin kamu clone
      aio borrow --get <owner/repo>   shallow-clone ke temp (TTL 24 jam, lalu dibuang);
                                      URL lengkap https://github.com/... juga diterima
      aio borrow --list | --clean     inspeksi / hapus clone temp
    aio skill add <owner/repo|url> [--file <path|dir>] [--name <n>] [--dry-run]
                                 Install SKILL.md publik ke ~/.agents/skills
                                 (dipakai 40+ agent; dicatat untuk rollback)
      aio skill list | remove <name>  inspeksi / hapus skill terpasang (hanya
                                 instalasi aio yang byte-identikal yang dihapus)
      aio skill search "<query>" [--add]  pencarian skill LIVE — mencetak hasil
                                 berperingkat dengan perintah install siap pakai;
                                 --add langsung install hasil teratas
    aio completion <shell>       Cetak skrip completion shell (bash|zsh|fish|pwsh)
    aio doctor [--check|--fix]   Diagnosis diri; --fix = perbaikan-otomatis aman,
                                 --check = gerbang CI (exit 1 bila ada masalah)
    aio verify                   Pipeline upgrade-diri: setup → doctor → test
                                 (tidak pernah commit)
    aio update [--check]         Update dari npm, lalu jalankan setup ulang;
                                  --check = laporan saja (exit 1 = ada update)
    aio rollback                 Lepas blok yang disuntik, entri MCP tercatat +
                                 skill yang diinstal aio (hanya byte-identikal)
                                 (bedah; backup tetap disimpan)


  Pilih cepat
    cari repo / paket / tool      aio ask "<apa yang kamu butuh>"   (cari, ranking, buang)
    tugas multi-langkah           aio agent "<tugas kamu>"          (semua lane, rute berurutan)
    butuh kodenya lokal           aio borrow --get <owner/repo>
    pasang skill reusable         aio skill search "<query>" --add
    cek mesin ini                 aio status · aio doctor --check
    cek rilis lebih baru          aio update --check                (exit 1 = ada update)
    upgrade diri + semua gerbang  aio verify                        (setup -> doctor -> test)

  Opsi
    --yes                        Terapkan rencana setup tanpa prompt
                                  (wajib untuk penulisan non-interaktif)
    --dry-run                    setup: cetak persis apa yang akan berubah,
                                  tidak menulis apa pun (tinjau diff dulu)
    --show-block                 Sama dengan rencana, cetak isi blok persis
                                  (juga yang ditampilkan aio preview)
    --file <path|dir>            skill add: instal dari SKILL.md/direktori lokal
    --name <name>                skill add: timpa nama skill yang terpasang
    --json                       Output mesin-baca (ask / agent / borrow /
                                  doctor / skill search)
    -h, --help                   Bantuan ini
    -v, --version                Versi

  Lingkungan
    AIO_OFFLINE=1, AIO_NO_GH=1, AIO_STATE_DIR, GH_TOKEN, OLLAMA_HOST,
    AIO_OLLAMA_MODEL, AIO_NO_AI=1, AIO_RATE=<panggilan/menit|0> (anggaran
    pencarian GitHub; 0 menonaktifkan jeda), AIO_QUIET=1 / AIO_NO_BANNER=1
    (tanpa banner), AIO_LANG=id (teks bantuan Bahasa Indonesia), NO_COLOR=1

  Catatan
    aioc adalah alias dari binari yang sama — Adobe's App Builder CLI (@adobe/aio)
    juga memakai nama aio di PATH; pakai aioc bila keduanya terinstal.

  Cara kerja
    1. Memindai agent terpasang (opencode, claude, kimi, jcode, …).
    2. Membuat manifest konteks slim (aio-context.md): pointer + agent terdeteksi
       — aturan hidup di blok; data katalog tetap LIVE, tidak pernah disimpan.
    3. Menyuntik blok auto-use berbatas-marker ke file instruksi tiap agent —
       idempoten, selalu tepat satu salinan.
    4. Mengajarkan setiap agent alur prompt:
       prompt → aio ask (live) → pakai sementara → laporkan → bersihkan.

  Disclosure (aturan disuntik — baris pertama balasan yang memakai entri dari aio):
    [aio] Using [<name>](<url>) (<type>) — <function>
    <type> = repo | cli | service | skill | site
`;

const HELP = process.env.AIO_LANG === 'id' ? HELP_ID : HELP_EN;

function parseArgs(argv) {
  const opts = { command: 'setup', query: '', flags: {} };
  const rest = [];
  // value-flags: [flag key, usage hint] — 5h errors when the value is missing
  const VALUE_FLAGS = { '--get': ['get', '<owner/repo>'], '--file': ['file', '<path>'], '--name': ['name', '<name>'], '--sha256': ['sha256', '<hex>'] };
  // boolean flags (their long form only); --help/--version are NOT flags here —
  // they resolve as commands through `rest` below.
  const BOOL_FLAGS = {
    '--json': 'json',
    '--clean': 'clean',
    '--list': 'list',
    '--check': 'check',
    '--fix': 'fix',
    '--dry-run': 'dry',
    '--yes': 'yes',
    '--show-block': 'showBlock', // 6b: output-only — preview stays reserved for `aio preview`
    '--copilot': 'copilot',
    '--add': 'add', // skill search: install the top hit
  };
  const KNOWN_KEYS = new Set([...Object.keys(VALUE_FLAGS), ...Object.keys(BOOL_FLAGS), '--help', '--version']);
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    let inline; // --flag=value form (5d): split once on '='; the space form still works
    if (a.startsWith('--') && a.includes('=')) {
      const eq = a.indexOf('=');
      const key = a.slice(0, eq);
      if (KNOWN_KEYS.has(key)) {
        inline = a.slice(eq + 1);
        a = key;
      }
    }
    if (a in VALUE_FLAGS) {
      const [flag, hint] = VALUE_FLAGS[a];
      const val = inline !== undefined ? inline : argv[++i] ?? null;
      // value missing, empty, or the "value" is really the next flag → clear error
      if (val === null || val === '' || (inline === undefined && String(val).startsWith('-'))) {
        console.error(msg('cmdRequires', { a, hint }));
        process.exit(1);
      }
      opts.flags[flag] = val;
    } else if (a in BOOL_FLAGS) {
      opts.flags[BOOL_FLAGS[a]] =
        inline === undefined ? true : !['false', '0'].includes(String(inline).toLowerCase());
    } else rest.push(a);
  }
  const cmd = rest[0];
  opts.query = rest.slice(1).join(' ');
  // preview/help/version resolve FIRST: COMMANDS also lists them, but they carry
  // their own mapping (preview → setup + plan-only).
  if (cmd === 'preview') {
    opts.command = 'setup'; // same path as default — preview forces plan-only
    opts.flags.preview = true;
  } else if (cmd === 'help' || cmd === '--help' || cmd === '-h') opts.command = 'help';
  else if (cmd === '--version' || cmd === '-v' || cmd === 'version') opts.command = 'version';
  else if (cmd !== undefined && COMMANDS.includes(cmd)) opts.command = cmd; // single source: completion.js (7d)
  else if (cmd !== undefined) {
    // 5f: name the bad command FIRST and point at help — never dump the full HELP
    console.error(msg('unknownCommand', { cmd }));
    console.error(`run 'aio --help' for usage`);
    process.exit(1);
  }
  return opts;
}

// Launch styles disagree on argv layout: `node bin/aio.js <args>` carries the
// script path at [1]; a bun --compile binary carries its VIRTUAL main-module
// path at [1]; only after that come the real args.
// Detect the script token instead of assuming an index — a fixed slice(2)
// silently drops the FIRST argument of a binary (`aio.exe --yes` → no --yes).
// POSIX npm/npx invoke through a SYMLINK (node_modules/.bin/aio): argv[1] is
// the symlink path and node does NOT realpath it — resolve before matching,
// or every Linux/macOS npm/npx launch dies as `unknown command: /usr/local/bin/aio`.
// bun's virtual path differs per platform (release smoke caught this):
//   windows: B:/~BUN/root/<outfile>    posix: /$bunfs/root/<outfile>
const BUN_VIRTUAL = (p) => p.includes('~BUN/root/') || p.includes('/$bunfs/root/');
const rawArgs = process.argv.slice(1);
let scriptTok = rawArgs[0] || '';
// /i: win32 filesystems are case-insensitive — node will happily LOAD bin\AIO.JS,
// so the match must accept it too (realpath does not re-case on win32).
if (scriptTok && !/(^|[/\\])aio\.js$/i.test(scriptTok) && !BUN_VIRTUAL(scriptTok)) {
  try {
    scriptTok = fs.realpathSync(scriptTok);
  } catch { /* not a filesystem path (flag/bare word) — leave untouched */ }
}
const invokedAsScript =
  scriptTok && (/(^|[/\\])aio\.js$/i.test(scriptTok) || BUN_VIRTUAL(scriptTok));
const opts = parseArgs(invokedAsScript ? rawArgs.slice(1) : rawArgs);
// --copilot only has meaning for `aio init` — never silently swallow it elsewhere (N2)
if (opts.flags.copilot && opts.command !== 'init') {
  console.error(msg('copilotOnlyInit'));
}
// --dry-run is only honored by setup/init/skill — warn elsewhere; REFUSE on the destructive
// command so the flag can never be mistaken for a shield that doesn't exist (F3)
if (opts.flags.dry && opts.command !== 'setup' && opts.command !== 'init' && opts.command !== 'help' && opts.command !== 'skill') {
  if (opts.command === 'rollback') {
    console.error(msg('rollbackNoDryRun'));
    process.exit(1);
  }
  console.error(msg('dryRunOnlySetupInit'));
}
// 5e: most commands don't accept --help — show HELP instead of swallowing it
// silently. Token identity matters: `aio ask "node --help"` carries the flag
// INSIDE one argv element (a quoted query), not as its own token.
const argvTokens = invokedAsScript ? rawArgs.slice(1) : rawArgs;
if (opts.command !== 'help' && opts.command !== 'version' && argvTokens.some((t) => t === '--help' || t === '-h')) {
  console.log(HELP);
  process.exit(0);
}
// unknown flags must never be silently dropped (F8); `ask` exempt — its query may look
// like a flag, and `borrow` too: every non-flag token is a query keyword (its real
// flags are parsed in parseArgs above)
const KNOWN_FLAGS = new Set([...FLAGS, ...SHORT_FLAGS]); // one source: completion.js (7d)
if (opts.command !== 'ask' && opts.command !== 'agent' && opts.command !== 'help' && opts.command !== 'version' && opts.command !== 'borrow') {
  for (const tok of opts.query.split(/\s+/).filter(Boolean)) {
    if (tok.startsWith('--') && !KNOWN_FLAGS.has(tok.split('=')[0])) console.error(msg('unknownFlag', { tok }));
  }
}

switch (opts.command) {
  case 'help':
    console.log(HELP);
    process.exit(0);
  case 'version':
    console.log(`aio ${getVersion()} — all-in-one (https://github.com/MRaihan-XXL/all-in-one)`);
    process.exit(0);
  case 'update': {
    console.log(banner());
    try {
      const { runUpdate } = await import('../src/update.js');
      runUpdate({ binPath, check: opts.flags.check });
    } catch (e) {
      console.error(msg('cmdFailed', { cmd: 'update', err: e.message }));
      process.exitCode = 1;
    }
    break;
  }
  case 'status': {
    try {
      const { runStatus } = await import('../src/status.js');
      const r = runStatus();
      // exitCode, not process.exit: stdout may be a pipe — let it drain first (5b)
      process.exitCode = r.ok ? 0 : 1;
    } catch (e) {
      console.error(msg('cmdFailed', { cmd: 'status', err: e.message }));
      process.exitCode = 1;
    }
    break;
  }
  case 'rollback': {
    console.log(banner());
    try {
      const { runRollback } = await import('../src/rollback.js');
      process.exitCode = runRollback() ? 0 : 1; // 5g: a rollback that kept rows behind fails
    } catch (e) {
      console.error(msg('cmdFailed', { cmd: 'rollback', err: e.message }));
      process.exitCode = 1;
    }
    break;
  }
  case 'ask': {
    try {
      const { runAsk } = await import('../src/search.js');
      const r = await runAsk({ query: opts.query, json: opts.flags.json });
      console.log(r.text);
      process.exitCode = r.ok ? 0 : 1;
    } catch (e) {
      console.error(msg('cmdFailed', { cmd: 'ask', err: e.message }));
      process.exitCode = 1;
    }
    break;
  }
  case 'agent': {
    try {
      const { runAgent } = await import('../src/agent.js');
      const r = await runAgent({ query: opts.query, json: opts.flags.json });
      console.log(r.text);
      process.exitCode = r.ok ? 0 : 1;
    } catch (e) {
      console.error(msg('cmdFailed', { cmd: 'agent', err: e.message }));
      process.exitCode = 1;
    }
    break;
  }
  case 'borrow': {
    try {
      const { runBorrow } = await import('../src/borrow.js');
      const r = await runBorrow({
        query: opts.query,
        get: opts.flags.get,
        clean: opts.flags.clean,
        list: opts.flags.list,
        json: opts.flags.json,
      });
      console.log(r.text);
      process.exitCode = r.ok ? 0 : 1;
    } catch (e) {
      console.error(msg('cmdFailed', { cmd: 'borrow', err: e.message }));
      process.exitCode = 1;
    }
    break;
  }
  case 'skill': {
    try {
      const { skillAdd, skillList, skillRemove } = await import('../src/skill.js');
      const words = opts.query.trim().split(/\s+/).filter(Boolean);
      const action = words[0];
      const target = words.slice(1).join(' ');
      let r;
      if (action === 'list') r = skillList();
      else if (action === 'remove') r = skillRemove({ target });
      else if (action === 'search') {
        const { skillSearch } = await import('../src/skill.js');
        r = await skillSearch({ query: target, add: !!opts.flags.add, json: opts.flags.json });
      } else if (action === 'add' || action === undefined) {
        r = await skillAdd({ target, file: opts.flags.file, name: opts.flags.name, dry: !!opts.flags.dry, sha256: opts.flags.sha256 });
      } else r = { ok: false, text: msg('skillUnknownSub', { action }) };
      console.log(r.text);
      process.exitCode = r.ok ? 0 : 1;
    } catch (e) {
      console.error(msg('cmdFailed', { cmd: 'skill', err: e.message }));
      process.exitCode = 1;
    }
    break;
  }
  case 'completion': {
    try {
      const { completion } = await import('../src/completion.js');
      const r = completion(opts.query.trim().split(/\s+/)[0] || '');
      console.log(r.text);
      process.exitCode = r.ok ? 0 : 1;
    } catch (e) {
      console.error(msg('cmdFailed', { cmd: 'completion', err: e.message }));
      process.exitCode = 1;
    }
    break;
  }
  case 'doctor': {
    try {
      const { runDoctor } = await import('../src/doctor.js');
      const r = await runDoctor({ check: opts.flags.check, fix: opts.flags.fix, json: opts.flags.json });
      console.log(r.text);
      process.exitCode = r.exit;
    } catch (e) {
      console.error(msg('cmdFailed', { cmd: 'doctor', err: e.message }));
      process.exitCode = 1;
    }
    break;
  }
  case 'verify':
  case 'evolve': {
    if (opts.command === 'evolve') console.error(msg('evolveDeprecated'));
    try {
      const { runVerify } = await import('../src/verify.js');
      const r = await runVerify();
      console.log(r.text);
      process.exitCode = r.exit;
    } catch (e) {
      console.error(msg('cmdFailed', { cmd: 'verify', err: e.message }));
      process.exitCode = 1;
    }
    break;
  }
  case 'init': {
    console.log(banner());
    // imports INSIDE the try: a corrupt/partial install must surface as
    // cmdFailed + exit 1, never a bare top-level-await rejection (C-06).
    try {
      const { gatedRun } = await import('../src/consent.js');
      const { runInit } = await import('../src/init.js');
      await gatedRun({
        dry: !!opts.flags.dry,
        yes: !!opts.flags.yes,
        preview: false,
        showPlan: () => runInit({ dryRun: true, copilot: !!opts.flags.copilot }),
        apply: () => runInit({ dryRun: false, copilot: !!opts.flags.copilot }),
      });
    } catch (e) {
      console.error(msg('cmdFailed', { cmd: 'init', err: e.message }));
      process.exitCode = 1;
    }
    break;
  }
  default: {
    console.log(banner());
    // same contract as `init`: module-load failure → cmdFailed, not a raw throw (C-06).
    try {
      const { runSetup } = await import('../src/setup.js');
      const { gatedRun } = await import('../src/consent.js');
      const showBlock = !!opts.flags.showBlock;
      // 6b: --show-block only ADDS output — it never downgrades --yes to plan-only.
      // Only `aio preview` (flags.preview) and --dry-run force the plan.
      await gatedRun({
        dry: !!opts.flags.dry,
        yes: !!opts.flags.yes,
        preview: !!opts.flags.preview,
        showPlan: (p) => runSetup({ dryRun: true, showBlock: p || showBlock }),
        apply: () => runSetup({ dryRun: false, showBlock }),
      });
    } catch (e) {
      console.error(msg('cmdFailed', { cmd: 'setup', err: e.message }));
      if (e.stack) console.error(e.stack.split('\n').slice(1, 4).join('\n'));
      process.exitCode = 1;
    }
  }
}
