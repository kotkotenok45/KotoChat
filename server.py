# server.py
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# Разрешаем подключение с клиента (замени * на домен, если хочешь)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

connections = {}

@app.websocket("/ws/{username}")
async def websocket_endpoint(websocket: WebSocket, username: str):
    await websocket.accept()
    connections[username] = websocket
    try:
        while True:
            data = await websocket.receive_text()
            # Для простоты рассылаем сообщение всем, кроме отправителя
            for user, conn in connections.items():
                if user != username:
                    await conn.send_text(f"{username}: {data}")
    except WebSocketDisconnect:
        del connections[username]
