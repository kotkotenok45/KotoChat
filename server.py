import os
import asyncio
import websockets
from aiohttp import web

connected_clients = set()
PORT = int(os.environ.get("PORT", 8000))

# WebSocket обработка
async def ws_handler(websocket):
    connected_clients.add(websocket)
    try:
        async for message in websocket:
            for client in connected_clients:
                if client != websocket:
                    await client.send(message)
    except websockets.ConnectionClosed:
        pass
    finally:
        connected_clients.remove(websocket)

# HTTP-запрос для проверки Render'ом
async def handle_healthcheck(request):
    return web.Response(text="Server is alive")

# Основной запуск
async def main():
    # WebSocket
    ws_server = await websockets.serve(ws_handler, "0.0.0.0", PORT)

    # HTTP для Render (обязателен!)
    app = web.Application()
    app.router.add_get("/", handle_healthcheck)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", PORT)
    await site.start()

    print(f"Сервер запущен на порту {PORT}")
    await asyncio.Future()  # бесконечный цикл
python server.py

if __name__ == "__main__":
    asyncio.run(main())
