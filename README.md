# Blueport / 导航

原生 HTML/CSS/JavaScript + 单个 Go 二进制，内嵌网页和字体。运行时不需要 Node、
Python、Docker 或数据库。蓝白视觉参考 [Protocol Explorer](https://protocol-explorer-alpha.vercel.app/)。

## 本地启动

更适合新标签页的独立浏览器扩展版已经提供：本地显示，无服务器和后台进程，支持
Chrome / Edge。生成、权限和安装方式见 [docs/extension.md](docs/extension.md)。

需要 Go 1.25+：

```powershell
New-Item -ItemType Directory -Force data
Copy-Item config.example.yaml data/config.yaml
go run . -listen 127.0.0.1:18787 -config data/config.yaml
```

打开 http://127.0.0.1:18787 。示例 NAS/路由器/媒体/下载地址均为占位示例，使用前
让 AI 替换。没有读取用户浏览器或 NAS 的实际服务配置。

## AI 维护

编辑 UTF-8 YAML，结构见 `config.example.yaml`。数组顺序决定分类和服务的显示顺序。
每个入口至少一个 http(s) 地址；不接受账号密码嵌在 URL 中。
`keywords` 可填写别名，后端自动生成拼音和首字母索引。

```sh
blueport -check -config /path/to/config.yaml
```

建议 AI 先写临时文件、校验，再原子替换。目录文件监听负责重载，SSE 通知页面，
无配置扫描轮询；未知字段、重复键/ID、非法地址、多文档及超 1 MiB 文件被拒绝。
无效修改保留内存中上次可用配置并记录日志；重启前仍须修正磁盘文件。

内置图标：`server network play download code globe folder shield terminal music home link`。
数据目录直接备份。无登录、写入 API/MCP、后台编辑、图标抓取和系统监控。
公网访问限制由现有 VPN / 反代负责。

## 内外网自动切换

假设 NAS 为 `192.168.1.10`、公网面板为 `https://nav.example.com`：

```yaml
network:
  probe_url: http://192.168.1.10:18787/api/probe
  probe_id: blueport-home
  allowed_origins:
    - https://nav.example.com
  timeout_ms: 1400
```

浏览器直接探测并核对实例标识，不由 NAS 代替判断。只允许固定私有 IP / loopback
的探测地址；端点限制私有 Host、私有请求来源和精确 CORS 来源。
不要将 `/api/probe` 公网反代为私有 Host。`probe_id` 是实例标识，不是密码。

默认公网，确认内网可达后切换；仅内网服务始终可点，仅公网服务始终公网。
可手动选择自动/内网/公网；选择仅存当前浏览器。页面打开、回到前台或网络改变时
探测，没有定时网络轮询；后台标签页关闭 SSE，恢复时重连。反代 `/api/events`
须关闭缓冲；连接中断使用 EventSource 的标准重连机制。

Chrome/Edge 可能请求本地网络访问权限。HTTPS 公网页面访问 HTTP 私网，在某些
版本或策略下会被权限、混合内容、CORS 阻止。此时保持公网并显示原因，允许手动
覆盖；可在私网端点配置有效 HTTPS。**实网验证前不承诺全部浏览器场景都自动成功。**

## 飞牛 FPK

`packaging/fnos` 基于官方 fnpack 1.2.3 模板。包用户运行，无 root/Docker 依赖，
固定监听 18787，飞牛桌面以外部页面打开。首次启动复制配置到
`/var/apps/blueport/var/config.yaml`；升级不覆盖。日志在相同目录。
端口冲突不启动；首版固定端口，修改要同步 main/manifest/UI 配置后重打包。

安装 Go 与官方 [fnpack](https://developer.fnnas.com/docs/cli/fnpack/) 后：

```sh
python scripts/build.py --arch amd64
python scripts/build.py --arch arm64
```

支持 `--go` 与 `--fnpack` 指定绝对路径。产物在 dist/，不入 Git。
Windows 官方 fnpack 1.2.3 会丢失可执行权限，因此 Windows 构建时使用
`--linux-fnpack PATH` 指向官网下载的 Linux 版工具；脚本通过已安装的 WSL，
在原生 Linux 临时目录中打包并校验执行权限。不提供此参数时会拒绝权限不正确的包。
官方打包成功不等于实机安装验证；还需确认 NAS 系统/CPU，验证安装、权限、启停、
升级保留数据、卸载和真实网络切换。开发过程不会自动修改 NAS 或公网入口。

## 验证与许可

```sh
go test ./...
go vet ./...
node --check web/app.js
npm ci --ignore-scripts
npm test
python scripts/verify.py
# Linux/WSL：解包到临时目录，模拟生命周期并测量资源，不安装到 NAS
python3 scripts/linux_verify.py dist/blueport-0.1.0-amd64.fpk
```

测试配置校验、拼音、原子替换、无效配置保留、探测边界、HTTP 压缩/缓存和 SSE。
验收边界见 `docs/verification.md`，设计依据见 `docs/design-reference.md`。
代码使用 MIT；Iosevka 使用 SIL OFL 1.1，许可证在 `web/fonts/LICENSE.md`。
本地字体取自参考站公开资源，未复制协议课程、模拟器业务代码或动画。
