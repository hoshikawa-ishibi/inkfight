# 原创配乐试听

`inkfight-spring.wav` 是《听泉破阵》的 32 秒试听，依次呈现基础、交锋、决胜三层配器。
44.1 kHz、16 位、双声道 PCM；由浏览器 OfflineAudioContext 使用正式游戏同一份乐谱与合成器生成。

全部四首主题可在「3D 造物间」生成并下载。乐谱位于 `src/core/music-score.js`，
声音合成与调度位于 `src/view/music-engine.js`，没有外部音频采样或音乐服务调用。

`audio-validation.json` 记录四段试听的峰值、均方根音量与尾部幅度，以及静音、后台、恢复和切曲的检查。
可在本地打开 `tools/presentation-check.html`，点「运行音频检查」复现；测试增益为零。
这些是输出完整性与播放生命周期检查，不代替人耳对旋律和音色的审听。
