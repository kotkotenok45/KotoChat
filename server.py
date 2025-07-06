import os
import asyncio
import websockets
from aiohttp import web

connected = set()
PORT = int(os.environ.get("PORT", 8000))

# WebSocket handler
async def ws_handler(websocket):
    connected.add(websocket)
    try:
        async for message in websocket:
            for conn in connected:
                if conn != websocket:
                    await conn.send(message)
    except websockets.ConnectionClosed:
        pass
    finally:
        connected.remove(websocket)

# Aiohttp endpoint to respond to GET / (for Render's health check)
async def health_check(request):
    return web.Response(text="WebSocket server is running!")

# Start both HTTP and WebSocket server
async def main():
    # Start WebSocket server
    ws_server = await websockets.serve(ws_handler, "0.0.0.0", PORT)

    # Start HTTP server
    app = web.Application()
    app.router.add_get("/", health_check)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", PORT)
    await site.start()

    print(f"Server running on port {PORT}")
    await asyncio.Future()  # run forever

if __name__ == "__main__":
    asyncio.run(main())
