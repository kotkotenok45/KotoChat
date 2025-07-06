import asyncio
import websockets
import json
from kivy.lang import Builder
from kivy.clock import Clock
from kivy.core.window import Window
from kivymd.app import MDApp
from kivymd.uix.screen import MDScreen
from kivymd.uix.textfield import MDTextField
from kivymd.uix.button import MDRaisedButton
from kivymd.uix.label import MDLabel
from kivymd.uix.boxlayout import MDBoxLayout
from kivymd.uix.scrollview import MDScrollView
from kivymd.uix.toolbar import MDTopAppBar
import base64

# Настройка окна (для отладки на ПК)
Window.size = (400, 700)

# Вставь адрес сервера здесь:
WS_URL = "wss://example.onrender.com"  # ← измени на свой!

# Укажи ник:
USER_NICK = "kotkotenok43"  # ← можно сделать поле ввода

KV = '''
MDScreen:
    MDBoxLayout:
        orientation: 'vertical'

        MDTopAppBar:
            title: "KotoMessenger"
            elevation: 5

        MDScrollView:
            id: scroll
            MDBoxLayout:
                id: chat_box
                orientation: 'vertical'
                adaptive_height: True
                padding: 10
                spacing: 10

        MDBoxLayout:
            size_hint_y: None
            height: "60dp"
            padding: 5
            spacing: 5

            MDTextField:
                id: msg_input
                hint_text: "Введите сообщение"
                mode: "rectangle"
                size_hint_x: 0.85

            MDRaisedButton:
                text: "Отправить"
                size_hint_x: 0.15
                on_release: app.send_message()
'''


class MessengerApp(MDApp):
    def build(self):
        self.root = Builder.load_string(KV)
        Clock.schedule_once(lambda dt: asyncio.ensure_future(self.connect()))
        return self.root

    async def connect(self):
        try:
            self.ws = await websockets.connect(WS_URL)
            asyncio.create_task(self.receive_messages())
        except Exception as e:
            self.add_message(f"[Ошибка подключения]: {e}")

    def add_message(self, text):
        label = MDLabel(text=text, size_hint_y=None, height=self.get_label_height(text), halign="left")
        self.root.ids.chat_box.add_widget(label)
        Clock.schedule_once(lambda dt: self.root.ids.scroll.scroll_to(label))

    def get_label_height(self, text):
        lines = text.count('\n') + 1
        return 20 * lines + 10

    def send_message(self):
        text = self.root.ids.msg_input.text.strip()
        if text and hasattr(self, "ws"):
            encrypted = base64.b64encode(text.encode()).decode()
            data = json.dumps({
                "user": USER_NICK,
                "message": encrypted
            })
            asyncio.create_task(self.ws.send(data))
            self.root.ids.msg_input.text = ""

    async def receive_messages(self):
        try:
            async for msg in self.ws:
                try:
                    data = json.loads(msg)
                    user = data.get("user", "???")
                    enc_msg = data.get("message", "")
                    decoded = base64.b64decode(enc_msg).decode()
                    self.add_message(f"[{user}]: {decoded}")
                except:
                    self.add_message("[Ошибка]: не удалось расшифровать сообщение")
        except:
            self.add_message("[Отключение от сервера]")

if __name__ == "__main__":
    asyncio.run(MessengerApp().async_run(async_lib="asyncio"))
