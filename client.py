# client.py
from kivy.lang import Builder
from kivymd.app import MDApp
from kivy.uix.screenmanager import ScreenManager, Screen
from kivymd.uix.list import OneLineListItem
from kivy.clock import Clock
import asyncio
import websockets

KV = '''
ScreenManager:
    LoginScreen:
    ChatScreen:

<LoginScreen>:
    name: "login"
    MDBoxLayout:
        orientation: 'vertical'
        padding: dp(40)
        spacing: dp(20)
        MDLabel:
            text: "Введите имя"
            halign: "center"
            font_style: "H4"
        MDTextField:
            id: username
            hint_text: "Имя"
            size_hint_x: 1
            pos_hint: {"center_x": 0.5}
            multiline: False
        MDRaisedButton:
            text: "Войти"
            pos_hint: {"center_x": 0.5}
            on_release:
                app.login(username.text)

<ChatScreen>:
    name: "chat"
    MDBoxLayout:
        orientation: 'vertical'
        MDToolbar:
            title: "Мессенджер"
            elevation: 10
        ScrollView:
            MDList:
                id: messages
        MDBoxLayout:
            size_hint_y: None
            height: "48dp"
            padding: dp(10)
            spacing: dp(10)
            MDTextField:
                id: message_input
                hint_text: "Введите сообщение"
                multiline: False
            MDRaisedButton:
                text: "Отправить"
                on_release: app.send_message()
'''

class LoginScreen(Screen):
    pass

class ChatScreen(Screen):
    pass

class MessengerApp(MDApp):
    def build(self):
        self.sm = Builder.load_string(KV)
        self.username = None
        self.ws = None
        return self.sm

    def login(self, username):
        if username.strip():
            self.username = username.strip()
            self.sm.current = "chat"
            asyncio.create_task(self.connect())

    async def connect(self):
        url = f"ws://localhost:8000/ws/{self.username}"  # Замени localhost на адрес сервера
        try:
            self.ws = await websockets.connect(url)
            asyncio.create_task(self.receive())
        except Exception as e:
            self.show_message(f"Ошибка подключения: {e}")

    async def receive(self):
        try:
            async for message in self.ws:
                self.show_message(message)
        except Exception as e:
            self.show_message(f"Соединение прервано: {e}")

    def show_message(self, text):
        def add(_):
            messages = self.sm.get_screen("chat").ids.messages
            messages.add_widget(OneLineListItem(text=text))
        Clock.schedule_once(add)

    def send_message(self):
        msg_input = self.sm.get_screen("chat").ids.message_input
        text = msg_input.text.strip()
        if text and self.ws:
            asyncio.create_task(self.ws.send(text))
            self.show_message(f"Я: {text}")
            msg_input.text = ""

if __name__ == '__main__':
    import asyncio
    asyncio.run(MessengerApp().async_run(async_lib="asyncio"))
