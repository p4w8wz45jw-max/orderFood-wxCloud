path = r'c:\Users\mac\Desktop\点餐系统\miniprogram\pages\settle\settle.js'

with open(path, 'rb') as f:
    raw = f.read()

lines = raw.split(b'\n')

# Line-by-line fixes (line_number: correct_utf8_text)
fixes = {
    31: '    selectedTime: \'立即\',',
    39: '    // 拼团相关',
    42: '    shopIsOpen: true,     // 新增：店铺营业状态',
    78: '        // 地址更新后重新验证拼团',
    82: '      // 即使没有新选地址，如果有拼团信息也需要验证',
    87: '  // 检查并加载拼团信息',
    92: '    // 异步验证拼团是否仍然有效',
    110: '        wx.showToast({ title: \'该拼团活动已结束\', icon: \'none\' })',
    117: '      // 使用收货地址验证距离',
    125: '          wx.showToast({ title: \'收货地址不在拼团范围内，优惠失效\', icon: \'none\' })',
    132: '      // 注：没有地址时不清除拼团优惠——用户在拼团页已验证过距离',
    144: '      console.error(\'验证拼团失败\', err)',
    147: '      // 重新计算最终价格',
    154: '  // 计算两点距离（Haversine公式）',
    173: '        else this.setData({ selectedTime: \'立即\' })',
    175: '        this.setData({ selectedTime: \'立即\' })',
    177: '    } catch (err) { console.error(\'加载时间段失败\', err) }',
    183: '      wx.showToast({ title: \'暂无可选时段\', icon: \'none\' })',
    187: '      itemList: [\'立即\', ...timeSlots],',
    189: '        let newTime = \'立即\'',
    190: '        if (res.tapIndex === 0) newTime = \'立即\'',
    200: '        title: \'地址不完整\',',
    201: '        content: \'该地址缺少位置信息，无法计算配送费，请编辑后重新选择\',',
    202: '        confirmText: \'去编辑\',',
    235: '          shopName: shop.name || \'店铺\',',
    239: '          shopIsOpen: shop.isOpen !== false   // 新增：未设置时默认营业',
    286: '        wx.showToast({ title: \'购物车为空\', icon: \'none\' })',
    290: '      console.error(\'加载购物车数据失败\', err)',
    291: '      wx.showToast({ title: \'加载失败\', icon: \'none\' })',
    342: '    } catch (err) { console.error(\'加载优惠券失败\', err) }',
    356: '      wx.showToast({ title: \'暂无可用的优惠券\', icon: \'none\' })',
    367: '    wx.showToast({ title: `已优惠\\u00a5${discount.toFixed(2)}`, icon: \'success\' })',
    415: '      console.log(`订单总额 ${totalPrice} 满足免配送费条件（门槛${freeDeliveryThreshold}），配送费为0`)',
    435: '        title: \'超出配送范围\',',
    436: '        content: `您的地址距离本店 ${Math.round(distance/1000)} 公里，超出最大配送范围（${Math.round(maxDist/1000)} 公里）。请选择堂食或更换地址。`,',
    437: '        confirmText: \'我知道了\', showCancel: false',
    482: '          title: \'余额不足\',',
    483: '          content: `您的余额为\\u00a5${userBalance}，订单需支付\\u00a5${totalPay}。是否使用余额支付\\u00a5${userBalance}，剩余\\u00a5${(totalPay - userBalance).toFixed(2)}使用微信支付？`,',
    484: '          confirmText: \'确定\',',
    485: '          cancelText: \'取消\',',
    541: '      // 有会员卡（已充值）→ 优先选择余额支付',
    545: '        // 余额不足 → 仍默认余额支付，用户点击提交时会提示切换',
    549: '      // 没有会员卡（未充值）→ 默认微信支付',
    564: '    wx.showToast({ title: newType === \'dineIn\' ? \'已切换至堂食/自取\' : \'已切换至外卖配送\', icon: \'success\', duration: 1500 })',
    575: '    } catch (err) { console.error(\'通知商家失败\', err) }',
    578: '  // ========== 抽奖弹窗 ==========',
    588: '        popupText = \'获得一次免费抽奖机会！\'',
    589: '        if (hasChance) console.log(\'已达到抽奖门槛，赠送一次抽奖机会\')',
    591: '        popupText = \'感谢您的光临！\'',
    613: '          confirmText: \'去抽奖\',',
    636: '      wx.showToast({ title: `本店满${minDeliveryAmount}元起送，当前商品总额${totalPrice}元`, icon: \'none\' })',
    644: '        confirmText: \'去凑单\',',
    662: '        title: \'店铺已打烊\',',
    664: '        content: \'店铺当前已闭店，暂时无法下单，请稍后再来。\',',
    665: '        showCancel: false,',
    686: '        wx.showToast({ title: `本店满${minDeliveryAmount}元起送，当前商品总额${totalPrice}元`, icon: \'none\' })',
    712: '          content: `您的余额为\\u00a5${userBalance.toFixed(2)}，订单需支付\\u00a5${totalPay.toFixed(2)}。是否使用余额支付\\u00a5${userBalance.toFixed(2)}，剩余\\u00a5${(totalPay - userBalance).toFixed(2)}使用微信支付？`,',
    726: '      // 获取邀请人信息',
    728: '    wx.showLoading({ title: \'下单中...\' })',
    755: '      const outTradeNo = doBuyRes.result.outTradeNo   // 关键：唯一订单号',
    771: '          wx.showLoading({ title: \'拉起支付中...\' })',
    778: '              totalFee: finalWechatPay * 100,       // 元转分',
}

# Also need to handle line 45 specially - the data closing brace
# Line 44 is '  },' and line 45 is '  USE_MOCK_PAY: false,   // 真实支付，不使用模拟'
# Check if line 44 needs a fix too
line44_bytes = lines[43]  # 0-indexed
print(f"Line 44 bytes: {line44_bytes[:50]}")
line45_bytes = lines[44]
print(f"Line 45 bytes: {line45_bytes[:50]}")

fixed_lines = []
for i, line in enumerate(lines, 1):
    if i in fixes:
        new_line = fixes[i].encode('utf-8')
        fixed_lines.append(new_line)
        print(f"Line {i}: FIXED")
    else:
        fixed_lines.append(line)

result = b'\n'.join(fixed_lines)

with open(path, 'wb') as f:
    f.write(result)

print(f"\nTotal lines: {len(lines)}, Fixed: {len(fixes)}")
print("Done!")
