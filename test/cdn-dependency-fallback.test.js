import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../assets/js/legacy-app.js", import.meta.url), "utf8");

test("chart rendering degrades safely when the ECharts CDN is unavailable", () => {
  const initStart = source.indexOf("function initChart(domId)");
  const initEnd = source.indexOf("// ==================== 2.", initStart);
  assert.notEqual(initStart, -1, "chart initializer must exist");
  assert.notEqual(initEnd, -1, "chart initializer boundary must exist");
  const initializer = source.slice(initStart, initEnd);
  assert.match(initializer, /typeof echarts === ['"]undefined['"]/);
  assert.match(initializer, /return null;/);
  assert.match(initializer, /图表组件暂不可用/);
  assert.ok(
    initializer.indexOf("typeof echarts ===") < initializer.indexOf("echarts.getInstanceByDom"),
    "the missing-library guard must run before any ECharts API access"
  );
});

test("Excel export reports a missing SheetJS dependency without throwing", () => {
  const exportStart = source.indexOf("function exportAllToExcel()");
  const exportEnd = source.indexOf("function isValidLabBackup", exportStart);
  assert.notEqual(exportStart, -1, "Excel export function must exist");
  assert.notEqual(exportEnd, -1, "Excel export boundary must exist");
  const exporter = source.slice(exportStart, exportEnd);
  assert.match(exporter, /typeof XLSX === ['"]undefined['"]/);
  assert.match(exporter, /return;/);
  assert.match(exporter, /Excel组件加载失败/);
  assert.ok(
    exporter.indexOf("typeof XLSX ===") < exporter.indexOf("XLSX.utils.book_new"),
    "the missing-library guard must run before any SheetJS API access"
  );
});


test("primary CDN failures retry independent CDNJS mirrors", () => {
  assert.match(html, /cdnjs\.cloudflare\.com\/ajax\/libs\/echarts\/5\.4\.3\/echarts\.min\.js/);
  assert.match(html, /cdnjs\.cloudflare\.com\/ajax\/libs\/xlsx\/0\.18\.5\/xlsx\.full\.min\.js/);
  assert.match(html, /echartsUnavailable/);
  assert.match(html, /xlsxUnavailable/);
});
