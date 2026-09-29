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

**231 / 231 repositories captured** (2026-09-29). Files live in
`screenshots/repo-*.png` — that directory is **git-ignored** (local evidence
only; screenshots are neither committed nor shipped in the npm package).
Older ad-hoc captures (`gh-*.png`, `02a-*.png`, …) are kept alongside as
historical artifacts.

## Index

All 231 homepage screenshots (sorted by folder name):

| # | Repository | URL | Local path | Size |
|---|---|---|---|---|
| 1 | ab-download-manager | https://github.com/amir1376/ab-download-manager | `D:\Tools\github\ab-download-manager` | 47 KB |
| 2 | activepieces | https://github.com/activepieces/activepieces | `D:\Tools\github\activepieces` | 54 KB |
| 3 | actual | https://github.com/actualbudget/actual | `D:\Tools\github\actual` | 42 KB |
| 4 | addyosmani-agent-skills | https://github.com/addyosmani/agent-skills | `D:\Tools\github\addyosmani-agent-skills` | 36 KB |
| 5 | agency-agents | https://github.com/msitarzewski/agency-agents | `D:\Tools\github\agency-agents` | 41 KB |
| 6 | agent-native | https://github.com/BuilderIO/agent-native | `D:\Tools\github\agent-native` | 80 KB |
| 7 | agent-skills | https://github.com/vercel-labs/agent-skills | `D:\Tools\github\agent-skills` | 41 KB |
| 8 | ai-job-search | https://github.com/MadsLorentzen/ai-job-search | `D:\Tools\github\ai-job-search` | 45 KB |
| 9 | ai-memory | https://github.com/akitaonrails/ai-memory | `D:\Tools\github\ai-memory` | 34 KB |
| 10 | aider | https://github.com/Aider-AI/aider | `D:\Tools\github\aider` | 38 KB |
| 11 | anti-slop | https://github.com/miqdadbadjuber/anti-slop | `D:\Tools\github\anti-slop` | 38 KB |
| 12 | anything-llm | https://github.com/Mintplex-Labs/anything-llm | `D:\Tools\github\anything-llm` | 61 KB |
| 13 | AppFlowy | https://github.com/AppFlowy-IO/AppFlowy | `D:\Tools\github\AppFlowy` | 49 KB |
| 14 | apple-design-skill | https://github.com/dickwu/apple-design-skill | `D:\Tools\github\apple-design-skill` | 51 KB |
| 15 | appwrite | https://github.com/appwrite/appwrite | `D:\Tools\github\appwrite` | 54 KB |
| 16 | audiblez | https://github.com/santinic/audiblez | `D:\Tools\github\audiblez` | 77 KB |
| 17 | Auto-Company | https://github.com/MaxMiksa/Auto-Company | `D:\Tools\github\Auto-Company` | 53 KB |
| 18 | auto-editor | https://github.com/WyattBlue/auto-editor | `D:\Tools\github\auto-editor` | 75 KB |
| 19 | autoclip | https://github.com/zhouxiaoka/autoclip | `D:\Tools\github\autoclip` | 61 KB |
| 20 | automatisch | https://github.com/automatisch/automatisch | `D:\Tools\github\automatisch` | 54 KB |
| 21 | awesome-free-apps | https://github.com/Axorax/awesome-free-apps | `D:\Tools\github\awesome-free-apps` | 41 KB |
| 22 | awesome-quant | https://github.com/wilsonfreitas/awesome-quant | `D:\Tools\github\awesome-quant` | 55 KB |
| 23 | awesome-selfhosted | https://github.com/awesome-selfhosted/awesome-selfhosted | `D:\Tools\github\awesome-selfhosted` | 33 KB |
| 24 | bandwhich | https://github.com/imsnif/bandwhich | `D:\Tools\github\bandwhich` | 38 KB |
| 25 | bat | https://github.com/sharkdp/bat | `D:\Tools\github\bat` | 43 KB |
| 26 | beszel | https://github.com/henrygd/beszel | `D:\Tools\github\beszel` | 43 KB |
| 27 | BillionMail | https://github.com/Billionmail/BillionMail | `D:\Tools\github\BillionMail` | 39 KB |
| 28 | binance-trading-bot | https://github.com/chrisleekr/binance-trading-bot | `D:\Tools\github\binance-trading-bot` | 52 KB |
| 29 | book-to-skill | https://github.com/virgiliojr94/book-to-skill | `D:\Tools\github\book-to-skill` | 46 KB |
| 30 | botdirectory.ai | https://github.com/elie222/botdirectory.ai | `D:\Tools\github\botdirectory.ai` | 38 KB |
| 31 | brave-browser | https://github.com/brave/brave-browser | `D:\Tools\github\brave-browser` | 36 KB |
| 32 | brightbean-studio | https://github.com/brightbeanxyz/brightbean-studio | `D:\Tools\github\brightbean-studio` | 48 KB |
| 33 | browser-use | https://github.com/browser-use/browser-use | `D:\Tools\github\browser-use` | 63 KB |
| 34 | caddy | https://github.com/caddyserver/caddy | `D:\Tools\github\caddy` | 41 KB |
| 35 | caveman | https://github.com/JuliusBrussee/caveman | `D:\Tools\github\caveman` | 45 KB |
| 36 | changedetection.io | https://github.com/dgtlmoon/changedetection.io | `D:\Tools\github\changedetection.io` | 46 KB |
| 37 | chunkr | https://github.com/lumina-ai-inc/chunkr | `D:\Tools\github\chunkr` | 80 KB |
| 38 | claude-watch | https://github.com/taoufik123-collab/claude-watch | `D:\Tools\github\claude-watch` | 40 KB |
| 39 | cline | https://github.com/cline/cline | `D:\Tools\github\cline` | 78 KB |
| 40 | cloudberry | https://github.com/apache/cloudberry | `D:\Tools\github\cloudberry` | 41 KB |
| 41 | cmdk | https://github.com/dip/cmdk | `D:\Tools\github\cmdk` | 86 KB |
| 42 | cocos-engine | https://github.com/cocos/cocos-engine | `D:\Tools\github\cocos-engine` | 40 KB |
| 43 | code-server | https://github.com/coder/code-server | `D:\Tools\github\code-server` | 38 KB |
| 44 | codegraph | https://github.com/colbymchenry/codegraph | `D:\Tools\github\codegraph` | 83 KB |
| 45 | coder | https://github.com/coder/coder | `D:\Tools\github\coder` | 39 KB |
| 46 | coolify | https://github.com/coollabsio/coolify | `D:\Tools\github\coolify` | 48 KB |
| 47 | core | https://github.com/home-assistant/core | `D:\Tools\github\core` | 39 KB |
| 48 | crawl4ai | https://github.com/unclecode/crawl4ai | `D:\Tools\github\crawl4ai` | 63 KB |
| 49 | crawlee | https://github.com/apify/crawlee | `D:\Tools\github\crawlee` | 62 KB |
| 50 | crewAI | https://github.com/crewAIInc/crewAI | `D:\Tools\github\crewAI` | 61 KB |
| 51 | cryptpad | https://github.com/cryptpad/cryptpad | `D:\Tools\github\cryptpad` | 39 KB |
| 52 | crystal | https://github.com/stravu/crystal | `D:\Tools\github\crystal` | 46 KB |
| 53 | cua | https://github.com/trycua/cua | `D:\Tools\github\cua` | 43 KB |
| 54 | d3 | https://github.com/d3/d3 | `D:\Tools\github\d3` | 82 KB |
| 55 | DeepDiagram | https://github.com/LingyiChen-AI/DeepDiagram | `D:\Tools\github\DeepDiagram` | 54 KB |
| 56 | dittofeed | https://github.com/dittofeed/dittofeed | `D:\Tools\github\dittofeed` | 43 KB |
| 57 | dnd-kit | https://github.com/clauderic/dnd-kit | `D:\Tools\github\dnd-kit` | 64 KB |
| 58 | docker | https://github.com/calcom/docker | `D:\Tools\github\docker` | 78 KB |
| 59 | dockge | https://github.com/louislam/dockge | `D:\Tools\github\dockge` | 41 KB |
| 60 | dokploy | https://github.com/Dokploy/dokploy | `D:\Tools\github\dokploy` | 41 KB |
| 61 | dozzle | https://github.com/amir20/dozzle | `D:\Tools\github\dozzle` | 54 KB |
| 62 | dspy | https://github.com/stanfordnlp/dspy | `D:\Tools\github\dspy` | 41 KB |
| 63 | ECC | https://github.com/affaan-m/ECC | `D:\Tools\github\ECC` | 39 KB |
| 64 | echarts | https://github.com/apache/echarts | `D:\Tools\github\echarts` | 39 KB |
| 65 | eclaire | https://github.com/eclaire-labs/eclaire | `D:\Tools\github\eclaire` | 61 KB |
| 66 | erpnext | https://github.com/frappe/erpnext | `D:\Tools\github\erpnext` | 42 KB |
| 67 | ESP32-BlueJammer | https://github.com/EmenstaNougat/ESP32-BlueJammer | `D:\Tools\github\ESP32-BlueJammer` | 402 KB |
| 68 | excalidraw | https://github.com/excalidraw/excalidraw | `D:\Tools\github\excalidraw` | 39 KB |
| 69 | ezbookkeeping | https://github.com/mayswind/ezbookkeeping | `D:\Tools\github\ezbookkeeping` | 41 KB |
| 70 | feynman | https://github.com/Companion-Inc/feynman | `D:\Tools\github\feynman` | 35 KB |
| 71 | figranium | https://github.com/figranium/figranium | `D:\Tools\github\figranium` | 51 KB |
| 72 | filebrowser | https://github.com/filebrowser/filebrowser | `D:\Tools\github\filebrowser` | 40 KB |
| 73 | firecrawl | https://github.com/firecrawl/firecrawl | `D:\Tools\github\firecrawl` | 61 KB |
| 74 | firefly-iii | https://github.com/firefly-iii/firefly-iii | `D:\Tools\github\firefly-iii` | 53 KB |
| 75 | formbricks | https://github.com/formbricks/formbricks | `D:\Tools\github\formbricks` | 40 KB |
| 76 | free-llm-api-resources | https://github.com/jtig37/free-llm-api-resources | `D:\Tools\github\free-llm-api-resources` | 33 KB |
| 77 | FXGL | https://github.com/AlmasB/FXGL | `D:\Tools\github\FXGL` | 42 KB |
| 78 | fzf | https://github.com/junegunn/fzf | `D:\Tools\github\fzf` | 43 KB |
| 79 | GeminiWatermarkTool | https://github.com/allenk/GeminiWatermarkTool | `D:\Tools\github\GeminiWatermarkTool` | 38 KB |
| 80 | godui | https://github.com/LucasBassetti/godui | `D:\Tools\github\godui` | 65 KB |
| 81 | goose | https://github.com/block/goose | `D:\Tools\github\goose` | 75 KB |
| 82 | Graft | https://github.com/trailhq/Graft | `D:\Tools\github\Graft` | 46 KB |
| 83 | graphify | https://github.com/Graphify-Labs/graphify | `D:\Tools\github\graphify` | 45 KB |
| 84 | h4cker | https://github.com/The-Art-of-Hacking/h4cker | `D:\Tools\github\h4cker` | 59 KB |
| 85 | headroom | https://github.com/headroomlabs-ai/headroom | `D:\Tools\github\headroom` | 63 KB |
| 86 | herdr | https://github.com/herdrdev/herdr | `D:\Tools\github\herdr` | 59 KB |
| 87 | Hexabot | https://github.com/hexabot-ai/Hexabot | `D:\Tools\github\Hexabot` | 51 KB |
| 88 | homepage | https://github.com/gethomepage/homepage | `D:\Tools\github\homepage` | 39 KB |
| 89 | html-anything | https://github.com/nexu-io/html-anything | `D:\Tools\github\html-anything` | 65 KB |
| 90 | Hunyuan3D-WorldClaw | https://github.com/Tencent-Hunyuan/Hunyuan3D-WorldClaw | `D:\Tools\github\Hunyuan3D-WorldClaw` | 400 KB |
| 91 | i-have-adhd | https://github.com/ayghri/i-have-adhd | `D:\Tools\github\i-have-adhd` | 42 KB |
| 92 | immich | https://github.com/immich-app/immich | `D:\Tools\github\immich` | 47 KB |
| 93 | impeccable | https://github.com/pbakaus/impeccable | `D:\Tools\github\impeccable` | 35 KB |
| 94 | infisical | https://github.com/Infisical/infisical | `D:\Tools\github\infisical` | 53 KB |
| 95 | input-otp | https://github.com/guilhermerodz/input-otp | `D:\Tools\github\input-otp` | 88 KB |
| 96 | jellyfin | https://github.com/jellyfin/jellyfin | `D:\Tools\github\jellyfin` | 45 KB |
| 97 | jev-ultrafast | https://github.com/browser-use/jev-ultrafast | `D:\Tools\github\jev-ultrafast` | 51 KB |
| 98 | jitsi-meet | https://github.com/jitsi/jitsi-meet | `D:\Tools\github\jitsi-meet` | 43 KB |
| 99 | joplin | https://github.com/laurent22/joplin | `D:\Tools\github\joplin` | 47 KB |
| 100 | jumpserver | https://github.com/jumpserver/jumpserver | `D:\Tools\github\jumpserver` | 52 KB |
| 101 | kanata | https://github.com/jtroo/kanata | `D:\Tools\github\kanata` | 37 KB |
| 102 | lago | https://github.com/getlago/lago | `D:\Tools\github\lago` | 43 KB |
| 103 | lazygit | https://github.com/jesseduffield/lazygit | `D:\Tools\github\lazygit` | 41 KB |
| 104 | lenis | https://github.com/darkroomengineering/lenis | `D:\Tools\github\lenis` | 59 KB |
| 105 | LibreChat | https://github.com/LibreChat-AI/LibreChat | `D:\Tools\github\LibreChat` | 64 KB |
| 106 | libsql | https://github.com/tursodatabase/libsql | `D:\Tools\github\libsql` | 37 KB |
| 107 | linkwarden | https://github.com/linkwarden/linkwarden | `D:\Tools\github\linkwarden` | 54 KB |
| 108 | listmonk | https://github.com/knadh/listmonk | `D:\Tools\github\listmonk` | 40 KB |
| 109 | litellm | https://github.com/BerriAI/litellm | `D:\Tools\github\litellm` | 63 KB |
| 110 | liveline | https://github.com/benjitaylor/liveline | `D:\Tools\github\liveline` | 50 KB |
| 111 | lnav | https://github.com/tstack/lnav | `D:\Tools\github\lnav` | 38 KB |
| 112 | localsend | https://github.com/localsend/localsend | `D:\Tools\github\localsend` | 43 KB |
| 113 | markdoc | https://github.com/markdoc/markdoc | `D:\Tools\github\markdoc` | 38 KB |
| 114 | markitdown | https://github.com/microsoft/markitdown | `D:\Tools\github\markitdown` | 64 KB |
| 115 | Matt_Pocock_Skills | https://github.com/aurorasoft2/Matt_Pocock_Skills | `D:\Tools\github\Matt_Pocock_Skills` | 122 KB |
| 116 | mattpocock-skills | https://github.com/mattpocock/skills | `D:\Tools\github\mattpocock-skills` | 35 KB |
| 117 | maxun | https://github.com/getmaxun/maxun | `D:\Tools\github\maxun` | 48 KB |
| 118 | memex | https://github.com/memex-lab/memex | `D:\Tools\github\memex` | 60 KB |
| 119 | metube | https://github.com/alexta69/metube | `D:\Tools\github\metube` | 37 KB |
| 120 | mineflayer | https://github.com/PrismarineJS/mineflayer | `D:\Tools\github\mineflayer` | 38 KB |
| 121 | mixpost | https://github.com/inovector/mixpost | `D:\Tools\github\mixpost` | 46 KB |
| 122 | motion | https://github.com/motiondivision/motion | `D:\Tools\github\motion` | 57 KB |
| 123 | Motrix | https://github.com/agalwood/Motrix | `D:\Tools\github\Motrix` | 43 KB |
| 124 | mvt | https://github.com/mvt-project/mvt | `D:\Tools\github\mvt` | 39 KB |
| 125 | n8n | https://github.com/n8n-io/n8n | `D:\Tools\github\n8n` | 48 KB |
| 126 | nanobot | https://github.com/HKUDS/nanobot | `D:\Tools\github\nanobot` | 43 KB |
| 127 | no-ai-slop | https://github.com/petergyang/no-ai-slop | `D:\Tools\github\no-ai-slop` | 40 KB |
| 128 | nocodb | https://github.com/nocodb/nocodb | `D:\Tools\github\nocodb` | 48 KB |
| 129 | notifuse | https://github.com/Notifuse/notifuse | `D:\Tools\github\notifuse` | 43 KB |
| 130 | number-flow | https://github.com/barvian/number-flow | `D:\Tools\github\number-flow` | 61 KB |
| 131 | obsidian-releases | https://github.com/obsidianmd/obsidian-releases | `D:\Tools\github\obsidian-releases` | 81 KB |
| 132 | OCRmyPDF | https://github.com/ocrmypdf/OCRmyPDF | `D:\Tools\github\OCRmyPDF` | 38 KB |
| 133 | oh-my-pi | https://github.com/can1357/oh-my-pi | `D:\Tools\github\oh-my-pi` | 84 KB |
| 134 | OmniRoute | https://github.com/diegosouzapw/OmniRoute | `D:\Tools\github\OmniRoute` | 51 KB |
| 135 | open-design | https://github.com/nexu-io/open-design | `D:\Tools\github\open-design` | 45 KB |
| 136 | Open-Generative-AI | https://github.com/Anil-matcha/Open-Generative-AI | `D:\Tools\github\Open-Generative-AI` | 48 KB |
| 137 | open-notebook | https://github.com/lfnovo/open-notebook | `D:\Tools\github\open-notebook` | 43 KB |
| 138 | open-saas | https://github.com/wasp-lang/open-saas | `D:\Tools\github\open-saas` | 44 KB |
| 139 | open-seo | https://github.com/every-app/open-seo | `D:\Tools\github\open-seo` | 43 KB |
| 140 | openanalytics | https://github.com/OpenLabs-so/openanalytics | `D:\Tools\github\openanalytics` | 60 KB |
| 141 | openbao | https://github.com/openbao/openbao | `D:\Tools\github\openbao` | 72 KB |
| 142 | OpenChatCut | https://github.com/0xsline/OpenChatCut | `D:\Tools\github\OpenChatCut` | 45 KB |
| 143 | OpenCut | https://github.com/OpenCut-app/OpenCut | `D:\Tools\github\OpenCut` | 37 KB |
| 144 | OpenHands | https://github.com/All-Hands-AI/OpenHands | `D:\Tools\github\OpenHands` | 83 KB |
| 145 | openhuman | https://github.com/tinyhumansai/openhuman | `D:\Tools\github\openhuman` | 45 KB |
| 146 | OpenMontage | https://github.com/calesthio/OpenMontage | `D:\Tools\github\OpenMontage` | 57 KB |
| 147 | OpenOutreach | https://github.com/eracle/OpenOutreach | `D:\Tools\github\OpenOutreach` | 42 KB |
| 148 | openpanel | https://github.com/Openpanel-dev/openpanel | `D:\Tools\github\openpanel` | 38 KB |
| 149 | openreply | https://github.com/diwenne/openreply | `D:\Tools\github\openreply` | 39 KB |
| 150 | openship | https://github.com/oblien/openship | `D:\Tools\github\openship` | 38 KB |
| 151 | OpenStock | https://github.com/Open-Dev-Society/OpenStock | `D:\Tools\github\OpenStock` | 40 KB |
| 152 | openui | https://github.com/wandb/openui | `D:\Tools\github\openui` | 36 KB |
| 153 | OpenWA | https://github.com/rmyndharis/OpenWA | `D:\Tools\github\OpenWA` | 40 KB |
| 154 | openwhispr | https://github.com/OpenWhispr/openwhispr | `D:\Tools\github\openwhispr` | 47 KB |
| 155 | Osintgram | https://github.com/Datalux/Osintgram | `D:\Tools\github\Osintgram` | 40 KB |
| 156 | outline | https://github.com/outline/outline | `D:\Tools\github\outline` | 38 KB |
| 157 | OxCode | https://github.com/daviluzsk/OxCode | `D:\Tools\github\OxCode` | 57 KB |
| 158 | pdfcn | https://github.com/shadcn-labs/pdfcn | `D:\Tools\github\pdfcn` | 41 KB |
| 159 | penpot | https://github.com/penpot/penpot | `D:\Tools\github\penpot` | 43 KB |
| 160 | pi-hole | https://github.com/pi-hole/pi-hole | `D:\Tools\github\pi-hole` | 40 KB |
| 161 | pipecat | https://github.com/pipecat-ai/pipecat | `D:\Tools\github\pipecat` | 76 KB |
| 162 | plane | https://github.com/makeplane/plane | `D:\Tools\github\plane` | 44 KB |
| 163 | plasmic | https://github.com/plasmicapp/plasmic | `D:\Tools\github\plasmic` | 45 KB |
| 164 | pocketbase | https://github.com/pocketbase/pocketbase | `D:\Tools\github\pocketbase` | 37 KB |
| 165 | polar | https://github.com/polarsource/polar | `D:\Tools\github\polar` | 40 KB |
| 166 | polycss | https://github.com/layoutit/polycss | `D:\Tools\github\polycss` | 37 KB |
| 167 | postiz-app | https://github.com/gitroomhq/postiz-app | `D:\Tools\github\postiz-app` | 48 KB |
| 168 | project-nomad | https://github.com/Crosstalk-Solutions/project-nomad | `D:\Tools\github\project-nomad` | 75 KB |
| 169 | prompts.chat | https://github.com/f/prompts.chat | `D:\Tools\github\prompts.chat` | 42 KB |
| 170 | pyvideotrans | https://github.com/jianchang512/pyvideotrans | `D:\Tools\github\pyvideotrans` | 60 KB |
| 171 | quickLiquid | https://github.com/amarnath3003/quickLiquid | `D:\Tools\github\quickLiquid` | 114 KB |
| 172 | radix-primitives | https://github.com/radix-ui/primitives | `D:\Tools\github\radix-primitives` | 71 KB |
| 173 | react-virtuoso | https://github.com/petyosi/react-virtuoso | `D:\Tools\github\react-virtuoso` | 61 KB |
| 174 | react-vis | https://github.com/uber/react-vis | `D:\Tools\github\react-vis` | 56 KB |
| 175 | reflex | https://github.com/reflex-dev/reflex | `D:\Tools\github\reflex` | 41 KB |
| 176 | relaticle | https://github.com/relaticle/relaticle | `D:\Tools\github\relaticle` | 61 KB |
| 177 | rembg | https://github.com/danielgatis/rembg | `D:\Tools\github\rembg` | 37 KB |
| 178 | restic | https://github.com/restic/restic | `D:\Tools\github\restic` | 37 KB |
| 179 | ripgrep | https://github.com/BurntSushi/ripgrep | `D:\Tools\github\ripgrep` | 43 KB |
| 180 | robin | https://github.com/apurvsinghgautam/robin | `D:\Tools\github\robin` | 36 KB |
| 181 | rtk | https://github.com/rtk-ai/rtk | `D:\Tools\github\rtk` | 60 KB |
| 182 | Scrapling | https://github.com/D4Vinci/Scrapling | `D:\Tools\github\Scrapling` | 60 KB |
| 183 | scrapy | https://github.com/scrapy/scrapy | `D:\Tools\github\scrapy` | 63 KB |
| 184 | screenize | https://github.com/syi0808/screenize | `D:\Tools\github\screenize` | 36 KB |
| 185 | searxng | https://github.com/searxng/searxng | `D:\Tools\github\searxng` | 41 KB |
| 186 | Seelen-UI | https://github.com/eythaann/Seelen-UI | `D:\Tools\github\Seelen-UI` | 41 KB |
| 187 | send-instances | https://github.com/timvisee/send-instances | `D:\Tools\github\send-instances` | 40 KB |
| 188 | server | https://github.com/nextcloud/server | `D:\Tools\github\server` | 42 KB |
| 189 | sherlock | https://github.com/sherlock-project/sherlock | `D:\Tools\github\sherlock` | 42 KB |
| 190 | shoutrrr | https://github.com/coollabsio/shoutrrr | `D:\Tools\github\shoutrrr` | 40 KB |
| 191 | skills | https://github.com/emilkowalski/skills | `D:\Tools\github\skills` | 61 KB |
| 192 | skyvern | https://github.com/Skyvern-AI/skyvern | `D:\Tools\github\skyvern` | 41 KB |
| 193 | Snapzy | https://github.com/duongductrong/Snapzy | `D:\Tools\github\Snapzy` | 45 KB |
| 194 | sonner | https://github.com/emilkowalski/sonner | `D:\Tools\github\sonner` | 61 KB |
| 195 | spacedrive | https://github.com/spacedriveapp/spacedrive | `D:\Tools\github\spacedrive` | 39 KB |
| 196 | SpeakoFlow | https://github.com/AbhishekBarali/SpeakoFlow | `D:\Tools\github\SpeakoFlow` | 42 KB |
| 197 | spiderfoot | https://github.com/smicallef/spiderfoot | `D:\Tools\github\spiderfoot` | 42 KB |
| 198 | spleeter | https://github.com/deezer/spleeter | `D:\Tools\github\spleeter` | 39 KB |
| 199 | sqlmap | https://github.com/sqlmapproject/sqlmap | `D:\Tools\github\sqlmap` | 56 KB |
| 200 | starship | https://github.com/starship/starship | `D:\Tools\github\starship` | 41 KB |
| 201 | Stirling-PDF | https://github.com/Stirling-Tools/Stirling-PDF | `D:\Tools\github\Stirling-PDF` | 44 KB |
| 202 | strix | https://github.com/usestrix/strix | `D:\Tools\github\strix` | 48 KB |
| 203 | superdesign-skill | https://github.com/superdesigndev/superdesign-skill | `D:\Tools\github\superdesign-skill` | 41 KB |
| 204 | superplane | https://github.com/superplanehq/superplane | `D:\Tools\github\superplane` | 43 KB |
| 205 | sure | https://github.com/we-promise/sure | `D:\Tools\github\sure` | 35 KB |
| 206 | syncthing | https://github.com/syncthing/syncthing | `D:\Tools\github\syncthing` | 42 KB |
| 207 | system-design-101 | https://github.com/ByteByteGoHq/system-design-101 | `D:\Tools\github\system-design-101` | 196 KB |
| 208 | taste-skill | https://github.com/Leonxlnx/taste-skill | `D:\Tools\github\taste-skill` | 111 KB |
| 209 | three.js | https://github.com/mrdoob/three.js | `D:\Tools\github\three.js` | 38 KB |
| 210 | tldraw | https://github.com/tldraw/tldraw | `D:\Tools\github\tldraw` | 54 KB |
| 211 | tolaria | https://github.com/refactoringhq/tolaria | `D:\Tools\github\tolaria` | 35 KB |
| 212 | TradeNote | https://github.com/Eleven-Trading/TradeNote | `D:\Tools\github\TradeNote` | 38 KB |
| 213 | Translumo | https://github.com/ramjke/Translumo | `D:\Tools\github\Translumo` | 59 KB |
| 214 | TREK | https://github.com/liketrek/TREK | `D:\Tools\github\TREK` | 43 KB |
| 215 | trigger.dev | https://github.com/triggerdotdev/trigger.dev | `D:\Tools\github\trigger.dev` | 41 KB |
| 216 | ui | https://github.com/shadcn-ui/ui | `D:\Tools\github\ui` | 59 KB |
| 217 | ui-craft | https://github.com/educlopez/ui-craft | `D:\Tools\github\ui-craft` | 38 KB |
| 218 | ui-ux-pro-max-skill | https://github.com/nextlevelbuilder/ui-ux-pro-max-skill | `D:\Tools\github\ui-ux-pro-max-skill` | 41 KB |
| 219 | umami | https://github.com/umami-software/umami | `D:\Tools\github\umami` | 45 KB |
| 220 | upscayl | https://github.com/upscayl/upscayl | `D:\Tools\github\upscayl` | 39 KB |
| 221 | ux-ui-agent-skills | https://github.com/plugin87/ux-ui-agent-skills | `D:\Tools\github\ux-ui-agent-skills` | 41 KB |
| 222 | vaultwarden | https://github.com/dani-garcia/vaultwarden | `D:\Tools\github\vaultwarden` | 43 KB |
| 223 | wacrm | https://github.com/ArnasDon/wacrm | `D:\Tools\github\wacrm` | 46 KB |
| 224 | watchtower | https://github.com/containrrr/watchtower | `D:\Tools\github\watchtower` | 42 KB |
| 225 | wealthfolio | https://github.com/wealthfolio/wealthfolio | `D:\Tools\github\wealthfolio` | 38 KB |
| 226 | webstudio | https://github.com/webstudio-is/webstudio | `D:\Tools\github\webstudio` | 47 KB |
| 227 | whisper | https://github.com/openai/whisper | `D:\Tools\github\whisper` | 34 KB |
| 228 | xbmc | https://github.com/xbmc/xbmc | `D:\Tools\github\xbmc` | 54 KB |
| 229 | yazi | https://github.com/sxyazi/yazi | `D:\Tools\github\yazi` | 46 KB |
| 230 | zennotes | https://github.com/ZenNotes/zennotes | `D:\Tools\github\zennotes` | 44 KB |
| 231 | zoxide | https://github.com/ajeetdsouza/zoxide | `D:\Tools\github\zoxide` | 45 KB |
