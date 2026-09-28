# Screenshot evidence — repository homepages

Every repository listed in the `aio` manifest has a local screenshot of its
homepage: living proof that each entry resolves to a real, reachable project —
not a placeholder row.

## Method

| | |
|---|---|
| Engine | Microsoft Edge, headless (`--headless=new`) |
| Viewport | 1280 × 1000 CSS px |
| Settle time | `--virtual-time-budget=9000` (waits out SPA hydration) |
| Source URL | the `url = …` value from each repo's own `.git/config` |
| Output | `screenshots/repo-<name>.png`, one per repository |
| Naming | exact repo folder name — matches the manifest's `Local path` column |

Regenerate everything (same command the index was built with):

```powershell
$shots = "<repo>\screenshots"; $edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
foreach ($r in Get-ChildItem "<repos-dir>" -Directory) {
  $url = (Select-String -Path "$($r.FullName)\.git\config" -Pattern 'url = (\S+)').Matches[0].Groups[1].Value -replace '\.git$',''
  & $edge --headless=new --screenshot="$shots\repo-$($r.Name).png" `
          --window-size=1280,1000 --virtual-time-budget=9000 $url
}
```

## Coverage

**97 / 97 repositories captured** (2026-09-28). Files live in
`screenshots/repo-*.png` — that directory is **git-ignored** (local evidence
only; screenshots are neither committed nor shipped in the npm package).
Older ad-hoc captures (`gh-*.png`, `02a-*.png`, …) are kept alongside as
historical artifacts.

## Index

| # | Repository | URL | Local path | Shot |
|---|---|---|---|---|
| 1 | ab-download-manager | https://github.com/amir1376/ab-download-manager | `D:\Tools\github\ab-download-manager` | 47 KB |
| 2 | actual | https://github.com/actualbudget/actual | `D:\Tools\github\actual` | 42 KB |
| 3 | agency-agents | https://github.com/msitarzewski/agency-agents | `D:\Tools\github\agency-agents` | 41 KB |
| 4 | agent-skills | https://github.com/vercel-labs/agent-skills | `D:\Tools\github\agent-skills` | 41 KB |
| 5 | ai-job-search | https://github.com/MadsLorentzen/ai-job-search | `D:\Tools\github\ai-job-search` | 45 KB |
| 6 | anything-llm | https://github.com/Mintplex-Labs/anything-llm | `D:\Tools\github\anything-llm` | 61 KB |
| 7 | AppFlowy | https://github.com/AppFlowy-IO/AppFlowy | `D:\Tools\github\AppFlowy` | 49 KB |
| 8 | bat | https://github.com/sharkdp/bat | `D:\Tools\github\bat` | 43 KB |
| 9 | book-to-skill | https://github.com/virgiliojr94/book-to-skill | `D:\Tools\github\book-to-skill` | 46 KB |
| 10 | brightbean-studio | https://github.com/brightbeanxyz/brightbean-studio | `D:\Tools\github\brightbean-studio` | 48 KB |
| 11 | browser-use | https://github.com/browser-use/browser-use | `D:\Tools\github\browser-use` | 63 KB |
| 12 | caveman | https://github.com/JuliusBrussee/caveman | `D:\Tools\github\caveman` | 45 KB |
| 13 | chunkr | https://github.com/lumina-ai-inc/chunkr | `D:\Tools\github\chunkr` | 80 KB |
| 14 | claude-watch | https://github.com/taoufik123-collab/claude-watch | `D:\Tools\github\claude-watch` | 40 KB |
| 15 | cline | https://github.com/cline/cline | `D:\Tools\github\cline` | 78 KB |
| 16 | cmdk | https://github.com/dip/cmdk | `D:\Tools\github\cmdk` | 86 KB |
| 17 | codegraph | https://github.com/colbymchenry/codegraph | `D:\Tools\github\codegraph` | 83 KB |
| 18 | coolify | https://github.com/coollabsio/coolify | `D:\Tools\github\coolify` | 48 KB |
| 19 | crawl4ai | https://github.com/unclecode/crawl4ai | `D:\Tools\github\crawl4ai` | 63 KB |
| 20 | crawlee | https://github.com/apify/crawlee | `D:\Tools\github\crawlee` | 62 KB |
| 21 | crewAI | https://github.com/crewAIInc/crewAI | `D:\Tools\github\crewAI` | 61 KB |
| 22 | crystal | https://github.com/stravu/crystal | `D:\Tools\github\crystal` | 46 KB |
| 23 | dnd-kit | https://github.com/clauderic/dnd-kit | `D:\Tools\github\dnd-kit` | 64 KB |
| 24 | eclaire | https://github.com/eclaire-labs/eclaire | `D:\Tools\github\eclaire` | 61 KB |
| 25 | firecrawl | https://github.com/firecrawl/firecrawl | `D:\Tools\github\firecrawl` | 61 KB |
| 26 | fzf | https://github.com/junegunn/fzf | `D:\Tools\github\fzf` | 43 KB |
| 27 | godui | https://github.com/LucasBassetti/godui | `D:\Tools\github\godui` | 65 KB |
| 28 | Graft | https://github.com/trailhq/Graft | `D:\Tools\github\Graft` | 46 KB |
| 29 | h4cker | https://github.com/The-Art-of-Hacking/h4cker | `D:\Tools\github\h4cker` | 59 KB |
| 30 | headroom | https://github.com/headroomlabs-ai/headroom | `D:\Tools\github\headroom` | 63 KB |
| 31 | herdr | https://github.com/herdrdev/herdr | `D:\Tools\github\herdr` | 59 KB |
| 32 | html-anything | https://github.com/nexu-io/html-anything | `D:\Tools\github\html-anything` | 65 KB |
| 33 | i-have-adhd | https://github.com/ayghri/i-have-adhd | `D:\Tools\github\i-have-adhd` | 42 KB |
| 34 | immich | https://github.com/immich-app/immich | `D:\Tools\github\immich` | 47 KB |
| 35 | input-otp | https://github.com/guilhermerodz/input-otp | `D:\Tools\github\input-otp` | 88 KB |
| 36 | jellyfin | https://github.com/jellyfin/jellyfin | `D:\Tools\github\jellyfin` | 45 KB |
| 37 | jitsi-meet | https://github.com/jitsi/jitsi-meet | `D:\Tools\github\jitsi-meet` | 43 KB |
| 38 | joplin | https://github.com/laurent22/joplin | `D:\Tools\github\joplin` | 47 KB |
| 39 | lazygit | https://github.com/jesseduffield/lazygit | `D:\Tools\github\lazygit` | 41 KB |
| 40 | lenis | https://github.com/darkroomengineering/lenis | `D:\Tools\github\lenis` | 59 KB |
| 41 | litellm | https://github.com/BerriAI/litellm | `D:\Tools\github\litellm` | 63 KB |
| 42 | liveline | https://github.com/benjitaylor/liveline | `D:\Tools\github\liveline` | 50 KB |
| 43 | localsend | https://github.com/localsend/localsend | `D:\Tools\github\localsend` | 43 KB |
| 44 | markitdown | https://github.com/microsoft/markitdown | `D:\Tools\github\markitdown` | 64 KB |
| 45 | Matt_Pocock_Skills | https://github.com/aurorasoft2/Matt_Pocock_Skills | `D:\Tools\github\Matt_Pocock_Skills` | 122 KB |
| 46 | maxun | https://github.com/getmaxun/maxun | `D:\Tools\github\maxun` | 48 KB |
| 47 | memex | https://github.com/memex-lab/memex | `D:\Tools\github\memex` | 60 KB |
| 48 | mixpost | https://github.com/inovector/mixpost | `D:\Tools\github\mixpost` | 46 KB |
| 49 | motion | https://github.com/motiondivision/motion | `D:\Tools\github\motion` | 57 KB |
| 50 | Motrix | https://github.com/agalwood/Motrix | `D:\Tools\github\Motrix` | 43 KB |
| 51 | n8n | https://github.com/n8n-io/n8n | `D:\Tools\github\n8n` | 48 KB |
| 52 | no-ai-slop | https://github.com/petergyang/no-ai-slop | `D:\Tools\github\no-ai-slop` | 40 KB |
| 53 | nocodb | https://github.com/nocodb/nocodb | `D:\Tools\github\nocodb` | 48 KB |
| 54 | number-flow | https://github.com/barvian/number-flow | `D:\Tools\github\number-flow` | 61 KB |
| 55 | obsidian-releases | https://github.com/obsidianmd/obsidian-releases | `D:\Tools\github\obsidian-releases` | 81 KB |
| 56 | oh-my-pi | https://github.com/can1357/oh-my-pi | `D:\Tools\github\oh-my-pi` | 84 KB |
| 57 | OmniRoute | https://github.com/diegosouzapw/OmniRoute | `D:\Tools\github\OmniRoute` | 51 KB |
| 58 | Open-Generative-AI | https://github.com/Anil-matcha/Open-Generative-AI | `D:\Tools\github\Open-Generative-AI` | 48 KB |
| 59 | open-notebook | https://github.com/lfnovo/open-notebook | `D:\Tools\github\open-notebook` | 43 KB |
| 60 | open-seo | https://github.com/every-app/open-seo | `D:\Tools\github\open-seo` | 43 KB |
| 61 | openanalytics | https://github.com/OpenLabs-so/openanalytics | `D:\Tools\github\openanalytics` | 60 KB |
| 62 | OpenChatCut | https://github.com/0xsline/OpenChatCut | `D:\Tools\github\OpenChatCut` | 45 KB |
| 63 | openhuman | https://github.com/tinyhumansai/openhuman | `D:\Tools\github\openhuman` | 45 KB |
| 64 | OpenMontage | https://github.com/calesthio/OpenMontage | `D:\Tools\github\OpenMontage` | 57 KB |
| 65 | openreply | https://github.com/diwenne/openreply | `D:\Tools\github\openreply` | 39 KB |
| 66 | openwhispr | https://github.com/OpenWhispr/openwhispr | `D:\Tools\github\openwhispr` | 47 KB |
| 67 | OxCode | https://github.com/daviluzsk/OxCode | `D:\Tools\github\OxCode` | 57 KB |
| 68 | penpot | https://github.com/penpot/penpot | `D:\Tools\github\penpot` | 43 KB |
| 69 | pipecat | https://github.com/pipecat-ai/pipecat | `D:\Tools\github\pipecat` | 76 KB |
| 70 | plasmic | https://github.com/plasmicapp/plasmic | `D:\Tools\github\plasmic` | 45 KB |
| 71 | postiz-app | https://github.com/gitroomhq/postiz-app | `D:\Tools\github\postiz-app` | 48 KB |
| 72 | quickLiquid | https://github.com/amarnath3003/quickLiquid | `D:\Tools\github\quickLiquid` | 114 KB |
| 73 | radix-primitives | https://github.com/radix-ui/primitives | `D:\Tools\github\radix-primitives` | 71 KB |
| 74 | react-virtuoso | https://github.com/petyosi/react-virtuoso | `D:\Tools\github\react-virtuoso` | 61 KB |
| 75 | relaticle | https://github.com/relaticle/relaticle | `D:\Tools\github\relaticle` | 61 KB |
| 76 | ripgrep | https://github.com/BurntSushi/ripgrep | `D:\Tools\github\ripgrep` | 43 KB |
| 77 | rtk | https://github.com/rtk-ai/rtk | `D:\Tools\github\rtk` | 60 KB |
| 78 | Scrapling | https://github.com/D4Vinci/Scrapling | `D:\Tools\github\Scrapling` | 60 KB |
| 79 | scrapy | https://github.com/scrapy/scrapy | `D:\Tools\github\scrapy` | 63 KB |
| 80 | shoutrrr | https://github.com/coollabsio/shoutrrr | `D:\Tools\github\shoutrrr` | 40 KB |
| 81 | skills | https://github.com/emilkowalski/skills | `D:\Tools\github\skills` | 61 KB |
| 82 | Snapzy | https://github.com/duongductrong/Snapzy | `D:\Tools\github\Snapzy` | 45 KB |
| 83 | sonner | https://github.com/emilkowalski/sonner | `D:\Tools\github\sonner` | 61 KB |
| 84 | sqlmap | https://github.com/sqlmapproject/sqlmap | `D:\Tools\github\sqlmap` | 56 KB |
| 85 | Stirling-PDF | https://github.com/Stirling-Tools/Stirling-PDF | `D:\Tools\github\Stirling-PDF` | 44 KB |
| 86 | strix | https://github.com/usestrix/strix | `D:\Tools\github\strix` | 48 KB |
| 87 | superplane | https://github.com/superplanehq/superplane | `D:\Tools\github\superplane` | 43 KB |
| 88 | syncthing | https://github.com/syncthing/syncthing | `D:\Tools\github\syncthing` | 42 KB |
| 89 | system-design-101 | https://github.com/ByteByteGoHq/system-design-101 | `D:\Tools\github\system-design-101` | 196 KB |
| 90 | ui | https://github.com/shadcn-ui/ui | `D:\Tools\github\ui` | 59 KB |
| 91 | umami | https://github.com/umami-software/umami | `D:\Tools\github\umami` | 45 KB |
| 92 | vaultwarden | https://github.com/dani-garcia/vaultwarden | `D:\Tools\github\vaultwarden` | 43 KB |
| 93 | wacrm | https://github.com/ArnasDon/wacrm | `D:\Tools\github\wacrm` | 46 KB |
| 94 | webstudio | https://github.com/webstudio-is/webstudio | `D:\Tools\github\webstudio` | 47 KB |
| 95 | yazi | https://github.com/sxyazi/yazi | `D:\Tools\github\yazi` | 46 KB |
| 96 | zennotes | https://github.com/ZenNotes/zennotes | `D:\Tools\github\zennotes` | 44 KB |
| 97 | zoxide | https://github.com/ajeetdsouza/zoxide | `D:\Tools\github\zoxide` | 45 KB |

| | |
|---|---|
| *Columns* | repository · source URL · local path · screenshot size |
| *Source of truth* | the same `.git/config` URLs the manifest uses |
