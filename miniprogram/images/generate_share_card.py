"""生成微信小程序分享卡片 PNG（1285x964，<=128KB）。

设计：
- 主色：项目 globalData.themeColor 暖棕 #B8956E，搭配深棕 #8A6B4A 与奶白 #FFF6E9
- 渐变背景 + 圆角装饰 + 主标题（店名） + 副标题（slogan） + 装饰文案 + 二维码占位
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os

W, H = 1285, 964
PRIMARY = (184, 149, 110)      # #B8956E
PRIMARY_DARK = (138, 107, 74)  # #8A6B4A
PRIMARY_LIGHT = (255, 246, 233)  # #FFF6E9
ACCENT = (214, 96, 54)         # #D66036
INK = (60, 40, 25)             # 主文字
INK_SOFT = (110, 88, 70)

OUT = os.path.join(os.path.dirname(__file__), 'share-card.png')


def gradient(size, top, bottom):
    """垂直渐变"""
    w, h = size
    img = Image.new('RGB', size, top)
    px = img.load()
    for y in range(h):
        t = y / (h - 1)
        r = int(top[0] * (1 - t) + bottom[0] * t)
        g = int(top[1] * (1 - t) + bottom[1] * t)
        b = int(top[2] * (1 - t) + bottom[2] * t)
        for x in range(w):
            px[x, y] = (r, g, b)
    return img


def rounded_mask(size, radius):
    m = Image.new('L', size, 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius=radius, fill=255)
    return m


def find_font(size, bold=False):
    candidates = [
        r'C:\Windows\Fonts\msyhbd.ttc' if bold else r'C:\Windows\Fonts\msyh.ttc',
        r'C:\Windows\Fonts\simhei.ttf',
        r'C:\Windows\Fonts\simsun.ttc',
        r'/System/Library/Fonts/PingFang.ttc',
    ]
    for p in candidates:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def draw_circle_food(d, cx, cy, r, color, accent_color):
    """画一个'圆盘'装饰：暖色圆 + 食物剪影"""
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=color)
    # 内圈高光
    d.ellipse((cx - r * 0.85, cy - r * 0.85, cx + r * 0.15, cy + r * 0.15),
              fill=tuple(min(255, c + 18) for c in color))
    # 装饰小点（'食材'）
    for i, (dx, dy, sz) in enumerate([(r*0.3, -r*0.2, r*0.18),
                                      (-r*0.2, r*0.3, r*0.14),
                                      (r*0.4, r*0.35, r*0.1)]):
        d.ellipse((cx + dx - sz, cy + dy - sz, cx + dx + sz, cy + dy + sz),
                  fill=accent_color if i % 2 == 0 else PRIMARY_LIGHT)


def main():
    # 1. 渐变背景
    bg = gradient((W, H), PRIMARY_LIGHT, (243, 224, 198))

    # 2. 顶部装饰弧（深棕圆）
    overlay = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    # 左上 大圆（半遮挡）
    od.ellipse((-200, -260, 520, 460), fill=(*PRIMARY, 255))
    # 右下 小圆
    od.ellipse((W - 360, H - 220, W + 80, H + 220), fill=(*PRIMARY_DARK, 200))
    # 中部装饰条
    od.rectangle((0, H - 240, W, H), fill=(*PRIMARY, 255))
    # 顶部小色块（品牌识别）
    od.rectangle((0, 0, W, 12), fill=(*PRIMARY_DARK, 255))
    bg.paste(overlay, (0, 0), overlay)

    # 3. 在左上圆上画'logo'：一个餐盘
    d = ImageDraw.Draw(bg)
    draw_circle_food(d, 200, 200, 130, PRIMARY_LIGHT, ACCENT)
    # 筷子小图标
    d.rectangle((280, 90, 295, 320), fill=PRIMARY_DARK)
    d.rectangle((305, 90, 320, 320), fill=PRIMARY_DARK)

    # 4. 主标题（店名占位） + 副标题
    title_font = find_font(120, bold=True)
    sub_font = find_font(54)
    small_font = find_font(40)
    tag_font = find_font(44, bold=True)

    title = '美食在线'
    # 文字阴影
    d.text((82, 422), title, font=title_font, fill=(255, 255, 255, 60))
    d.text((80, 420), title, font=title_font, fill=INK)

    sub = '新鲜现做 · 30 分钟极速送达'
    d.text((82, 560), sub, font=sub_font, fill=INK_SOFT)

    # 5. 标签徽章
    badges = ['堂食', '外卖', '会员折扣']
    bx = 82
    by = 660
    for b in badges:
        tw = d.textlength(b, font=tag_font)
        bw = int(tw) + 60
        d.rounded_rectangle((bx, by, bx + bw, by + 76), radius=38,
                            fill=ACCENT)
        d.text((bx + 30, by + 12), b, font=tag_font, fill=PRIMARY_LIGHT)
        bx += bw + 18

    # 6. 底部信息条（白底半透明感，用 PRIMARY_LIGHT 替换）
    d.rectangle((0, H - 240, W, H), fill=PRIMARY_LIGHT)
    d.rectangle((0, H - 240, W, H - 232), fill=PRIMARY_DARK)

    # 二维码占位
    qr_size = 168
    qr_x, qr_y = 82, H - 200
    d.rounded_rectangle((qr_x - 8, qr_y - 8, qr_x + qr_size + 8, qr_y + qr_size + 8),
                        radius=14, fill=PRIMARY_LIGHT)
    d.rounded_rectangle((qr_x, qr_y, qr_x + qr_size, qr_y + qr_size),
                        radius=10, fill=INK)
    # 二维码内点阵装饰
    cell = qr_size // 9
    for i in range(9):
        for j in range(9):
            if (i * 7 + j * 3) % 5 < 2:
                d.rectangle((qr_x + i * cell, qr_y + j * cell,
                             qr_x + (i + 1) * cell - 1, qr_y + (j + 1) * cell - 1),
                            fill=PRIMARY_LIGHT)

    # 底部文案
    foot1_font = find_font(46, bold=True)
    foot2_font = find_font(34)
    d.text((290, H - 180), '长按识别 · 立即点餐', font=foot1_font, fill=INK)
    d.text((290, H - 116), '新人首单立减  ·  会员充值送豪礼',
           font=foot2_font, fill=INK_SOFT)
    d.text((290, H - 72), '每天 10:00-22:00 在线服务',
           font=foot2_font, fill=INK_SOFT)

    # 7. 保存
    bg.save(OUT, 'PNG', optimize=True)
    sz = os.path.getsize(OUT)
    print(f'OUT = {OUT}')
    print(f'SIZE = {W}x{H}, {sz/1024:.1f} KB')
    assert sz < 128 * 1024, f'图片过大 {sz} bytes，需压缩'


if __name__ == '__main__':
    main()