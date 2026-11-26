# 标杆专题自定义短片

把为标杆专题制作的 MP4 视频放到这个目录，文件名必须与专题 id 完全一致：

| 专题 id | 文件名 | 专题 |
| --- | --- | --- |
| `exp-comfort` | `exp-comfort.mp4` | 舒适区的几何学：指数增长与衰减 |
| `seq-zeno` | `seq-zeno.mp4` | 一尺之棰与无穷边界：等比数列与极限 |
| `prob-bayes` | `prob-bayes.mp4` | 直觉为何总在撒谎：条件概率与贝叶斯 |

## 运行时行为

- 页面打开时先尝试加载 `/videos/<topic-id>.mp4`；
- **加载成功** → 自动使用你的视频，并显示极简播放器控制条；
- **加载失败或文件不存在** → 无缝回落到内置的「微光几何声画短片引擎」
  （纯 Canvas 2D 动画 + Web Audio API 实时合成音效），**不需要改任何代码**。

## 建议规格

- 分辨率 1920×1080（舞台按容器自适应，16:9 最稳）；
- 时长 15–25 秒；
- 编码 H.264 + AAC，`faststart`（把 moov atom 放到文件头，让浏览器边下边播）；
- 体积尽量控制在 8 MB 以内。

推荐 ffmpeg 命令：

```bash
ffmpeg -i source.mov -vf "scale=1920:-2" -c:v libx264 -crf 23 \
  -preset slow -movflags +faststart -c:a aac -b:a 128k out.mp4
```
