from PIL import Image
import numpy as np
import os
from collections import deque

HERE = os.path.dirname(os.path.abspath(__file__))

in_files = [
    os.path.join(HERE, "サイレントメイト君_差分0.png"),
]

def floodfill_background_to_transparent(img: Image.Image, tol=35):
    """
    外周からフラッドフィルして背景領域を抽出し、その領域を完全透明化(α=0)する。
    tol: 背景色の許容差（大きいほどグレーまで消えるが、消しすぎリスクも上がる）
    """
    rgba = img.convert("RGBA")
    arr = np.array(rgba)
    h, w = arr.shape[:2]

    rgb = arr[..., :3].astype(np.int16)

    # 背景色の基準：左上ピクセル（ほぼ白背景想定）
    base = rgb[0, 0]

    def close_to_base(y, x):
        return np.max(np.abs(rgb[y, x] - base)) <= tol

    visited = np.zeros((h, w), dtype=np.uint8)
    q = deque()

    # 外周を全部スタート地点として追加
    for x in range(w):
        q.append((0, x))
        q.append((h - 1, x))
    for y in range(h):
        q.append((y, 0))
        q.append((y, w - 1))

    # BFSフラッドフィル
    while q:
        y, x = q.popleft()
        if visited[y, x]:
            continue
        visited[y, x] = 1

        if not close_to_base(y, x):
            continue

        # 4近傍
        if y > 0:
            q.append((y - 1, x))
        if y < h - 1:
            q.append((y + 1, x))
        if x > 0:
            q.append((y, x - 1))
        if x < w - 1:
            q.append((y, x + 1))

    # 背景マスク（外周から到達できた領域）
    bg_mask = (visited == 1)

    # 背景を完全透明化
    arr[..., 3][bg_mask] = 0

    return Image.fromarray(arr, "RGBA")

for p in in_files:
    img = Image.open(p)
    out = floodfill_background_to_transparent(img, tol=35)

    base, ext = os.path.splitext(p)
    out_path = base + "_bg_floodfill_transparent.png"
    out.save(out_path, "PNG")
    print("saved:", out_path)
