// D-0000-39: "import only the components used, so the bundle stays small". React Aria ships the words of its
// controls ("Previous", "Next", "Selected Date: …") in 34 languages, in files named `intlStrings.mjs` that
// import every language. The app is English only (en-GB), and React Aria uses its en-US words for en-GB, so
// the build keeps the English words and drops the rest. Nothing else in React Aria changes.

/** The files that list React Aria's words by language. */
export const stringsFile =
  /[\\/]node_modules[\\/](react-aria|react-aria-components|react-stately)[\\/]dist[\\/].*intlStrings\.mjs$/;

const LOCALE = "[a-z]{2,3}-[A-Z]{2}";
const importLine = new RegExp(
  `^import \\S+ from "[^"]*/(${LOCALE})\\.mjs";\\n`,
  "gm",
);
const entryLine = new RegExp(`^\\s*"(${LOCALE})": \\S+?,?\\n`, "gm");
const english = (locale) => locale.startsWith("en-");

/**
 * Keeps only the English languages of one `intlStrings.mjs`. Throws when the file does not look as expected,
 * so a change in React Aria's files stops the build instead of leaving the words out.
 */
export function keepEnglishStrings(code, file = "intlStrings.mjs") {
  const kept = [];
  const out = code
    .replace(importLine, (line, locale) => (english(locale) ? line : ""))
    .replace(entryLine, (line, locale) => {
      if (!english(locale)) return "";
      kept.push(locale);
      return line;
    });
  const named = [...out.matchAll(new RegExp(`"(${LOCALE})"`, "g"))];
  const imported = [...out.matchAll(new RegExp(`/(${LOCALE})\\.mjs"`, "g"))];
  const languages = [...named, ...imported].map((m) => m[1]);
  if (
    !kept.includes("en-US") ||
    !imported.some((m) => m[1] === "en-US") ||
    !languages.every(english)
  ) {
    throw new Error(
      `${file}: React Aria's English words (en-US) were not found, so the other languages cannot be dropped.`,
    );
  }
  return out;
}

/** The Vite plugin: applies `keepEnglishStrings` to React Aria's word lists in the build. */
export function reactAriaEnglishOnly() {
  return {
    name: "react-aria-english-only",
    apply: "build",
    transform(code, id) {
      return stringsFile.test(id)
        ? { code: keepEnglishStrings(code, id), map: null }
        : undefined;
    },
  };
}
