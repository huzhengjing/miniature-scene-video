# 搭建与运行约定

## 按需获取素材

从 https://polyfork.dev/ 当前公开接口或网站查找素材。已有项目确认的入口包括 `/api/assets` 及其 class 筛选、`/api/kits`，查询参数与详情入口以当次网站公开说明为准。搜索使用简洁物体词，组合查询覆盖差时拆词。查看 title、description、size_m、origin_y、palette、has_skeleton、rigged_parts、clips 与 download。下载使用元数据给出的 download.glb 地址，保留元数据和 credit。不要自行构造账号密钥或绕过登录。

免费网格的历史元数据提供 CC BY 4.0 署名授权。实际使用核对当次 license，并将 credit 保存在项目素材清单及交付署名中。源码 .mjs 和 HD 版本另有 Polyfork 许可及分发限制，技能包不包含现有个人测试下载的这些素材。需要登录或付费权限时使用用户已有授权，素材缺口可用参数几何补齐并说明。素材站的需求上报属于对外发送，必须先得到用户明确授权。

下载实际使用的少量模型，按资产 ID 缓存至项目 assets。GLTFLoader 读取本地文件。保留顶点颜色，将材质映射为 Toon 时传递 vertexColors、opacity、transparent、side 与贴图的必要属性。动画、骨骼、枢轴及可分离节点保留独立层级。合并静态网格时按兼容材质和属性处理，保留 color 属性，排除 SkinnedMesh、InstancedMesh 和受动画控制的节点。

## 通用引擎

复制 assets 中两个模块及许可到项目。引擎从历史样片保留多通道绘制及后处理，默认暖白背景和固定世界太阳。按题材搭建几何、摆放道具及编写相机，避免把篮球场动作套到所有场景。

项目安装 three@0.170.0 与 playwright@1.60.0，使用本地 import map 解析 three。HTML 中的 #frame 与 canvas 均为 960×540，页面边距为 0，画布位于视口左上角，无额外 UI。浏览器通过渲染脚本提供的本机 HTTP 服务加载。可按下列接口创建场景入口，buildScene 与 cameraAt 由当前项目实现。

```javascript
import { createIllustrationEngine } from './illustration-engine.mjs';
import { buildScene, cameraAt } from './scene.mjs';

const engine = createIllustrationEngine(document.querySelector('canvas'), {
  durationMs: 32000,
  loop: true,
});
await buildScene(engine);
engine.setCamera((ms, camera) => cameraAt(ms, camera));
engine.expose();
```

buildScene 可使用 scene、renderer、camera、lighting、updates、toon、noInk、glow。updates 中每个函数接收绝对毫秒，在每帧还原动画状态。cameraAt 更新相机位置、观察点及投影。assets/lighting.mjs 为夕阳起始配置，其他主题可以在搭建期确定灯光与背景参数，确定后不随镜头插值或移动。

引擎 expose() 暴露 READY、render(ms)、frame(i)、DURATION_MS 与 MATCH_LOOP_END。frame(i) 使用 i/24 秒，render(ms) 接受毫秒。循环场景将 durationMs 映射回 0，渲染器最后一帧采用终点状态以承接第一帧。此约定不代替动作和音乐本身的首尾衔接设计。

## 原型迁移

继续已有篮球场时保留 scene-people、camera-push、场景坐标、音乐与世界锁定灯光。原型的 scene.html 和 build_scene.py 中内部 framebuffer、CSS 和 canvas 尺寸统一改为 960×540，默认 scale=1，阴影 mapSize 改为 1024。将旧抓帧与视频入口指向本技能 scripts/render.mjs，使用 window.render，避免旧 renderMany 抖动路径。只调整用户授权范围内的源码，第一次实际输出遵守一次授权一版规则。

下次真实篮球场渲染沿用 32 秒时间线，设置 BENCHMARK_SCENE_KEY。原型的历史启动参数、4096 阴影与旧尺寸仍记录在管线报告中供对照。技能包整理过程未改写或重新生成既有样片。

## 配乐

scripts/make_music.py 接收 WAV 路径与 --duration 秒数，以固定种子合成五声音阶轻音乐，默认 32 秒、44100Hz 立体声。末尾音符通过循环缓冲衰减到开头，音画长度保持一致。根据当前场景改写配器与事件时间应在首次出片前完成。篮球场默认纯音乐，不添加拍球声。

```powershell
python "<skill>/scripts/make_music.py" "<project>/music.wav" --duration 32
```
