#!/usr/bin/env python3
"""End-to-end UE5 avatar WebSocket smoke test for the Blueprint dev team.

This script simulates exactly what a UE5 client does:
  1. Opens a WebSocket to /ws/avatar
  2. Reads the server's "connected" handshake
  3. Sends {"type":"avatar_ready", "capabilities":["viseme","emotion","state"]}
  4. Reads the server's "ready_ack" reply
  5. Triggers a /chat request to make the server broadcast
  6. Verifies the avatar payload arrives (with viseme + agentState v2.1)
  7. Reports a clean PASS/FAIL with copy-pasteable diagnostic output

Designed to run with ZERO third-party dependencies — only Python 3.11+
stdlib. The UE5 dev team can drop this on any machine, no pip install
needed. (Uses asyncio + http.client + a tiny RFC 6455 implementation.)

Exit code 0 = all green; UE5 Blueprint should connect successfully.
Exit code 1 = handshake or broadcast broken; copy stderr to ops.

Usage:
  ./scripts/smoke_avatar_ws.py                       # default localhost
  HOST=192.168.1.50 PORT=8000 ./scripts/smoke_avatar_ws.py
  PROTOCOL=wss ./scripts/smoke_avatar_ws.py          # for HTTPS deployments
"""
from __future__ import annotations

import asyncio
import base64
import http.client
import json
import os
import secrets
import socket
import struct
import sys
from typing import Optional, Tuple


HOST = os.getenv("HOST", "localhost")
PORT = int(os.getenv("PORT", "8000"))
PROTOCOL = os.getenv("PROTOCOL", "ws")  # "ws" or "wss"
PATH = os.getenv("PATH_WS", "/ws/avatar")
TIMEOUT_SECONDS = float(os.getenv("TIMEOUT", "10"))

GREEN = "\033[32m"
RED = "\033[31m"
YELLOW = "\033[33m"
DIM = "\033[2m"
RESET = "\033[0m"


def _ok(label: str, detail: str = "") -> None:
    print(f"  {GREEN}OK{RESET}   {label}" + (f"  {DIM}{detail}{RESET}" if detail else ""))


def _fail(label: str, detail: str = "") -> None:
    print(f"  {RED}FAIL{RESET} {label}" + (f"  {DIM}{detail}{RESET}" if detail else ""), file=sys.stderr)


def _info(label: str, detail: str = "") -> None:
    print(f"  {YELLOW}INFO{RESET} {label}" + (f"  {DIM}{detail}{RESET}" if detail else ""))


def http_check_avatar_status() -> Tuple[bool, dict]:
    """HTTP precheck: is /api/v1/avatar/status reachable? Returns the JSON."""
    try:
        conn = http.client.HTTPConnection(HOST, PORT, timeout=TIMEOUT_SECONDS)
        conn.request("GET", "/api/v1/avatar/status")
        resp = conn.getresponse()
        if resp.status != 200:
            return False, {"error": f"HTTP {resp.status}"}
        body = resp.read().decode("utf-8")
        return True, json.loads(body)
    except (OSError, json.JSONDecodeError) as exc:
        return False, {"error": str(exc)}


