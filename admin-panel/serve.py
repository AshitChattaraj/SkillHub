"""Standalone server for Admin Panel frontend."""
import os
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = int(os.environ.get("ADMIN_PORT", "5002"))
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend")

class CustomHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=FRONTEND_DIR, **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

def run():
    os.chdir(FRONTEND_DIR)
    server_address = ("0.0.0.0", PORT)
    httpd = HTTPServer(server_address, CustomHandler)
    print(f"SkillHub Admin Panel running at http://localhost:{PORT}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down Admin Panel server.")
        httpd.server_close()

if __name__ == "__main__":
    run()
