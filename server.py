#!/usr/bin/env python3
"""
20분 AMRAP 운동 카운터 웹서버 실행 스크립트
"""

import http.server
import socketserver
import webbrowser
import os
import sys

PORT = 8080
DIRECTORY = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'www')

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

def main():
    port = PORT
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            pass

    # Allow port reuse immediately
    socketserver.TCPServer.allow_reuse_address = True
    
    with socketserver.TCPServer(("", port), Handler) as httpd:
        url = f"http://localhost:{port}"
        print(f"\n=======================================================")
        print(f"  🔥 20분 AMRAP 운동 카운터 웹사이트가 시작되었습니다!")
        print(f"  🌐 브라우저 접속 주소: {url}")
        print(f"  💡 종료하려면 터미널에서 Ctrl + C 를 누르세요.")
        print(f"=======================================================\n")
        
        try:
            webbrowser.open(url)
        except Exception:
            pass
            
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n웹 서버를 안전하게 종료했습니다.")

if __name__ == '__main__':
    main()
