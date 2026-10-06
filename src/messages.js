// messages.js — AIO_LANG=id user-facing message catalog: every [aio] error,
// usage and note string lives here in BOTH languages. English strings are
// byte-identical to the pre-i18n originals (the default locale — tests and
// existing scripts see no change); AIO_LANG=id selects Bahasa Indonesia.
// Test parity: EN and ID must carry the same keys and the same {placeholders}.
const EN = {
  /* ---- usage ---- */
  usageAsk: 'usage: aio ask "<what you need>"\nexample: aio ask "csv ke chart interaktif"',
  usageAgent: 'usage: aio agent "<your task>"\nexample: aio agent "convert csv to interactive chart and publish"',
  usageSkillSearch: 'usage: aio skill search "<query>" [--add]\nexample: aio skill search "pdf word convert"',
  usageSkillAdd:
    'usage: aio skill add <owner/repo | url> [--file <path|dir>] [--name <name>] [--sha256 <hex>]\n' +
    '       aio skill list  ·  aio skill remove <name>\n' +
    'example: aio skill add anthropics/skills --name pdf-tools',
  usageSkillRemove: '[aio] skill: missing name — usage: aio skill remove <name>',
  evolveDeprecated: "[aio] 'evolve' is deprecated — use 'aio verify' (alias removed after 2 releases)",
  usageCompletion: 'usage: aio completion bash|zsh|fish|pwsh',

  /* ---- offline ---- */
  offlineSearch: '[aio] offline (AIO_OFFLINE=1) — aio keeps zero local catalog by design; live search needs network.',
  offlineAgent: '[aio] offline (AIO_OFFLINE=1) — aio keeps zero local catalog by design; live coordination needs network.',
  offlineSkillSearch: '[aio] offline (AIO_OFFLINE=1) — skill search is live by design.',

  /* ---- bin dispatch ---- */
  cmdRequires: '[aio] {a} requires {hint}',
  unknownCommand: '[aio] unknown command: {cmd}',
  copilotOnlyInit: '[aio] --copilot only applies to `aio init` — ignoring',
  rollbackNoDryRun: '[aio] rollback cannot honor --dry-run — refusing to run; inspect first with `aio doctor`',
  dryRunOnlySetupInit: '[aio] --dry-run only applies to `aio setup` / `aio init` — ignoring',
  unknownFlag: '[aio] unknown flag: {tok} — ignoring',
  cmdFailed: '[aio] {cmd} failed: {err}',
  skillUnknownSub: '[aio] skill: unknown subcommand "{action}" — use add | list | remove | search',

  /* ---- skill ---- */
  skillPathNotFound: '[aio] skill: local path not found — {p}',
  skillMdNotFound: '[aio] skill: SKILL.md not found — {src}',
  skillInsecureHttp: '[aio] skill: insecure http:// URL refused — use https://',
  skillFetchFailed: '[aio] skill: fetch failed ({err}) — check network/URL instead of "not found" for {target}.',
  skillMdMissing: '[aio] skill: SKILL.md not found for {target} (tried {n} location{s}).',
  skillStatus: '[aio] skill {name}: {status} — {file}',
  skillWouldInstall: '[aio] skill {name}: would install (dry-run) — {file} (source: {source})',
  skillShaBadFormat: '[aio] skill: --sha256 must be 64 hex characters, got: {want}',
  skillShaMismatch: '[aio] skill: sha256 mismatch - wanted {want}, fetched {got}. Refusing to install.',
  skillInstalled: '[aio] skill {name}: installed — {file}\n        source: {source} · recorded for `aio rollback`',
  skillInvalidName: '[aio] skill: invalid name',
  skillNotInstalled: '[aio] skill {name}: not installed — {file}',
  skillModified: '[aio] skill {name}: modified since aio installed it — aio will not delete your edits; remove manually: {file}',
  skillNotOurs: '[aio] skill {name}: present (not installed by aio) — skipped: {file}',
  skillMdRemoved: '[aio] skill {name}: SKILL.md removed — directory kept (not empty): {dir}',
  skillRemoved: '[aio] skill {name}: removed — {dir}',
  skillSearchNoHit: '[aio] skill search: no installable hit for "{q}"{lanes}',

  /* ---- borrow ---- */
  borrowGetFailed: '[aio] borrow --get failed: {err}',
  borrowSearchFailed: '[aio] borrow search failed: {err}',

  /* ---- update ---- */
  updateCheckFailed: '[aio] update check failed: {err}',
  updateCurrent: '[aio] update check: aio {v} is the latest release.',
  updateAvailable: '[aio] update check: aio {cur} is behind latest {latest} - run `aio update`.',
  updateUpdating: '[aio] Updating {pkg} from npm ...',
  updateFailed: '[aio] update failed: {err}',
  updateFailedCode: '[aio] update failed: npm install exited with code {code}',
  updateFreshMissing: '[aio] update: fresh install not found under npm root -g — run `aio` manually.',
  updateOldCopy: '[aio] note: you invoked the old copy (npx cache?) — use the global `aio` from now on.',
  updateRerun: '[aio] Package updated — re-running setup with the new version ...',

  /* ---- state / consent / rollback / setup ---- */
  configUnreadable: '[aio] warning: {file} is unreadable — preserved as {kept}, continuing with empty state',
  nodeVersionWarn: '[aio] warning: Node {version} detected — Node >= 22 recommended',
  consentNonInteractive: '[aio] non-interactive session — plan shown above, nothing written. Re-run with --yes to apply.',
  consentCancelled: '[aio] cancelled — no files written. Re-run with --yes to apply without prompting.',
  rollbackIncomplete: '[aio] rollback incomplete — some rows were kept behind (see above); exit 1.',
};

