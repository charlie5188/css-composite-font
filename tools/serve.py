"""Static server for local previews and tests: python3 tools/serve.py [port].
Python's http.server queues only five connections. A page requesting a dozen JS modules can have connections rejected and fail to start, so increase the queue size here."""
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
