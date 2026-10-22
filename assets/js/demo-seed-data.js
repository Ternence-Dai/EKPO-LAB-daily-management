/* Demonstration seed dataset; not a substitute for verified laboratory records. */
const defaultData = {
            dataProvenance: 'demo-seed',
            gases: [
                { id: 1, item: "Hydrogen", spec: "99.999%", supplier: "示例供应商 A", batch: "H2-20260101", month: "2026-01", year: 2026, monthNum: 1, delivery: 182, return: 76, consumption: 106, cost: 9354.70, rent: 19827.58, freight: 3000 },
                { id: 2, item: "Nitrogen", spec: "99.999%", supplier: "示例供应商 A", batch: "N2-20260301", month: "2026-03", year: 2026, monthNum: 3, delivery: 48, return: 12, consumption: 36, cost: 2110.50, rent: 0, freight: 0 },
                { id: 3, item: "Coolant", spec: "乙二醇型", supplier: "示例供应商 B", batch: "CL-20260501", month: "2026-05", year: 2026, monthNum: 5, delivery: 20, return: 0, consumption: 20, cost: 3000, rent: 0, freight: 500 }
            ],
            maintenance: [
                { id: 1, name: "压力传感器", category: "传感器", location: "氮气房", qty: 17, cycle: "一级保养", freq: "季度", last: "2026-01-01", next: "2026-04-01", responsible: "示例责任人（待配置）", record: "" },
                { id: 2, name: "燃料电池测试台架", category: "实验设备", location: "实验室", qty: 1, cycle: "二级保养", freq: "年度", last: "2026-01-01", next: "2027-01-01", responsible: "示例责任人（待配置）", record: "WAGO模块IO错误" }
            ],
            maintLogs: [
                { id: 1, eqId: 1, date: "2026-01-01", checker: "示例校验机构（未核验）", operator: "示例操作员 A", cost: 5000, record: "季度校验，更换密封圈" },
                { id: 2, eqId: 2, date: "2026-01-01", checker: "示例维保机构（未核验）", operator: "示例操作员 B", cost: 20000, record: "年度维保，WAGO模块IO错误修复" }
            ],
            spareParts: [
                { id: 1, category: "PWM Box", desc: "Pulse regulator", catalog: "PWM-001", purpose: "Stack testing", qty: 1, brand: "未配置", price: 0, location: "待配置库位", update: "2026-01-15" },
                { id: 2, category: "Blower", desc: "recirculation", catalog: "BLW-002", purpose: "Stack testing", qty: 2, brand: "示例品牌（未核验）", price: 160000, location: "待配置库位", update: "2026-01-10" }
            ],
            spareLogs: [
                { id: 1, partId: 1, date: "2026-01-15", action: "入库", qty: 1, operator: "示例操作员 A", note: "新购备件入库" }
            ],
            // No fabricated calibration certificates or results are seeded.
            calibrationLogs: [],
            // No fabricated experiment plans or execution records are seeded.
            experiments: [],
            testDiary: [
                { id: 1, start: "2026-01-11", end: "2026-01-12", duration: 2, unit: "示例测试台架 01", operator: "示例操作员", sap: "Ok", result: "Ok", cycle: "210923_PHT_V07.04", error: "DP Air inlet&outlet too low", errorDesc: "气动阀组故障" }
            ]
        };