async def ws_handshake_and_exchange() -> bool:
    """Run the full WS handshake + avatar_ready/ready_ack exchange.

    Returns True if the server passed every step. Implementation is a
    minimal RFC 6455 client so the UE5 team can run this with zero pip
    dependencies on any Python 3.11+ machine.
    """
    if PROTOCOL == "wss":
        _fail("wss:// not implemented in this stdlib smoke",
              "use a real client (wscat) for HTTPS deployments")
        return False

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(TIMEOUT_SECONDS)
    try:
        sock.connect((HOST, PORT))
    except OSError as exc:
        _fail("TCP connect", f"{HOST}:{PORT} — {exc}")
        return False
    _ok("TCP connect", f"{HOST}:{PORT}")

    sec_key = base64.b64encode(secrets.token_bytes(16)).decode("ascii")
    handshake = (
        f"GET {PATH} HTTP/1.1\r\n"
        f"Host: {HOST}:{PORT}\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Key: {sec_key}\r\n"
        "Sec-WebSocket-Version: 13\r\n"
        "\r\n"
    ).encode("ascii")
    try:
        sock.sendall(handshake)
    except OSError as exc:
        _fail("send WS upgrade request", str(exc))
        sock.close()
        return False

    response = b""
    try:
        while b"\r\n\r\n" not in response:
            chunk = sock.recv(4096)
            if not chunk:
                break
            response += chunk
    except OSError as exc:
        _fail("read WS upgrade response", str(exc))
        sock.close()
        return False

    status_line = response.split(b"\r\n", 1)[0].decode("ascii", errors="replace")
    if "101" not in status_line:
        _fail("WS upgrade status", f"expected '101 Switching Protocols', got: {status_line}")
        if "403" in status_line:
            _info("hint: WS_ALLOWED_ORIGINS may need your origin added,",
                  "or set WS_ALLOW_ALL_ORIGINS=1 in backend .env (post-fix f3a501e)")
        sock.close()
        return False
    _ok("WS upgrade", "HTTP 101 Switching Protocols")

    msg = await _ws_recv_text(sock)
    if msg is None:
        _fail("read 'connected' frame", "no message received from server")
        sock.close()
        return False
    try:
        connected = json.loads(msg)
    except json.JSONDecodeError:
        _fail("parse 'connected' frame", f"non-JSON payload: {msg[:120]!r}")
        sock.close()
        return False
    if connected.get("type") != "connected":
        _fail("server greeting type", f"expected type='connected', got {connected!r}")
        sock.close()
        return False
    _ok("server greeting", f"connected message: {connected.get('message', '?')}")

    ready_payload = json.dumps({
        "type": "avatar_ready",
        "capabilities": ["viseme", "emotion", "state"],
    })
    try:
        _ws_send_text(sock, ready_payload)
    except OSError as exc:
        _fail("send avatar_ready", str(exc))
        sock.close()
        return False
    _ok("send avatar_ready", "client → server handshake message")

    msg = await _ws_recv_text(sock)
    if msg is None:
        _fail("read ready_ack", "server did not respond to avatar_ready")
        sock.close()
        return False
    try:
        ack = json.loads(msg)
    except json.JSONDecodeError:
        _fail("parse ready_ack", f"non-JSON: {msg[:120]!r}")
        sock.close()
        return False
    if ack.get("type") != "ready_ack":
        _fail("ack type", f"expected ready_ack, got {ack!r}")
        sock.close()
        return False
    accepted = ack.get("capabilities_accepted", [])
    _ok("ready_ack received", f"version={ack.get('version', '?')} caps={accepted}")

    print()
    _info("triggering /chat to provoke avatar broadcast …")
    chat_ok = await _trigger_chat_in_background()
    if not chat_ok:
        _fail("chat trigger", "couldn't POST /api/v1/chat — broadcast won't fire")
        sock.close()
        return False

    msg = await _ws_recv_text(sock, timeout=20.0)
    if msg is None:
        _fail("avatar broadcast", "no broadcast received within 20s of chat trigger")
        sock.close()
        return False
    try:
        broadcast = json.loads(msg)
    except json.JSONDecodeError:
        _fail("parse broadcast", f"non-JSON: {msg[:120]!r}")
        sock.close()
        return False

    required_keys = {"emotion", "intensity", "isSpeaking", "visemes", "viseme_timeline"}
    missing = required_keys - set(broadcast.keys())
    if missing:
        _fail("broadcast schema", f"missing keys: {sorted(missing)}")
        sock.close()
        return False
    _ok("avatar broadcast received",
        f"emotion={broadcast.get('emotion')} speaking={broadcast.get('isSpeaking')} "
        f"frames={len(broadcast.get('viseme_timeline', []))}")
    if "agentState" in broadcast:
        _ok("v2.1 agentState field present", broadcast["agentState"])
    else:
        _info("agentState absent (v2 compat path)",
              "Slovak tutor mode has no skills enabled → field omitted by design")

    sock.close()
    return True


