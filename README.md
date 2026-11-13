# 微缩三渲二场景视频（miniature-scene-video）

把一个地方，做成一个可以捧在手里看的微缩小世界。

给一句话，或者一张参考图，这个 skill 会自己分析场景需要哪些东西、它们的位置关系，去 Polyfork 按需挑选模型，搭出带底座的微缩场景，统一上三渲二画风，再安排一条连贯的镜头看完整个小世界，配上音乐直接出片。它是代码真搭三维场景再“拍”下来，不是 AI 生成视频，所以文字不会写错、物体不会凭空变形。

能做的不限于篮球场：校门口、老家巷口的小卖部、雨夜便利店、外婆家的院子——任何对你有意义的地方，都可以这样留下来。

## 使用

1. 把本仓库文件夹放进你桌面 AI 的技能目录（如 ChatGPT 桌面版 Codex 模式的 `.agents/skills/`），或让 AI 直接读取本仓库；
2. 本机需要 Node.js、Chrome、ffmpeg，项目依赖（three、playwright）按 SKILL.md 说明安装；
3. 对 AI 说清想要的场景，先看 4 张样帧确认，再出成片。

举例：直接文字输入，使用这个技能，帮我制作一个夕阳下的篮球场；或者，你有参考图，把图发给AI，告诉它，参考这张图帮我制作图中场景。

成片规格：960×540、24fps。详细流程和规矩都在 SKILL.md 里。

## 出处

- 插画绘制通道改编自开源项目 [Simcraft](https://github.com/dotslashsimran/simcraft)（作者 Simran Sachdeva，MIT 许可，许可证在 `assets/LICENSE.simcraft`）；
- 场景模型来自 [Polyfork](https://polyfork.dev)（CC BY 4.0，使用时随交付附署名）。

版本 1.0.0
