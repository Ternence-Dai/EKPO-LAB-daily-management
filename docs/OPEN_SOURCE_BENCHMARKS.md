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


## 7. 扩展开源对标：电子实验记录 / LIMS / 设备资产

> 覆盖说明：eLabFTW 与 SENAITE 是服务器型 LIMS/ELN；本项目当前为浏览器本地运营台。借鉴实体和流程，不宣称具备其多人权限、可信时间戳或电子签名。

| 上游项目 | 可核查入口 | 可迁移模式 | 本项目不具备的上游能力 |
|---|---|---|---|
| [eLabFTW](https://github.com/elabftw/elabftw) | [实验记录用户指南](https://github.com/elabftw/elabftw/blob/master/documentation/docs/usage/user-guide/experiments.md)、[库存指南](https://github.com/elabftw/elabftw/blob/master/documentation/docs/usage/inventory.md) | 实验条目/模板/标签/附件/资源关联，库存实体，导入导出与日历 | 团队账户、服务端权限、可信时间戳/区块链时间戳、审计安全体系 |
| [SENAITE.CORE](https://github.com/senaite/senaite.core) | [核心实体和安装定位](https://github.com/senaite/senaite.core) | LIMS 实体和样本/分析流程模块化；核心与最终用户 UI 分层 | 它是 Plone/SENAITE 系统组件，不能作为单文件 HTML 页面直接移植 |
| [Baobab LIMS](https://github.com/BaobabLims/baobab.lims) | [项目仓库](https://github.com/BaobabLims/baobab.lims) | 样本/资源与元数据生命周期、结构化标识 | 部署框架和样本追溯实现与当前本地 JSON 数据层不同 |

### 对本项目的实现映射
- 首页工作流已连接气体资源、设备维保、备件库存、实验计划四个真实模块。
- 下一阶段以稳定 ID 关联设备、气体批次、校准记录、备件库存、实验与测试日志；每次数量变化形成独立事件，余额可复算。
- 实验/校准更正要保存版本及原因；尚未实现服务端用户认证前，不提供“签署”“已审核”“不可抵赖审计”字样。
- 安全相关数据必须保留单位、批次、来源和日期；演示数据不得进入真实安全统计。


## 8. 2026-10-19 源码级复核：SENAITE.CORE 样本/分析请求生命周期

本次不只引用项目首页，实际读取了上游 `senaite/senaite.core` 的以下源码与测试（分支 `2.x`）：

- [`src/senaite/core/content/samples.py`](https://github.com/senaite/senaite.core/blob/2.x/src/senaite/core/content/samples.py)：`Samples` 是导航层的容器/入口，明确不是样本记录本身；说明 SENAITE 将导航组织与真实业务实体分开。
- [`src/senaite/core/tests/test_AnalysisRequest_retract.py`](https://github.com/senaite/senaite.core/blob/2.x/src/senaite/core/tests/test_AnalysisRequest_retract.py)：集成测试实际创建 Analysis Request，执行 `receive`，将样本状态推进到 `sample_received`；分析结果录入后执行 `submit` 到 `to_be_verified`，再执行 `retract` 到 `retracted`；最后对请求执行 `retract`，验证回到 `sample_received`。测试同时断言每次工作流转换后的状态，而不是只检查按钮或静态字段。
- 上游项目将样本容器、分析请求和分析结果生命周期分层；不能把导航列表本身误当作样本数据模型。

### 对 EKPO LabOS 的具体映射

- 当前 EKPO 已为实验记录提供 `planned → in-progress → completed/cancelled` 有限状态转换，并在每次转换时追加 actor 与时间戳审计事件；校验器会重放整条事件链并拒绝跳步、倒序、伪造 actor 或状态与审计不一致。
- 与 SENAITE 对比，当前 EKPO 的实验生命周期仍较轻量：没有独立的样本接收实体、分析请求/子分析结果、复核/撤回流程，也没有服务器端角色授权。因此不得把本地实验计划标注为已审核或受监管的 LIMS 样本。
- 后续优先级：先为样本/实验对象建立稳定 ID 和独立样本接收记录；再引入分析任务与结果版本；最后设计复核、撤回及更正事件。任何撤回都应追加可追溯事件，不应覆盖或删除原始结果。
- 本地浏览器审计仅用于操作追溯，不提供 SENAITE/Plone 服务端工作流的身份认证、角色权限、事务隔离或不可抵赖能力。
