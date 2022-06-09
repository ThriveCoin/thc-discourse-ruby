import PrettyText, { buildOptions } from "pretty-text/pretty-text";
import { module, test } from "qunit";

module("lib:details-cooked-test");

const defaultOpts = buildOptions({
  siteSettings: {
    enable_emoji: true,
    emoji_set: "google_classic",
    highlighted_languages: "json|ruby|javascript",
    default_code_lang: "auto",
  },
  censoredWords: "shucks|whiz|whizzer",
  getURL: (url) => url,
});

test("details", function (assert) {
  const cooked = (input, expected, text) => {
    assert.strictEqual(
      new PrettyText(defaultOpts).cook(input),
      expected.replace(/\/>/g, ">"),
      text
    );
  };
  cooked(
    `<details><summary>Info</summary>coucou</details>`,
    `<details><summary>Info</summary>coucou</details>`,
    "manual HTML for details"
  );

  cooked(
    "[details=testing]\ntest\n[/details]",
    `<details>
<summary>
testing</summary>
<p>test</p>
</details>`
  );
});
