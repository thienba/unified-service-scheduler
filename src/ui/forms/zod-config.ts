// Zod's settings for the whole app. Imported first by `src/main.tsx`, before any schema is made.
//
// Without `jitless`, the first `z.object()` tests whether the page may compile code by calling
// `new Function("")` inside a try. The Content Security Policy blocks it (no 'unsafe-eval', SEC-15),
// and Firefox reports the blocked call as a console error on every page load even though Zod catches
// it. With `jitless` Zod skips the test and parses objects without generated code; the results are
// the same.
import { z } from "zod";

z.config({ jitless: true });
