# 开源项目深度对标：EKPO LabOS 实验室运营系统

> 对标日期：2026-10-19。重点借鉴实验记录、设备/资源、库存位置和生命周期追溯。当前项目仍是本地演示型操作台，不等同于经过验证的 LIMS。

## 1. 上游项目与可借鉴点

### eLabFTW — 电子实验记录与资源管理
- 仓库：[elabftw/elabftw](https://github.com/elabftw/elabftw)
- 资料：[实验记录工作流](https://github.com/elabftw/elabftw/blob/master/documentation/docs/usage/user-guide/experiments.md)、[库存位置管理](https://github.com/elabftw/elabftw/blob/master/documentation/docs/usage/inventory.md)、[端到端测试目录](https://github.com/elabftw/elabftw/tree/master/tests/cypress/integration)。
- 借鉴：实验条目具有类别、状态、标签、模板、附件、关联资源和修订历史；常用记录可置顶；列表有不同布局；库存位置支持层级、容器、数量和单位；导入/导出与端到端测试属于产品流程的一部分。
- 不照搬：eLabFTW 有用户、团队、权限和服务器数据库。本项目没有这些服务端能力，不能宣称支持多人审核、电子签名或可信时间戳。

### Baobab LIMS — 样本与实验室元数据生命周期
- 仓库：[BaobabLims/baobab.lims](https://github.com/BaobabLims/baobab.lims)
- 借鉴：样本/资源从接收、存储到复用需要稳定标识与结构化元数据；存储位置不能只作为自由文本备注。

## 2. 对本项目的产品映射

| 模块 | 借鉴模式 | 验收点 |
|---|---|---|
| 总览 | 费用、维保、库存和测试异常摘要 | 所有指标来自台账，样例数据有提示 |
| 气体台账 | 品名、规格、供应商、批次、入出库 | 单位与数量变化可追溯 |
| 设备维保 | 设备主档 + 维保事件 | 计划日期、完成日期、责任人区分 |
| 校准记录 | 证书编号、机构、日期、有效期、结论 | 不自动伪造校准凭证 |
| 备件库存 | 位置、数量、单价、出入库事件 | 当前库存可由流水复算 |
| 测试日志/实验计划 | 按日期、设备、实验和状态检索 | 实验记录和设备记录互相关联 |

## 3. 本轮实际落地
- 首页新增气体登记、设备维保、备件库存和测试日志快捷入口。
- 保留演示数据警示，防止用户把初始化样例当作真实气体、校准和安全凭证。

## 4. 后续重构要求
1. 为设备、备件、气体批次、实验和校准证书使用不可变 ID。
2. 记录库存每次变动的事件，当前余额由事件计算或核对。
3. 实验记录按模板、状态和版本组织；完成记录不能无痕覆盖。
4. 校准过期状态按真实日期计算，并显示计算依据。
5. 如果将来支持签署或审核，必须有身份认证和服务端不可抵赖审计；单机浏览器按钮不等于电子签名。

## 5. 参考链接
- [eLabFTW](https://github.com/elabftw/elabftw)
- [eLabFTW 实验记录文档](https://github.com/elabftw/elabftw/blob/master/documentation/docs/usage/user-guide/experiments.md)
- [eLabFTW 库存管理文档](https://github.com/elabftw/elabftw/blob/master/documentation/docs/usage/inventory.md)
- [Baobab LIMS](https://github.com/BaobabLims/baobab.lims)

## 6. 2026-10-19 实施补充：保养计划状态归入领域核心

- `src/domain/index.js` 新增 `getMaintenanceScheduleStatus(nextDate, asOf, dueSoonDays)`，统一返回 `unscheduled`、`overdue`、`due-soon` 或 `scheduled`，并返回距到期天数。
- `assets/js/legacy-app.js` 的设备台账使用领域状态渲染到期徽标；遗留无效日期显示为“日期异常”，不再把解析失败当作正常。
- `test/domain.test.js` 覆盖逾期、当天到期、30 天边界、31 天正常、非法日期和非法策略参数。
- 保养状态与校准状态仍是不同维度：完成保养不代表校准有效，校准合格也不代表保养未逾期。
