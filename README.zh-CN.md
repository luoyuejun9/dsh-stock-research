# dsh-stock-research

面向 DeepSeek Harness 的收盘后股票研究插件，覆盖 A 股、港股和美股。它把行情、财务、估值与事件整理为带来源证据的数据包，供 DSH 生成中文研究报告。

> 仅用于研究与教育，不构成投资建议；不会自动交易，也不会输出买入、持有或卖出指令。

## 功能边界

- 支持 `600519.SH`、`00700.HK`、`AAPL` 这类规范代码。
- Tushare 为主数据源；Alpha Vantage 是可选 REST 备用源。
- 本地计算收益率、波动率、回撤、增长、现金转化等指标。
- 所有报告都显示数据截止日、币种、来源接口、覆盖缺口与免责声明。
- 只做日线/收盘后研究，不声称提供实时行情。
- 跨市场比较只比较百分比和估值倍数，绝对金额保持原始币种。

## 安装与配置

```bash
dsh plugin --profile web add dsh-stock-research@0.1.0

export TUSHARE_TOKEN="你的 Token"
export ALPHAVANTAGE_API_KEY="你的 Key" # 可选备用
```

执行 `/stock doctor` 检查配置。密钥只从运行环境读取，不会写进缓存、日志、测试或 npm 包。

## 使用示例

```text
/stock analyze 600519.SH
/stock analyze 00700.HK --compare 9988.HK,JD
/stock compare 600519.SH 00700.HK AAPL
```

报告将明确区分“数据事实”和“模型推断”，并提供基本面、估值、价格趋势、事件、风险与牛/基/熊情景。若权限、配额或数据覆盖不足，对应章节会说明缺口，而非编造结论。

完整开发和贡献说明见英文 [README.md](README.md)。
