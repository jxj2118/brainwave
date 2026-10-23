#!/usr/bin/env python3
"""Ephemeral loopback Git CGI fixture for real native transport acceptance tests."""
import http.server
import json
import os
from pathlib import Path
import subprocess
import tempfile
from urllib.parse import urlsplit

with tempfile.TemporaryDirectory(prefix="brainwave-git-http-") as directory:
    root = Path(directory)
    remote = root / "remote.git"
    subprocess.run(["git", "init", "--bare", "--initial-branch=main", str(remote)], check=True, stdout=subprocess.DEVNULL)
    subprocess.run(["git", "--git-dir", str(remote), "config", "http.receivepack", "true"], check=True)

    class GitHandler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def handle_git(self):
            url = urlsplit(self.path)
            length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(length)
            environment = dict(os.environ, GIT_PROJECT_ROOT=str(root), GIT_HTTP_EXPORT_ALL="1",
                               REQUEST_METHOD=self.command, PATH_INFO=url.path,
                               QUERY_STRING=url.query, CONTENT_TYPE=self.headers.get("Content-Type", ""),
                               CONTENT_LENGTH=str(length), REMOTE_USER="mobile-test")
            result = subprocess.run(["git", "http-backend"], input=body, capture_output=True, env=environment, check=True)
            headers, output = result.stdout.split(b"\r\n\r\n", 1)
            pairs = [line.decode().split(":", 1) for line in headers.split(b"\r\n")]
            status = next((int(value.strip().split()[0]) for key, value in pairs if key == "Status"), 200)
            self.send_response(status)
            for key, value in pairs:
                if key != "Status":
                    self.send_header(key, value.strip())
            self.send_header("Content-Length", str(len(output)))
            self.end_headers()
            self.wfile.write(output)

        do_GET = handle_git
        do_POST = handle_git

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), GitHandler)
    print(json.dumps({"port": server.server_port, "root": str(root), "remote": str(remote)}), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