const ID = {
  /* ---- usage ---- */
  usageAsk: 'cara pakai: aio ask "<apa yang kamu butuhkan>"\ncontoh: aio ask "csv ke chart interaktif"',
  usageAgent: 'cara pakai: aio agent "<tugas kamu>"\ncontoh: aio agent "ubah csv jadi chart interaktif lalu terbitkan"',
  usageSkillSearch: 'cara pakai: aio skill search "<kueri>" [--add]\ncontoh: aio skill search "pdf word convert"',
  usageSkillAdd:
    'cara pakai: aio skill add <owner/repo | url> [--file <path|dir>] [--name <nama>] [--sha256 <hex>]\n' +
    '       aio skill list  ·  aio skill remove <nama>\n' +
    'contoh: aio skill add anthropics/skills --name pdf-tools',
  usageSkillRemove: '[aio] skill: nama belum diisi — cara pakai: aio skill remove <nama>',
  evolveDeprecated: "[aio] 'evolve' sudah usang — gunakan 'aio verify' (alias dihapus setelah 2 rilis)",
  usageCompletion: 'cara pakai: aio completion bash|zsh|fish|pwsh',

  /* ---- offline ---- */
  offlineSearch: '[aio] offline (AIO_OFFLINE=1) — aio sengaja tidak menyimpan katalog lokal; pencarian live butuh jaringan.',
  offlineAgent: '[aio] offline (AIO_OFFLINE=1) — aio sengaja tidak menyimpan katalog lokal; koordinasi live butuh jaringan.',
  offlineSkillSearch: '[aio] offline (AIO_OFFLINE=1) — skill search sengaja berjalan live.',

  /* ---- bin dispatch ---- */
  cmdRequires: '[aio] {a} butuh {hint}',
  unknownCommand: '[aio] perintah tidak dikenal: {cmd}',
  copilotOnlyInit: '[aio] --copilot hanya berlaku untuk `aio init` — diabaikan',
  rollbackNoDryRun: '[aio] rollback tidak mendukung --dry-run — menolak dijalankan; periksa dulu dengan `aio doctor`',
  dryRunOnlySetupInit: '[aio] --dry-run hanya berlaku untuk `aio setup` / `aio init` — diabaikan',
  unknownFlag: '[aio] flag tidak dikenal: {tok} — diabaikan',
  cmdFailed: '[aio] {cmd} gagal: {err}',
  skillUnknownSub: '[aio] skill: subperintah tidak dikenal "{action}" — gunakan add | list | remove | search',

  /* ---- skill ---- */
  skillPathNotFound: '[aio] skill: path lokal tidak ditemukan — {p}',
  skillMdNotFound: '[aio] skill: SKILL.md tidak ditemukan — {src}',
  skillInsecureHttp: '[aio] skill: URL http:// tidak aman ditolak — gunakan https://',
  skillFetchFailed: '[aio] skill: gagal mengambil ({err}) — cek jaringan/URL, bukan "tidak ditemukan", untuk {target}.',
  skillMdMissing: '[aio] skill: SKILL.md tidak ditemukan untuk {target} (dicoba {n} lokasi{s}).',
  skillStatus: '[aio] skill {name}: {status} — {file}',
  skillWouldInstall: '[aio] skill {name}: akan dipasang (dry-run) — {file} (sumber: {source})',
  skillShaBadFormat: '[aio] skill: --sha256 harus 64 karakter heksadesimal, dapat: {want}',
  skillShaMismatch: '[aio] skill: sha256 tidak cocok - diharapkan {want}, hasil {got}. Instalasi ditolak.',
  skillInstalled: '[aio] skill {name}: terpasang — {file}\n        sumber: {source} · dicatat untuk `aio rollback`',
  skillInvalidName: '[aio] skill: nama tidak valid',
  skillNotInstalled: '[aio] skill {name}: belum terpasang — {file}',
  skillModified: '[aio] skill {name}: berubah sejak dipasang aio — aio tidak akan menghapus editan kamu; hapus manual: {file}',
  skillNotOurs: '[aio] skill {name}: ada (bukan dipasang aio) — dilewati: {file}',
  skillMdRemoved: '[aio] skill {name}: SKILL.md dihapus — folder disimpan (tidak kosong): {dir}',
  skillRemoved: '[aio] skill {name}: dihapus — {dir}',
  skillSearchNoHit: '[aio] skill search: tidak ada hit yang bisa dipasang untuk "{q}"{lanes}',

  /* ---- borrow ---- */
  borrowGetFailed: '[aio] borrow --get gagal: {err}',
  borrowSearchFailed: '[aio] borrow search gagal: {err}',

  /* ---- update ---- */
  updateCheckFailed: '[aio] cek update gagal: {err}',
  updateCurrent: '[aio] cek update: aio {v} sudah rilis terbaru.',
  updateAvailable: '[aio] cek update: aio {cur} tertinggal dari {latest} - jalankan `aio update`.',
  updateUpdating: '[aio] Memperbarui {pkg} dari npm ...',
  updateFailed: '[aio] update gagal: {err}',
  updateFailedCode: '[aio] update gagal: npm install keluar dengan kode {code}',
  updateFreshMissing: '[aio] update: instalasi baru tidak ditemukan di npm root -g — jalankan `aio` manual.',
  updateOldCopy: '[aio] catatan: kamu memanggil salinan lama (cache npx?) — pakai `aio` global mulai sekarang.',
  updateRerun: '[aio] Paket diperbarui — menjalankan ulang setup dengan versi baru ...',

  /* ---- state / consent / rollback / setup ---- */
  configUnreadable: '[aio] peringatan: {file} tidak terbaca — disimpan sebagai {kept}, lanjut dengan state kosong',
  nodeVersionWarn: '[aio] peringatan: Node {version} terdeteksi — Node >= 22 disarankan',
  consentNonInteractive: '[aio] sesi non-interaktif — rencana ditampilkan di atas, tidak ada yang ditulis. Jalankan ulang dengan --yes untuk menerapkan.',
  consentCancelled: '[aio] dibatalkan — tidak ada file yang ditulis. Jalankan ulang dengan --yes tanpa konfirmasi.',
  rollbackIncomplete: '[aio] rollback tidak lengkap — sebagian baris tersisa (lihat di atas); exit 1.',
};

/** Render key with {placeholder} substitution (missing key → EN → key itself). */
export function msg(key, vars = {}) {
  const id = process.env.AIO_LANG === 'id';
  let raw = id ? (ID[key] ?? EN[key] ?? key) : (EN[key] ?? key);
  // {s} is the English plural suffix (location{s}); Indonesian nouns never take
  // it, so drop it in the id locale. Parity still requires both tables to carry
  // the same placeholder set, so the key stays checkable.
  if (id) raw = raw.replaceAll('{s}', '');
  return raw.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/** Parity report for tests: keys present in one table only + placeholder drift. */
export function parity() {
  const keys = new Set([...Object.keys(EN), ...Object.keys(ID)]);
  const missingID = [];
  const missingEN = [];
  const placeholderDrift = [];
  const ph = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
  for (const k of [...keys].sort()) {
    if (!(k in ID)) missingID.push(k);
    else if (!(k in EN)) missingEN.push(k);
    else if (ph(EN[k]) !== ph(ID[k])) placeholderDrift.push(k);
  }
  return { total: keys.size, missingID, missingEN, placeholderDrift };
}
