"""本地预览和测试用的静态服务器：python3 tools/serve.py [端口]
Python 自带的 http.server 等待连接的队列只有 5 个，页面同时请求十几个 JS 模块时会被拒掉一部分，页面就启动不了。这里把队列调大"""
import functools, http.server, os, sys

class Server(http.server.ThreadingHTTPServer):
    request_queue_size = 128

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
print(f'http://127.0.0.1:{port}/', flush=True)
Server(('127.0.0.1', port), functools.partial(Quiet, directory=root)).serve_forever()
