import os
import datetime
import threading
import pyautogui
import cv2
import numpy as np
import keyboard  # 用于监听键盘

class ScreenTool:
    def __init__(self, save_dir="screenshots"):
        self.save_dir = save_dir
        os.makedirs(save_dir, exist_ok=True)
        self.recording = False
        self.record_thread = None
        print("🧩 ScreenTool 已启动。使用以下热键操作：")
        print("  Shift + E  → 截图")
        print("  Shift + R  → 开始录屏")
        print("  Shift + T  → 停止录屏")
        print("  ESC        → 退出程序\n")


    def take_screenshot(self):
        """截图保存"""
        ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        path = os.path.join(self.save_dir, f"screenshot_{ts}.png")
        pyautogui.screenshot(path)
        print(f"📸 截图已保存：{path}")
        return path

    def start_recording(self):
        """开始录屏"""
        if self.recording:
            print("⚠️ 已在录屏中。")
            return None
        self.recording = True
        ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        self.filepath = os.path.join(self.save_dir, f"record_{ts}.avi")
        self.record_thread = threading.Thread(target=self._record_screen)
        self.record_thread.start()
        print(f"🎥 开始录屏：{self.filepath}")
        return self.filepath

    def stop_recording(self):
        """停止录屏"""
        if not self.recording:
            print("⚠️ 当前没有录屏任务。")
            return None
        self.recording = False
        if self.record_thread:
            self.record_thread.join()
        print("⏹ 已停止录屏。")
        return self.filepath

    def _record_screen(self):
        screen_size = pyautogui.size()
        fourcc = cv2.VideoWriter_fourcc(*"XVID")
        out = cv2.VideoWriter(self.filepath, fourcc, 20.0, screen_size)
        while self.recording:
            img = pyautogui.screenshot()
            frame = np.array(img)
            frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            out.write(frame)
        out.release()

def main():
    tool = ScreenTool()

    # 注册热键
    keyboard.add_hotkey("shift+e", tool.take_screenshot)  # 截图
    keyboard.add_hotkey("shift+r", tool.start_recording)  # 开始录屏
    keyboard.add_hotkey("shift+t", tool.stop_recording)   # 停止录屏
    keyboard.wait("esc")  # 退出
    print("👋 已退出程序。")

if __name__ == "__main__":
    main()
