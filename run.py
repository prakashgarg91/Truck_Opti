import webbrowser
import socket
from threading import Timer
from app import create_app

def find_available_port(start_port=5000):
    port = start_port
    while True:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(('127.0.0.1', port))
                return port
            except OSError:
                port += 1

app = create_app()
port = find_available_port()

def open_browser():
    webbrowser.open_new(f"http://127.0.0.1:{port}/")

if __name__ == '__main__':
    Timer(1, open_browser).start()
    app.run(debug=True, port=port)