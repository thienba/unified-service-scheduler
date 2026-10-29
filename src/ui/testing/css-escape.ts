// For the jsdom tests only: jsdom has no `CSS.escape`, which React Aria calls when a list or popover opens.
// A test file that opens a themed Select, DatePicker or TimeField imports this first.
const css = (globalThis as { CSS?: { escape?: (value: string) => string } })
  .CSS;
if (!css?.escape) {
  (globalThis as { CSS?: object }).CSS = {
    ...css,
    escape: (value: string) => value.replace(/[^\w-]/g, (c) => `\\${c}`),
  };
}
export {};
