# dsh-viscod-panel

把 Viscod（项目文件夹 → 可交互思维导图）做成 **DSH 侧边栏面板** 的插件。

打开面板后，DSH 的侧边栏里会出现一个「思维导图」标签页，正文是一块 `iframe`，直接内嵌
Viscod 的本地 Web UI；不需要手动开浏览器、也不需要记住端口。Viscod 服务没跑起来时，
插件会用项目里的 `tsx` 自动把 `server/index.ts` 拉起来，再把当前项目切到你指定的项目根目录。

- 包名：`@local/viscod-panel`（v0.1.0）
- 平台：DSH Web GUI（客户端半侧 `platform: web`）
- 依赖本机已有的 **Viscod 项目仓库**（本插件不含 Viscod 本体）

---

## 功能

| 部分 | 作用 |
| --- | --- |
| **客户端半侧**（`client.js`） | 注册侧边栏标签页类型（`kind: viscod`，标题「思维导图」），并在引导页加一个入口；标签页头部有状态点、当前项目路径、文件数、`重新扫描` / `重载` / `新窗口` 按钮。 |
| **面板主体** | `iframe` 加载 `http://127.0.0.1:<PORT>/?embed=1`（`embed=1` 是 Viscod 的精简布局）；加载失败时给出错误原因和重试按钮。 |
| **宿主半侧**（`index.js`） | 在 DSH 的 `webServer` 上挂同源接口 `/viscod/*`，负责探活、按需拉起/切换 Viscod 服务、触发重扫。 |

### 宿主接口（`/viscod/*`）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/viscod/status` | 探活并返回 `{ ok, url, project, root, files, dirs, watching, generatedAt }`。 |
| `POST` | `/viscod/ensure` | 确保 Viscod 服务在线；不在线就 `spawn <node> --import tsx server/index.ts`（cwd = 项目根），最多等约 40 秒。首次调用还会把 Viscod 的项目切到 `VISCOD_PROJECT_ROOT`。 |
| `POST` | `/viscod/rescan` | 确保服务在线后调用 Viscod 的 `POST /api/rescan` 重扫文件树。 |
| `POST` | `/viscod/client-loaded` | 客户端半侧加载时打点（只写日志，便于排查）。 |

插件加载时就会预热一次 `/viscod/ensure`；插件卸载时只关闭“由插件自己拉起”的服务进程。

---

## 前置依赖

1. **本机有 Viscod 项目仓库**（本插件不包含它）。默认按 `D:\Dev\Project4-Viscod` 找，
   请用 `VISCOD_PROJECT_ROOT` 指向你自己的仓库路径。该仓库至少需要：
   - `server/index.ts`（Viscod 服务入口）
   - `node_modules/` 里装有 `tsx`（即已经执行过 `npm install`）
   - 建议先执行过一次 `npm run build` 生成 `dist/`：没有 `dist/` 时服务能起来，但 iframe
     里只会显示「Viscod 服务已启动 / 还没有构建前端页面」的提示页。
2. **Node.js ≥ 20**（Viscod 的 `package.json` 要求）。插件会自动探测 `node`，也可以用
   `VISCOD_NODE` 显式指定（见下表）。
3. **DSH（Web GUI）**，且能编辑 DSH profile 的 `package.json`。
4. `pnpm`（安装插件用）。

---

## 安装

1. 先把本仓库放到本机某个位置（或直接 clone 到本地）：

   ```powershell
   git clone https://github.com/sprw-li/dsh-viscod-panel.git D:\plugins\dsh-viscod-panel
   ```

2. 在 **DSH profile 目录**（profile 的 `package.json` 所在目录）里把插件当本地包装上：

   ```powershell
   pnpm add link:D:\plugins\dsh-viscod-panel
   ```

3. 打开该 profile 的 `package.json`，在 `dsh.profile.bundles` 数组里追加包名
   （HMR 会重新组合插件，通常不用重启 DSH）：

   ```jsonc
   {
     "dsh": {
       "profile": {
         "bundles": [
           // …原有条目
           "@local/viscod-panel"
         ]
       }
     }
   }
   ```

4. 启动 DSH Web GUI，在侧边栏/引导页打开「思维导图」标签页。首次打开会自动拉起
   Viscod（需要几秒到几十秒构建/扫描，取决于项目大小）。

