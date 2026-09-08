# AI Video Canvas

AI视频创作画布软件 - 桌面应用

当前维护仓库：`z372949862-bot/huabu`

## 功能特性

- 🎨 AI绘图 - 多平台AI图像生成
- 🎬 AI视频 - 文生视频、图生视频、多图/视频/音频参考
- 🎞️ Seedance 2.5 - 内置 New API 全部 12 个 Seedance 2.5 模型，并支持 YU25 sd2.5
- 🎭 3D导演台 - 简化版3D场景编辑
- 🔷 节点化编排 - 无限画布工作流
- 📦 资产管理 - 统一资产库
- 🏠 自定义主页 - 可拖拽布局
- 💾 项目恢复 - 重启后保留视频预览和提示词里的引用缩略图

## 技术栈

- Electron 30+
- Vue 3 + TypeScript
- Vite 5
- Pinia
- Vue Flow
- Three.js + TresJS
- Element Plus

## 开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 启动Electron开发环境
npm run electron:dev

# 构建项目
npm run build

# 打包应用
npm run electron:build
```

## 项目结构

```
ai-video-canvas/
├── src/
│   ├── views/          # 视图组件
│   │   ├── HomePage/
│   │   ├── NodeEditor/
│   │   ├── Director3D/
│   │   └── AssetLibrary/
│   ├── stores/         # Pinia状态管理
│   ├── components/     # 共享组件
│   ├── services/       # AI服务适配器
│   └── utils/          # 工具函数
├── electron/           # Electron主进程
└── public/             # 静态资源
```

## 许可证

MIT