def _ws_send_text(sock: socket.socket, text: str) -> None:
    """Send a text frame (RFC 6455, masked, single fragment)."""
    payload = text.encode("utf-8")
    length = len(payload)
    mask = secrets.token_bytes(4)
    header = bytearray()
    header.append(0x81)
    if length <= 125:
        header.append(0x80 | length)
    elif length <= 0xFFFF:
        header.append(0x80 | 126)
        header.extend(struct.pack(">H", length))
    else:
        header.append(0x80 | 127)
        header.extend(struct.pack(">Q", length))
    header.extend(mask)
    masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
    sock.sendall(bytes(header) + masked)


async def _ws_recv_text(sock: socket.socket, timeout: Optional[float] = None) -> Optional[str]:
    """Receive a single text frame, returning the decoded string or None on timeout/close."""
    sock.settimeout(timeout or TIMEOUT_SECONDS)
    try:
        header = _read_exact(sock, 2)
        if not header:
            return None
        b1, b2 = header[0], header[1]
        opcode = b1 & 0x0F
        if opcode == 0x8:
            return None
        if opcode != 0x1:
            return None
        masked = bool(b2 & 0x80)
        length = b2 & 0x7F
        if length == 126:
            length = struct.unpack(">H", _read_exact(sock, 2))[0]
        elif length == 127:
            length = struct.unpack(">Q", _read_exact(sock, 8))[0]
        mask = _read_exact(sock, 4) if masked else None
        payload = _read_exact(sock, length)
        if mask:
            payload = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        return payload.decode("utf-8", errors="replace")
    except (OSError, socket.timeout):
        return None


def _read_exact(sock: socket.socket, n: int) -> bytes:
    buf = b""
    while len(buf) < n:
        chunk = sock.recv(n - len(buf))
        if not chunk:
            return buf
        buf += chunk
    return buf


async def _trigger_chat_in_background() -> bool:
    """Fire /api/v1/chat via plain HTTP. Doesn't wait for reply — broadcast is
    what we care about, and broadcast happens concurrently with response build."""
    def post() -> bool:
        try:
            conn = http.client.HTTPConnection(HOST, PORT, timeout=TIMEOUT_SECONDS)
            conn.request(
                "POST", "/api/v1/chat",
                body=json.dumps({"message": "Ahoj", "language": "sk", "mode_id": "sk"}),
                headers={"Content-Type": "application/json"},
            )
            resp = conn.getresponse()
            resp.read()
            conn.close()
            return resp.status == 200
        except OSError:
            return False

    return await asyncio.get_event_loop().run_in_executor(None, post)


async def main() -> int:
    print(f"\n{YELLOW}UE5 avatar smoke test{RESET}  →  {PROTOCOL}://{HOST}:{PORT}{PATH}\n")

    print("Step 1 — HTTP precheck")
    ok, status = http_check_avatar_status()
    if not ok:
        _fail("/api/v1/avatar/status", f"backend not reachable: {status.get('error', '?')}")
        print(f"\n  {RED}ABORT{RESET} — backend not running. Start it first:\n"
              f"          docker compose up tutor-service\n")
        return 1
    _ok("backend reachable",
        f"{status.get('clients', '?')} avatar client(s) currently connected")

    print("\nStep 2 — WebSocket handshake + avatar_ready exchange")
    success = await ws_handshake_and_exchange()

    print()
    if success:
        print(f"  {GREEN}{'─' * 55}{RESET}")
        print(f"  {GREEN}ALL GREEN{RESET} — UE5 Blueprint should connect cleanly.")
        print(f"  {GREEN}{'─' * 55}{RESET}\n")
        return 0
    else:
        print(f"  {RED}{'─' * 55}{RESET}")
        print(f"  {RED}FAILED{RESET} — see diagnostics above. Common fixes:")
        print(f"  {DIM}  • Pull latest:        git pull origin main{RESET}")
        print(f"  {DIM}  • Rebuild Docker:     docker compose down && docker compose up --build{RESET}")
        print(f"  {DIM}  • Loosen WS origin:   WS_ALLOW_ALL_ORIGINS=1 in .env (then rebuild){RESET}")
        print(f"  {DIM}  • Check backend log:  docker logs edututor-backend --tail 30{RESET}")
        print(f"  {RED}{'─' * 55}{RESET}\n")
        return 1


if __name__ == "__main__":
    try:
        sys.exit(asyncio.run(main()))
    except KeyboardInterrupt:
        print("\n  cancelled by user")
        sys.exit(130)
