"""批量替换所有页面的 onShareAppMessage / onShareTimeline 模板为统一品牌卡版本。
模板：title:'餐饮点餐 - 美味即刻送达' path:'/pages/index/index'  -> 默认 share
"""
import os, re, sys

ROOT = r'c:\Users\mac\Desktop\点餐系统\miniprogram'
TARGETS = [
    os.path.join(ROOT, 'pages'),
    os.path.join(ROOT, 'pages-sub')
]

# 找到所有含'餐饮点餐 - 美味即刻送达'的js文件
hit_files = []
for root in TARGETS:
    for dirpath, _, files in os.walk(root):
        for fn in files:
            if not fn.endswith('.js'): continue
            fp = os.path.join(dirpath, fn)
            with open(fp, encoding='utf-8') as f:
                t = f.read()
            if '餐饮点餐 - 美味即刻送达' in t:
                hit_files.append(fp)

# 一些页面带专属 path/title，需要按文件区分
SPECIAL_PATH = {
    'edit.js': '/pages/order/edit',
    'list.js': '/pages/order/list',
    'order.js': '/pages/order/order',
    'orderDetail.js': '/pages/orderDetail/orderDetail',
    'myorder.js': '/pages/myorder/myorder',
    'myhome.js': '/pages/myhome/myhome',
    'settle.js': '/pages/settle/settle',
    'lottery.js': '/pages/lottery/lottery',
    'recharge.js': '/pages/recharge/recharge',
    'invite.js': '/pages/invite/invite',
    'diy.js': '/pages/diy/diy',
    'pointMall.js': '/pages/pointMall/pointMall',
    'seckill.js': '/pages/seckill/seckill',
    'notice.js': '/pages/notice/notice',
    'tableCode.js': '/pages/tableCode/tableCode',
}
SPECIAL_TITLE = {
    'myorder.js': '我的订单 - 餐饮点餐',
    'myhome.js': '我的 - 餐饮点餐',
    'order.js': '订单详情 - 餐饮点餐',
    'orderDetail.js': '订单详情 - 餐饮点餐',
    'settle.js': '订单结算 - 餐饮点餐',
    'lottery.js': '幸运抽奖 - 餐饮点餐',
    'recharge.js': '余额充值 - 餐饮点餐',
    'invite.js': '邀请好友 - 餐饮点餐',
    'diy.js': 'DIY 自选 - 餐饮点餐',
    'pointMall.js': '积分商城 - 餐饮点餐',
    'seckill.js': '限时秒杀 - 餐饮点餐',
    'notice.js': '店铺公告 - 餐饮点餐',
    'edit.js': '编辑订单 - 餐饮点餐',
    'list.js': '订单列表 - 餐饮点餐',
    'tableCode.js': '桌码点餐 - 餐饮点餐',
}

# 通用默认
OLD_TEMPLATE = '''    return {
      title: '餐饮点餐 - 美味即刻送达',
      path: '/pages/index/index'
    }
  },

  onShareTimeline() {
    return {
      title: '餐饮点餐 - 美味即刻送达'
    }
  }'''

def new_for(fn):
    path = SPECIAL_PATH.get(fn, '/pages/index/index')
    title = SPECIAL_TITLE.get(fn, '餐饮点餐 - 美味即刻送达')
    if title == '餐饮点餐 - 美味即刻送达':
        return '''    return require('%s').defaultShareAppMessage()
  },

  onShareTimeline() {
    return require('%s').defaultShareTimeline()
  }''' % (rel(fn, False), rel(fn, True))
    return '''    return require('%s').shareMessage({ title: '%s', path: '%s' })
  },

  onShareTimeline() {
    return require('%s').shareTimelineMessage({ title: '%s' })
  }''' % (rel(fn, False), title, path, rel(fn, True), title)

def rel(fn, is_timeline):
    # 文件在 pages/X/.. 下 require 用 ../../utils/share.js
    # 文件在 pages-sub/admin/X/.. 下 require 用 ../../../utils/share.js
    if 'pages-sub' in fn:
        return '../../../utils/share.js'
    return '../../utils/share.js'

count = 0
for fp in hit_files:
    fn = os.path.basename(fp)
    with open(fp, encoding='utf-8') as f:
        s = f.read()
    if OLD_TEMPLATE not in s:
        print(f'[skip] {fp}')
        continue
    s2 = s.replace(OLD_TEMPLATE, new_for(fn))
    with open(fp, 'w', encoding='utf-8') as f:
        f.write(s2)
    count += 1
    print(f'[ok]   {fp}')

print(f'\nTotal replaced: {count}')