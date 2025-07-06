import os
import asyncio
import websockets

PORT = int(os.environ.get("PORT", 8000))

connected = set()

async def handler(websocket):
    connected.add(websocket)
    try:
        async for message in websocket:
            # Рассылаем всем кроме отправителя
            for conn in connected:
                if conn != websocket:
                    await conn.send(message)
    except websockets.ConnectionClosed:
        pass
    finally:
        connected.remove(websocket)

async def main():
    async with websockets.serve(handler, "0.0.0.0", PORT):
        print(f"Server started on port {PORT}")
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    asyncio.run(main())
