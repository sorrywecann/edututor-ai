"""Diagnostic: forward [::1]:8000 -> 127.0.0.1:8000 so IPv6-only clients reach the backend."""
import asyncio


async def pipe(reader, writer):
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


async def handle(client_reader, client_writer):
    peer = client_writer.get_extra_info("peername")
    print(f"[fwd] connect from {peer}")
    try:
        backend_reader, backend_writer = await asyncio.open_connection("127.0.0.1", 8000)
    except Exception as e:
        print(f"[fwd] backend connect failed: {e}")
        client_writer.close()
        return
    await asyncio.gather(
        pipe(client_reader, backend_writer),
        pipe(backend_reader, client_writer),
    )


async def main():
    import socket
    sock = socket.socket(socket.AF_INET6)
    sock.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 1)
    sock.bind(("::1", 8000))
    sock.listen(128)
    sock.setblocking(False)
    server = await asyncio.start_server(handle, sock=sock)
    print("[fwd] listening on [::1]:8000  ->  127.0.0.1:8000")
    async with server:
        await server.serve_forever()


asyncio.run(main())
