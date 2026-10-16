# 本地试玩服务器（禁用缓存，改完代码刷新即生效）：python serve.py  然后打开 http://localhost:8777
import http.server, os

os.chdir(os.path.dirname(os.path.abspath(__file__)))

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

with http.server.ThreadingHTTPServer(('', 8777), NoCache) as s:
    print('Star Weaver: http://localhost:8777', flush=True)
    s.serve_forever()
