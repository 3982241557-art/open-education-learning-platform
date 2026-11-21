# ─────────────────────────────────────────────────────────────
#  开放教育学习平台 · 后端镜像
# ─────────────────────────────────────────────────────────────
#
#  一次构建，Zeabur / Railway / Render 都能直接用。
#
#  构建上下文设为 **backend/** 目录：
#
#      docker build -t dreamclass-backend ./backend
#
#  为什么上下文是 backend/ 而不是仓库根
# ------------------------------------
#
# 因为 Dockerfile 在 backend/ 下，``COPY . .`` 拷的就是 backend/ 的内容。
# 如果把上下文设成仓库根，就得写 ``COPY backend/ .``——两种都行，
# 但上下文设小一点，**构建缓存命中率高得多**（根目录里 web/node_modules
# 那种大目录会拖慢每次构建）。
#
#  部署时的环境变量
#  ----------------
#
#      PORT               云平台自动注入，一般不用管
#      DEEPSEEK_API_KEY   必填 —— 没有它平台不会假装自己能回答
#      ALLOWED_ORIGINS    可选 —— 前端域名，逗号分隔
#      GITHUB_TOKEN       可选 —— 提升 GitHub 检索配额
#
# ─────────────────────────────────────────────────────────────

FROM python:3.11-slim

# 系统依赖：
#
# * ``ffmpeg``  —— yt-dlp 合并音视频流时需要（部分是分离的音轨）；
# * ``git``     —— 拉取开源教育项目时用 ``git clone``；
# * ``ca-certificates`` —— HTTPS 出站请求。
#
# ``--no-install-recommends`` 让镜像小一大截——这些包的推荐依赖
# （如 LaTeX 相关）在这里完全用不上。
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ffmpeg \
        git \
        ca-certificates \
        curl \
    && rm -rf /var/lib/apt/lists/*

# 工作目录。
WORKDIR /app

# 先装依赖——这样只要 ``requirements.txt`` 没变，
# 这一层就用缓存，重建极快。
COPY requirements.txt /app/requirements.txt

RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r /app/requirements.txt

# 再拷代码。
#
# 放在装依赖**之后**——改一行 Python 代码不会触发依赖重装。
COPY . /app

# 数据目录。
#
# 平台需要写用户档案、笔记、课程进度，所以这个目录要存在且可写。
RUN mkdir -p /app/data

# 不要以 root 跑。
#
# 不是为了「安全最佳实践」，而是因为很多云平台**要求**非 root 运行——
# 以 root 启动的容器会被平台直接拒绝。
RUN useradd --create-home --shell /bin/bash appuser \
    && chown -R appuser:appuser /app
USER appuser

# 暴露端口。
#
# 这里只是文档性质——Docker 的 ``EXPOSE`` 不改变实际监听行为，
# 真正决定监听什么的是 ``run.py``（它读 ``PORT`` 并监听 ``0.0.0.0``）。
EXPOSE 8001

# 健康检查。
#
# 云平台会用它判断「服务活了吗」。这个端点不需要密钥、不碰数据库，
# 所以即使模型没配密钥它也能返回 200——**服务本身是活的**，
# 只是不能回答问题。这两件事不该混为一谈。
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD curl -fsS http://127.0.0.1:${PORT:-8001}/api/health || exit 1

# 启动命令。
CMD ["python3", "run.py"]
