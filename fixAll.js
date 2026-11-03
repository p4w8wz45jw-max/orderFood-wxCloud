const fs = require('fs');
const path = require('path');

const rechargeJsPath = path.join('miniprogram', 'pages', 'recharge', 'recharge.js');

// 读取文件
let jsContent = fs.readFileSync(rechargeJsPath, 'utf8');

// 1. 修改 doRealRecharge 方法中的抽奖赠送逻辑
const realRechargePattern = /(let\s+lotteryAdded\s*=\s*false\s*\n\s*)(const\s+success\s*=\s*await\s+this\.addLotteryChance\([^)]+\)\s*\n\s*)(if\s*\(\s*success\s*\)\s*lotteryAdded\s*=\s*true\s*)/;
const newRealLogic = `let lotteryAdded = false\n  if (recharge.amount >= 100) {\n    const success = await this.addLotteryChance(openid, 1)\n    if (success) lotteryAdded = true\n  }`;

if (realRechargePattern.test(jsContent)) {
  jsContent = jsContent.replace(realRechargePattern, `$1${newRealLogic}`);
  console.log('✅ 已修改 doRealRecharge 中的抽奖逻辑');
} else {
  // 尝试更宽松的匹配（防止格式差异）
  const fallbackPattern = /lotteryAdded\s*=\s*false[\s\S]*?addLotteryChance[^;]*;[\s\S]*?if\s*\(\s*success\s*\)/;
  if (fallbackPattern.test(jsContent)) {
    jsContent = jsContent.replace(/const\s+success\s*=\s*await\s+this\.addLotteryChance\(openid,\s*1\)[\s\S]*?if\s*\(\s*success\s*\)\s*lotteryAdded\s*=\s*true/, 
      'if (recharge.amount >= 100) {\n      const success = await this.addLotteryChance(openid, 1)\n      if (success) lotteryAdded = true\n    }');
    console.log('✅ 已通过宽松匹配修改 doRealRecharge');
  } else {
    console.log('⚠️ 未找到 doRealRecharge 中的抽奖逻辑，请手动检查');
  }
}

// 2. 修改 doMockRecharge 方法（如果存在模拟充值逻辑）
if (jsContent.includes('doMockRecharge')) {
  const mockPattern = /(let\s+lotteryAdded\s*=\s*false\s*\n\s*)(const\s+success\s*=\s*await\s+this\.addLotteryChance\([^)]+\)\s*\n\s*)(if\s*\(\s*success\s*\)\s*lotteryAdded\s*=\s*true\s*)/;
  if (mockPattern.test(jsContent)) {
    jsContent = jsContent.replace(mockPattern, `$1if (recharge.amount >= 100) {\n    const success = await this.addLotteryChance(openid, 1)\n    if (success) lotteryAdded = true\n  }`);
    console.log('✅ 已修改 doMockRecharge 中的抽奖逻辑');
  }
}

// 写入文件
fs.writeFileSync(rechargeJsPath, jsContent, 'utf8');
console.log('\n🎉 脚本执行完成！请重新编译小程序测试。');
console.log('📌 现在只有充值金额 >= 100 元才会赠送抽奖机会。');