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

## 官方依据

- https://developer.chrome.com/docs/extensions/develop/ui/override-chrome-pages
- https://developer.chrome.com/docs/extensions/develop/concepts/network-requests
- https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions
