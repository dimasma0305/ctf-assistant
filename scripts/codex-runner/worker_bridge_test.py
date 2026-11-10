"""Exercise the real worker HTTP bridge without starting Codex or Docker."""
import ast
import http.client
import http.server
import pathlib
import threading
import unittest


def bridge_class():
    tree = ast.parse(pathlib.Path(__file__).with_name('worker.py').read_text())
    definitions = [node for node in tree.body if isinstance(node, (ast.Import, ast.ImportFrom, ast.ClassDef))]
    namespace = {}
    exec(compile(ast.Module(body=definitions, type_ignores=[]), 'worker.py', 'exec'), namespace)
    return namespace


class BridgeTests(unittest.TestCase):
    def exchange(self, length=None, fail=False, status=200, artifact_size=None):
        class Upstream:
            def __init__(self): self.sent = False
            def getheader(self, key, default=None):
                return {'Content-Type': 'application/zip', 'Content-Length': length, 'X-Artifact-Size': artifact_size}.get(key, default)
            def read1(self, size):
                if not self.sent:
                    self.sent = True
                    return b'PK\x03\x04test'
                if fail: raise OSError('upstream transfer interrupted')
                return b''
        response = Upstream()
        response.status = status
        class Connection:
            def __init__(self, *args, **kwargs): pass
            def request(self, *args, **kwargs): pass
            def getresponse(self): return response
            def close(self): pass
        ns = bridge_class()
        ns['UnixHTTP'] = Connection
        server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), ns['Bridge'])
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        client = http.client.HTTPConnection(*server.server_address)
        try:
            client.request('POST', '/sources/download', body=b'{}')
            reply = client.getresponse()
            return reply.status, dict(reply.getheaders()), reply.read()
        finally:
            client.close(); server.shutdown(); server.server_close(); thread.join()

    def test_preserves_known_length_and_bytes(self):
        status, headers, body = self.exchange(length='8')
        self.assertEqual((status, headers['Content-Length'], body), (200, '8', b'PK\x03\x04test'))

    def test_frames_unknown_length_and_keeps_http_errors(self):
        status, headers, body = self.exchange(status=413)
        self.assertEqual(status, 413)
        self.assertEqual(headers['Transfer-Encoding'], 'chunked')
        self.assertEqual(body, b'PK\x03\x04test')

    def test_verified_artifact_size_survives_gateway_chunk_framing(self):
        _, headers, body = self.exchange(artifact_size='8')
        self.assertEqual(headers['Content-Length'], '8')
        self.assertEqual(len(body), 8)

    def test_partial_unknown_length_is_not_success(self):
        with self.assertRaises(http.client.IncompleteRead): self.exchange(fail=True)

    def test_partial_known_length_is_not_success(self):
        with self.assertRaises(http.client.IncompleteRead): self.exchange(length='16', fail=True)


if __name__ == '__main__': unittest.main()
