# ─────────────────────────────────────────────────────────────
#  开放教育学习平台 · AI 转发代理
# ─────────────────────────────────────────────────────────────
#
#  极简 Dockerfile——基于 Node 20 的 alpine 镜像。
#
#  免域名部署到 Zeabur / Railway / Fly.io 时，只要平台的构建
#  上下文设成这个目录，平台就会自动用这个 Dockerfile 构建。
#
#  平台的 Root Directory 要选 ``ai-proxy``。
# ─────────────────────────────────────────────────────────────

FROM node:20-alpine

WORKDIR /app

# 先装依赖——这一层有缓存，代码改动不会触发重装。
COPY package.json ./
RUN npm install --omit=dev

# 再拷代码。
COPY server.js ./

# 平台会注入 PORT；本地默认 8787。
ENV PORT=8787
EXPOSE 8787

CMD ["npm", "start"]