> 环境变量是 DSH 宿主进程读的（`index.js` 在加载时读取），所以要在 **启动 DSH 之前**设好，
> 例如在启动 DSH 的终端里 `$env:VISCOD_PROJECT_ROOT='D:\path\to\viscod'`，或写成系统/用户环境变量。
> 改完环境变量需要重启 DSH 才生效。

---

## 配置

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `VISCOD_PROJECT_ROOT` | `D:\Dev\Project4-Viscod` | Viscod 项目仓库根目录。插件会把它设为 Viscod 的当前项目；请按自己的实际路径覆盖。 |
| `VISCOD_PORT` | `7401` | Viscod 本地服务端口。插件探活 `http://127.0.0.1:<PORT>/api/health`，并把同名环境变量传给拉起的服务进程。 |
| `VISCOD_NODE` | 自动探测 | 拉起 `server/index.ts` 用的 node 可执行文件。探测顺序：`VISCOD_NODE` → DSH 自带运行时里的 node → `D:\App\nodejs\node.exe` → `C:\Program Files\nodejs\node.exe` → 当前进程可执行文件（配合 `ELECTRON_RUN_AS_NODE=1`）。 |

示例（指向自己的 Viscod 仓库、换端口、指定 node）：

```powershell
$env:VISCOD_PROJECT_ROOT = 'D:\code\my-viscod'
$env:VISCOD_PORT         = '7501'
$env:VISCOD_NODE         = 'C:\Program Files\nodejs\node.exe'
```

---

## 日志

宿主半侧把启动、切换项目、服务 stdout/stderr、错误等写入：

```
<VISCOD_PROJECT_ROOT>\data\viscod-plugin.log
```

如果面板一直停在「正在启动 Viscod…」或报「启动失败」，先看这个文件，再看 Viscod 自己的
控制台输出（可以在项目里手动 `npm start` 复现）。

---

## 工作原理（简图）

```
DSH Web GUI                        本机
┌──────────────────────┐   iframe   ┌────────────────────────────┐
│ 侧边栏「思维导图」标签页 │ ─────────▶ │ Viscod Web UI (127.0.0.1:7401) │
│  (client.js)          │            └────────────▲───────────────┘
│   fetch /viscod/*     │                     │ /api/*
└─────────┬────────────┘                     │
          │ 同源请求                            │
          ▼                                  │
┌──────────────────────┐  spawn tsx          │
│ DSH webServer         │ ───────────────────┘
│  (index.js, /viscod/*)│   cwd = VISCOD_PROJECT_ROOT
└──────────────────────┘
```

- `/viscod/ensure` 会先 `GET /api/health` 探活；活着就只做「切项目」，不重复启动。
- 服务已经由别人启动（例如你自己 `npm start`）时，插件会复用那个实例，不会杀它。
- 只有插件自己拉起的进程，才会在插件卸载时被关掉。

---

## 已知限制

- **强依赖 Viscod 仓库结构**：必须有 `<根目录>/server/index.ts`，且 `node_modules/tsx` 可用
  （`npm install` 过的仓库）。插件不负责安装 Viscod 的依赖，也不会自动 `npm run build`。
- **默认端口 7401**。如果 7401 已被别的 Viscod 实例占用，插件会直接复用那个实例并把它的
  当前项目切到 `VISCOD_PROJECT_ROOT`（会改变你原本在看的项目）。想避免就换 `VISCOD_PORT`
  （注意 Viscod 服务端也读同名变量，两边要一致）。
- **默认项目路径是 Windows 路径**（`D:\Dev\Project4-Viscod`）。在 macOS/Linux 或其他盘符上必须
  显式设置 `VISCOD_PROJECT_ROOT`；`VISCOD_NODE` 的自动探测也偏向 Windows，其他平台建议直接指定。
- **仅支持 DSH Web GUI** 的侧边栏；CLI / 其他客户端没有这块面板。
- 首次拉起服务最多等约 **40 秒**（100 次 × 400ms 探活），大项目冷启动可能更久，超时后可以在
  Viscod 仓库里手动 `npm start`，然后点面板上的「重试」。
- 面板只是 Viscod UI 的容器：思维导图的编辑、协同、AI 生成等能力全部来自 Viscod 本体，
  本插件不修改数据。

---

## License

MIT © 2026 Morrow，见 [LICENSE](./LICENSE)。
