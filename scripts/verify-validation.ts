import { isPlausibleEmail, isValidIndianMobile, normalizeIndianMobile } from "../lib/utils/forms";
let fails = 0;
const t = (l: string, got: unknown, want: unknown) => {
  const ok = String(got) === String(want); if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${l.padEnd(32)} ${String(got).padEnd(11)} want ${want}`);
};
console.log("--- email ---");
for (const [v, w] of [["@gma.com", false], ["@gmal.com", false], ["gma.com", false],
  ["a@b", false], ["a@b.c", false], ["user@@gmail.com", false], ["user@-bad.com", false],
  ["user@gmail..com", false], ["angel@gmail.com", true],
  ["first.last+tag@sub.domain.co.in", true]] as [string, boolean][]) t(`"${v}"`, isPlausibleEmail(v), w);

console.log("--- indian mobile ---");
for (const [v, w] of [["00000", false], ["0000000000", false], ["9999999999", false],
  ["1234567890", false], ["5876543210", false], ["987654321", false],
  ["9876543210", true], ["+91 98765 43210", true], ["091-9876543210", true],
  ["8754807764", true], ["6123456789", true]] as [string, boolean][]) t(`"${v}"`, isValidIndianMobile(v), w);

t("normalise +91 98765 43210", normalizeIndianMobile("+91 98765 43210"), "9876543210");
console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
