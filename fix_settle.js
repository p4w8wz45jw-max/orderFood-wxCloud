const fs = require('fs');
const path = 'c:/Users/mac/Desktop/点餐系统/miniprogram/pages/settle/settle.js';
let content = fs.readFileSync(path, 'utf8');

// Replace garbled characters using hex escape sequences
const garbled = [
  '\u9386\u7089\u7444\u0000\u0000\u0000\u0000',
];

// Read the file as buffer to handle exact byte matching
const buf = fs.readFileSync(path);
let str = buf.toString('utf8');

// Fix specific known garbled patterns
const fixes = [
  // line 591: popupText = '感谢您的光临！'
  { old: '\u9386\u7089\u7444\u0000\u0000', fix: '感谢您的光临！' },
];

// Simpler approach: just fix known lines
const lines = str.split('\n');
const fixedLines = lines.map(line => {
  // Detect garbled characters (common patterns)
  if (line.includes('鎰熻阿')) return line.replace(/鎰熻阿.*/, "        popupText = '感谢您的光临！'");
  if (line.includes('鎭瓂')) return line.replace(/鎭瓂.*/, "          title: '恭喜',");
  if (line.includes('鍘绘娊')) return line.replace(/鍘绘娊.*/, "          confirmText: '去抽奖',");
  if (line.includes('璁㈠崟鏀')) return line.replace(/璁㈠崟鏀.*/, "        wx.showToast({ title: '订单支付成功', icon: 'success' })");
  if (line.includes('鏈簵婊')) {
    return line.replace(/鏈簵婊.*/, "      wx.showToast({ title: `本店满${minDeliveryAmount}元起送，当前商品总额${totalPrice}元`, icon: 'none' })");
  }
  if (line.includes('鍑戝崟鎻愰啋')) return line.replace(/鍑戝崟鎻愰啋.*/, "        title: '凑单提醒',");
  if (line.includes('杩樺樊')) return line.replace(/杩樺樊.*/, "        content: `还差${need}元即可获得一次免费抽奖机会，是否去凑单？`,");
  if (line.includes('鍘诲噾鍗?')) return line.replace(/鍘诲噾鍗?.*/, "        confirmText: '去凑单',");
  if (line.includes('鐩存帴缁撶畻')) return line.replace(/鐩存帴缁撶畻.*/, "        cancelText: '直接结算',");
  if (line.includes('搴楅摵宸叉墦鐑?')) return line.replace(/搴楅摵宸叉墦鐑?.*/, "        title: '店铺已打烊',");
  if (line.includes('搴楅摵褰撳墠宸查棴搴?')) return line.replace(/搴楅摵褰撳墠宸查棴搴?.*/, "        content: '店铺当前已闭店，暂时无法下单，请稍后再来。',");
  if (line.includes('鎴戠煡閬撲簡')) return line.replace(/鎴戠煡閬撲簡.*/, "        confirmText: '我知道了'");
  if (line.includes('璁㈠崟閲戦')) return line.replace(/璁㈠崟閲戦.*/, "      wx.showToast({ title: '订单金额异常', icon: 'none' })");
  if (line.includes('涓嬪崟涓?')) return line.replace(/涓嬪崟涓?.*/, "    wx.showLoading({ title: '下单中...' })");
  if (line.includes('鑾峰彇閭€璇蜂汉淇℃伅')) return line.replace(/鑾峰彇閭€璇蜂汉淇℃伅.*/, "      // 获取邀请人信息");
  if (line.includes('涓嬪崟澶辫触')) return line.replace(/涓嬪崟澶辫触/g, '下单失败');
  if (line.includes('鍏抽敭锛氬敮涓€璁㈠崟鍙?')) return line.replace(/鍏抽敭锛氬敮涓€璁㈠崟鍙?.*/, "      const outTradeNo = doBuyRes.result.outTradeNo   // 关键：唯一订单号");
  if (line.includes('娓呴櫎鎷煎洟淇℃伅')) return line.replace(/娓呴櫎鎷煎洟淇℃伅.*/, "      // 清除拼团信息");
  if (line.includes('涓嬪崟鎴愬姛')) return line.replace(/涓嬪崟鎴愬姛.*/, "          wx.showToast({ title: '下单成功', icon: 'success' })");
  if (line.includes('鎷夎捣鏀粯涓?')) return line.replace(/鎷夎捣鏀粯涓?.*/, "          wx.showLoading({ title: '拉起支付中...' })");
  if (line.includes('鐐归嵂璁㈠崟寰俊鏀粯')) return line.replace(/鐐归嵂璁㈠崟寰俊鏀粯.*/, "              body: `点餐订单微信支付¥${finalWechatPay}`,");
  if (line.includes('浣跨敤鏂拌鍗曞')) return line.replace(/浣跨敤鏂拌鍗曞.*/, "              outTradeNo: outTradeNo,                // 使用新订单号");
  if (line.includes('鍏冭浆鍒?')) return line.replace(/鍏冭浆鍒?.*/, "              totalFee: finalWechatPay * 100,       // 元转分");
  if (line.includes('鏀粯涓嬪崟澶辫触')) return line.replace(/鏀粯涓嬪崟澶辫触.*/, "          if (!payRes.result?.success) throw new Error(payRes.result.error || '支付下单失败')");
  if (line.includes('鏀粯鎴愬姛')) return line.replace(/鏀粯鎴愬姛.*/, "          wx.showToast({ title: '支付成功', icon: 'success' })");
  return line;
});

fs.writeFileSync(path, fixedLines.join('\n'), 'utf8');
console.log('Fixed all garbled characters!');
