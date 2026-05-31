"""
Start FastAPI backend on port 8000 + TCP proxy 8888->8000 in one process.
Writes all access logs to access.log so we can see what UE5 requests.
"""
import asyncio
import os
import socket
import sys
import threading
import uvicorn
import logging

# Make `app.main` importable when this script runs under the packaged
# embeddable Python (python311._pth isolates sys.path and does NOT add the
# script's directory automatically — only the standard interpreter's
# site.main() does that, and we explicitly disable site loading).
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# File handler so we can tail access.log from outside this process.
# v0.6.4: resolve a writable log dir explicitly. The orchestrator may launch
# this script with cwd set to a read-only install directory (Program Files);
# the previous "access.log" relative path would crash backend boot with
# PermissionError BEFORE port 8000 was bound, leaving the user with no
# diagnostics. Also switch mode "w" -> "a" so previous session's access
# trace survives an auto-restart (we want to read it after a crash).
def _resolve_access_log_path() -> str:
    candidates = []
    if os.environ.get("EDU_LOG_DIR"):
        candidates.append(os.path.join(os.environ["EDU_LOG_DIR"], "access.log"))
    if os.environ.get("LOCALAPPDATA"):
        candidates.append(os.path.join(os.environ["LOCALAPPDATA"], "EduTutor.AI", "logs", "access.log"))
    if os.environ.get("APPDATA"):
        candidates.append(os.path.join(os.environ["APPDATA"], "edututor-desktop", "logs", "access.log"))
    candidates.append(os.path.join(os.path.expanduser("~"), ".edututor", "access.log"))
    candidates.append("access.log")  # last resort (dev mode, repo cwd is writable)
    for path in candidates:
        try:
            os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
            with open(path, "a", encoding="utf-8") as _probe:
                pass
            return path
        except OSError:
            continue
    return os.devnull  # absolute fallback; never crash backend boot for a log file

try:
    file_handler = logging.FileHandler(_resolve_access_log_path(), mode="a", encoding="utf-8")
    file_handler.setLevel(logging.INFO)
    file_handler.setFormatter(logging.Formatter("%(asctime)s %(message)s"))
    access_logger = logging.getLogger("uvicorn.access")
    access_logger.addHandler(file_handler)
except Exception as exc:  # pragma: no cover — never block boot for a log file
    logging.getLogger(__name__).warning("access.log handler setup failed: %s", exc)


async def _pipe(reader, writer):
    try:
        while True:
            data = await reader.read(65536)
            if not data:
                break
            writer.write(data)
            await writer.drain()
    except Exception:
        pass
    finally:
        try:
            writer.close()
        except Exception:
            pass


async def _proxy_handle(r, w):
    try:
        br, bw = await asyncio.open_connection("127.0.0.1", 8000)
        await asyncio.gather(_pipe(r, bw), _pipe(br, w))
    except Exception as e:
        print(f"[proxy] {e}")
        w.close()


def _run_proxy():
    async def _main():
        # NOTE 2026-05-16: removed port 8888 from this proxy. PixelStreaming's
        # streamer-side signalling expects to bind 8888 itself; our former
        # 8888→8000 proxy was squatting on that port and silently breaking
        # the packaged SlovakEdu.exe's `-PixelStreamingURL=ws://127.0.0.1:8888`
        # registration. Port 30000 stays — it's the UE5 HTTP health probe
        # forwarder and doesn't collide with PixelStreaming.
        http_server = await asyncio.start_server(_proxy_handle, "127.0.0.1", 30000)
        print("[proxy] 30000 -> 8000 ready  (UE5 HTTP health check)")
        async with http_server:
            await http_server.serve_forever()
    asyncio.run(_main())


def _make_dual_stack_socket(host: str, port: int) -> socket.socket:
    """Create an IPv6 socket with IPV6_V6ONLY=0 — accepts both v4 and v6.

    The full story (taking three release cycles and a deep audit to find):

    - v0.4.4 fixed `host="::"` because Windows defaults `IPV6_V6ONLY=1`,
      making the socket IPv6-only, refusing every IPv4 client (frontend,
      Wilbur proxy, UE5 streaming). The fix was `host="0.0.0.0"` — IPv4 only.
    - v0.5.x then broke avatar lipsync: UE5's WebSocket Blueprint plugin
      connects to `ws://localhost:8000/ws/avatar`. On Windows, `localhost`
      resolves to `::1` FIRST (IPv6), then `127.0.0.1`. The plugin sent
      SYN to `[::1]:8000`, kernel returned RST (we weren't bound to v6),
      plugin logged "Connection Error" and never tried v4. Other Python
      clients (websockets, httpx) do happy-eyeballs and silently fall back,
      so our tests passed — only UE5 was hit by the v4/v6 mismatch.
    - This is the true fix: bind a single IPv6 socket with V6ONLY=0 so the
      kernel accepts both `[::1]:8000` AND `127.0.0.1:8000` connections.
      Every client lands. No forwarder. No BP edit. No localhost-vs-127.0.0.1
      hygiene burden on every future contributor.

    See memory project_ipv6_bind_windows for the dual-stack lesson.
    """
    sock = socket.socket(socket.AF_INET6, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    # The whole point: disable IPv6-only mode. Without this on Windows,
    # the socket only accepts v6 (IPV6_V6ONLY defaults to 1 on Windows).
    sock.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
    sock.bind((host, port))
    sock.listen()
    return sock


if __name__ == "__main__":
    proxy_thread = threading.Thread(target=_run_proxy, daemon=True)
    proxy_thread.start()

    # Build a dual-stack socket ourselves and hand it to uvicorn.
    # uvicorn's high-level `host=` argument can't express dual-stack on
    # Windows (it uses standard bind which honors the OS default of v6-only
    # when the host is "::"). The lower-level Server.serve(sockets=[...])
    # path accepts our pre-bound socket as-is.
    sock = _make_dual_stack_socket("::", 8000)
    config = uvicorn.Config(
        "app.main:app",
        log_level="info",
        access_log=True,
    )
    server = uvicorn.Server(config)
    asyncio.run(server.serve(sockets=[sock]))
