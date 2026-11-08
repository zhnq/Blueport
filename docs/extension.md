# 浏览器扩展版（Chrome / Edge）

Manifest V3 新标签页扩展，直接显示本地页面。字体、图标、服务配置和搜索索引都在
扩展包内；没有页面服务器、SSE、后台 Service Worker、定时轮询或运行时依赖。
浏览器关闭时没有进程驻留；每个新标签页只在需要时检测网络。

## 生成扩展

```sh
python scripts/build_extension.py --config config.example.yaml
```

目录：`dist/blueport-extension`，压缩包：`dist/blueport-extension.zip`。
公开首版只含占位示例，不包含个人服务配置，默认不请求 NAS 主机权限。
使用前复制示例到 `data/config.yaml`，让 AI 填写自己的服务地址并重新生成。
产物包含配置中的地址，分享前先检查 config.js。

扩展可请求既有的飞牛首页并检查 `fnOS` 标记判断局域网可达，无需安装额外探测
程序。匹配成功不代表用户登录，也不读取或发送登录 Cookie。访问失败、权限未获批
或页面不匹配时，维持公网优先和手动覆盖入口。

## 手动加载

1. Edge 打开 `edge://extensions`，或 Chrome 打开 `chrome://extensions`。
2. 开启“开发人员模式”，点击“加载解压缩的扩展”。
3. 选择 `dist/blueport-extension` 文件夹（不是 ZIP）。
4. 新开标签页，确认使用 Blueport 新标签页；若浏览器提示保留原来的新标签页，选择保留 Blueport。

安装会替换新标签页，并按 manifest 请求访问指定 NAS 主机的权限。只请求探测
所需的那个 IP，不请求所有网站、浏览历史、书签、Cookie、tabs 或页面注入权限。
Chrome 的 host match pattern 不能限定端口，CSP 额外限制到实际探测端口。
GitHub 更新接口使用公开 CORS 请求，仅加入 CSP，不额外申请网站访问权限。
不自动替用户安装、授予权限或更改浏览器设置。

## AI 维护与重新生成

继续维护同一份 YAML。示例：

```sh
python scripts/build_extension.py --config data/config.yaml --probe-url http://192.168.1.10:5666/ --probe-contains fnOS
```

开发机需要 Go/Python，浏览器运行扩展不需要。支持 `--go` 指定 Go 路径。
生成前复用 Go 配置校验与拼音索引，失败不覆盖已有扩展；已生成目录保留备份。
修改服务配置后重新生成，在扩展管理页点击“重新加载”，再打开新标签页。
Chrome 不允许扩展任意读取磁盘 YAML，所以独立扩展版不声称有后台文件自动重载。
如果保留 FPK/Web 版本，它们原有 YAML 文件监听能力不变。

默认不传探测覆盖参数时使用 YAML 中原有 Blueport 探测端点和实例标识。
网络权限/离线切换仍需在真实 Chrome / Edge 扩展环境核验；普通网页 DOM 测试
不能证明扩展已安装或权限已授予。主流手机浏览器对桌面扩展支持有限，手机继续用网页版。

## 手动检查与更新（扩展 0.1.1+）

点击面板右下角的“v版本号 · 检查更新”。只有点击时才请求
`https://api.github.com/repos/zhnq/Blueport/releases/latest`，没有后台检查、定时器、
GitHub Token 或用户配置上传。GitHub 会收到普通网络请求的 IP 等连接信息。
仅识别稳定版本，按数字比较版本号；同版、旧版、网络失败、无发布和 API 限流会显示结果。
新版说明按纯文本显示，只提供此仓库 Release 中匹配扩展 ZIP 的下载链接。

目前采用“加载解压缩的扩展”，浏览器不会从 GitHub ZIP 自动覆盖自身文件。
`runtime.requestUpdateCheck()` 走浏览器的扩展分发更新机制，不能安装任意 GitHub ZIP。
当前更新步骤：

1. 点击“下载新版”，解压到一个新的临时目录。
2. 关闭 Blueport 新标签页，在新目录运行（本机需要 Python 3.10+）：

   ```sh
   python update.py --target "原先加载的扩展文件夹绝对路径"
   ```

3. 工具保留旧 `config.js` 的原始内容，依其中的探测地址恢复 NAS 主机权限与 CSP；
   更新应用文件，并在旧目录旁留下完整备份。替换目录失败会尝试恢复原目录。
4. 在 `edge://extensions` 或 `chrome://extensions` 中点击 Blueport 的“重新加载”，
   再打开新标签页。无需删除重装，继续使用原目录。

源代码中也可运行 `python scripts/update_extension.py --source "新版解压目录" --target "旧目录"`。
工具不联网、不修改浏览器权限、不删除旧备份；同版/降级、嵌套目录、未知配置格式会拒绝。
更新期间保留的本地备份含个人配置，请按个人数据管理。
若配置格式将来发生不兼容变化，应按该版本迁移说明从 YAML 重新构建。

0.1.0 没有检查入口，需要先下载新版，用新版包内工具完成首次更新。
本流程仍需真实浏览器加载和权限验收；自动化测试覆盖的是 DOM 与本地文件更新行为。
若以后上架 Chrome / Edge 商店，可以再接入浏览器管理的安装更新流程。

## 官方依据

- https://developer.chrome.com/docs/extensions/develop/ui/override-chrome-pages
- https://developer.chrome.com/docs/extensions/develop/concepts/network-requests
- https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions
- https://developer.chrome.com/docs/extensions/develop/concepts/extensions-update-lifecycle
- https://developer.chrome.com/docs/extensions/how-to/distribute
