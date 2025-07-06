from kivy.lang import Builder
from kivymd.app import MDApp
from kivy.uix.screenmanager import ScreenManager, Screen
from kivymd.uix.list import OneLineListItem
from kivy.clock import Clock
from kivymd.toast import toast

from cryptography.fernet import Fernet

import asyncio
import websockets

KV = '''
ScreenManager:
    NickScreen:
    ChatScreen:

<NickScreen>:
    name: "nick"
    MDBoxLayout:
        orientation: "vertical"
        padding: "20dp"
        spacing: "20dp"
        MDLabel:
            text: "Введите ваш ник:"
            halign: "center"
            font_style: "H5"
        MDTextField:
            id: nick_input
            hint_text: "Ник"
            max_text_length: 20
            pos_hint: {"center_x": .5}
            size_hint_x: 0.8
        MDRaisedButton:
            text: "Войти"
            pos_hint: {"center_x": .5}
            on_release:
                app.set_nick(nick_input.text)

<ChatScreen>:
    name: "chat"
    MDBoxLayout:
        orientation: 'vertical'

        MDTopAppBar:
            title: "Мессенджер"
            elevation: 10
            left_action_items: [["phone", lambda x: app.start_call()]]
            right_action_items: [["logout", lambda x: app.logout()]]

        ScrollView:
            MDList:
                id: messages_list

        MDBoxLayout:
            size_hint_y: None
            height: "56dp"
            padding: "8dp"
            spacing: "8dp"

            MDTextField:
                id: message_input
                hint_text: "Введите сообщение"
                multiline: False

            MDRaisedButton:
                text: "Отправить"
                on_release: app.send_message()
'''

class NickScreen(Screen):
    pass

class ChatScreen(Screen):
    pass

class MessengerApp(MDApp):
    def build(self):
        self.title = "Шифрованный Мессенджер"
        self.nickname = None
        self.key = Fernet.generate_key()
        self.cipher = Fernet(self.key)
        self.ws = None
        self.loop = asyncio.get_event_loop()
        return Builder.load_string(KV)

    def set_nick(self, nick):
        nick = nick.strip()
        if not nick:
            toast("Ник не может быть пустым")
            return
        self.nickname = nick
        self.root.current = "chat"
        # Запуск подключения к серверу в отдельном потоке
        self.loop.create_task(self.connect_to_server())

    async def connect_to_server(self):
        uri = "ws://localhost:8000/ws"  # поменяй на свой сервер
        try:
            self.ws = await websockets.connect(uri)
            await self.ws.send(self.cipher.encrypt(f"[{self.nickname}] присоединился".encode()).decode())
            asyncio.create_task(self.receive_messages())
        except Exception as e:
            toast(f"Ошибка подключения: {e}")

    async def receive_messages(self):
        try:
            async for message in self.ws:
                decrypted = self.cipher.decrypt(message.encode()).decode()
                Clock.schedule_once(lambda dt: self.display_message(decrypted))
        except Exception as e:
            Clock.schedule_once(lambda dt: toast(f"Ошибка: {e}"))

    def display_message(self, message):
        chat_screen = self.root.get_screen("chat")
        chat_screen.ids.messages_list.add_widget(OneLineListItem(text=message))

    def send_message(self):
        msg_input = self.root.get_screen("chat").ids.message_input
        msg = msg_input.text.strip()
        if msg and self.ws:
            full_msg = f"[{self.nickname}]: {msg}"
            encrypted = self.cipher.encrypt(full_msg.encode()).decode()
            asyncio.create_task(self.ws.send(encrypted))
            msg_input.text = ""

    def start_call(self):
        toast("Звонок... (имитация)")

    def logout(self):
        if self.ws:
            asyncio.create_task(self.ws.close())
        self.nickname = None
        self.root.current = "nick"

if __name__ == "__main__":
    MessengerApp().run()
