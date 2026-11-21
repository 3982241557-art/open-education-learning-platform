#!/usr/bin/env python3
"""模拟 GitHub Pages 的静态托管行为。

与普通静态服务器的区别 —— 这两点正是 Pages 的关键特性：

1. **未知路径返回 ``404.html``**（而不是自己生成 404 页面）；
2. **目录请求必须带末尾斜杠**才匹配（``/hub`` 会 301 到 ``/hub/``）。

用这个脚本本地验证静态产物在 Pages 上的真实行为。

用法::

    python3 scripts/gh-pages-server.py web/out 8097 /仓库名
"""

import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

# 站点根目录（相对于本脚本运行时的 cwd）。
ROOT = sys.argv[1] if len(sys.argv) > 1 else "out"

# 端口。
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8097

# 站点挂在哪个子路径下——GitHub Pages 的项目站点在 ``/<仓库名>/``。
PREFIX = sys.argv[3] if len(sys.argv) > 3 else ""

# 404 页的**绝对**路径——``chdir`` 之后相对路径就失效了。
NOT_FOUND_PAGE = os.path.abspath(os.path.join(ROOT, "404.html"))


class PagesHandler(SimpleHTTPRequestHandler):
    """按 GitHub Pages 的规则处理请求。"""

    def translate_path(self, path):
        """把 URL 路径映射到文件系统路径。"""
        # 先剥掉查询串——``/hub/?id=1`` 和 ``/hub/`` 是同一个文件。
        path = path.split("?", 1)[0].split("#", 1)[0]
        if PREFIX and path.startswith(PREFIX):
            path = path[len(PREFIX):]
        return super().translate_path(path)

    def do_GET(self):
        """找不到文件时返回 ``404.html``——这是 Pages 的行为。"""
        target = self.translate_path(self.path)

        # 目录 + 带末尾斜杠 → 走 index.html。
        if os.path.isdir(target) and self.path.endswith("/"):
            if os.path.exists(os.path.join(target, "index.html")):
                self.path = self.path.rstrip("/") + "/index.html"
                return super().do_GET()

        # 目录但**没有**末尾斜杠 —— Pages 会 301 到带斜杠的形式。
        if os.path.isdir(target) and not self.path.endswith("/"):
            self.send_response(301)
            self.send_header("Location", self.path + "/")
            self.end_headers()
            return

        print(f"[trace] path={self.path} target={target} exists={os.path.exists(target)} isdir={os.path.isdir(target)}", file=sys.stderr)

        # 文件不存在 —— Pages 的 404 回退。
        if not os.path.exists(target):
            if os.path.exists(NOT_FOUND_PAGE):
                with open(NOT_FOUND_PAGE, "rb") as handle:
                    body = handle.read()
                self.send_response(404)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return

        return super().do_GET()

    def log_message(self, fmt, *args):
        sys.stderr.write("%s\n" % (fmt % args))


if __name__ == "__main__":
    os.chdir(ROOT)
    server = ThreadingHTTPServer(("127.0.0.1", PORT), PagesHandler)
    print(f"模拟 GitHub Pages： http://127.0.0.1:{PORT}{PREFIX}/")
    server.serve_forever()
