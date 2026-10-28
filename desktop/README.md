# EKPO 实验室日常管理 · 桌面版

桌面版是一个轻量 Electron 壳：启动后在本机 127.0.0.1:17361 提供应用页面，
再打开窗口加载。之所以不用 `file://` 直接打开，是因为应用用相对路径加载
ES 模块（`src/domain/index.js`），`file://` 下模块加载会失败，校准/实验等
功能会降级报错。

## 数据存储

和网页版一致，数据保存在应用内的 localStorage（键 `lab_management_db_v9`），
只存在本机当前 Windows 用户下。端口固定为 17361 是为了保证每次启动都是
同一个本地源，账本不会“消失”。也可以继续用应用内的「绑定本地文件实时保存」
和备份导出功能做双保险。

## 重新打包（Windows x64 便携版）

在本目录运行（只需要 Node.js）：

```
node build-windows.cjs
```

脚本会下载官方 Electron Windows 运行时，把本目录的壳与仓库的网页应用
组装成 `EKPO-Lab` 文件夹，并打包为仓库根目录的 `EKPO-Lab-Windows-x64.zip`。
解压后双击 `EKPO-Lab.exe` 即可运行，无需安装。

说明：便携版使用 Electron 默认图标，未做安装程序（NSIS）和代码签名；
Windows 首次运行可能出现 SmartScreen 提示，选择「仍要运行」即可。
