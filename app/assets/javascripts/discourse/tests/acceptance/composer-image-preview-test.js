import { click, fillIn, triggerKeyEvent, visit } from "@ember/test-helpers";
import {
  acceptance,
  count,
  exists,
  invisible,
  query,
  queryAll,
  visible,
} from "discourse/tests/helpers/qunit-helpers";
import { test } from "qunit";

acceptance("Composer - Image Preview", function (needs) {
  needs.user();
  needs.settings({ enable_whispers: true });
  needs.site({ can_tag_topics: true });
  needs.pretender((server, helper) => {
    server.post("/uploads/lookup-urls", () => {
      return helper.response([]);
    });
    server.get("/posts/419", () => {
      return helper.response({ id: 419 });
    });
    server.get("/u/is_local_username", () => {
      return helper.response({
        valid: [],
        valid_groups: ["staff"],
        mentionable_groups: [{ name: "staff", user_count: 30 }],
        cannot_see: [],
        max_users_notified_per_group_mention: 100,
      });
    });
  });

  const assertImageResized = (assert, uploads) => {
    assert.strictEqual(
      queryAll(".d-editor-input").val(),
      uploads.join("\n"),
      "it resizes uploaded image"
    );
  };

  test("Image resizing buttons", async function (assert) {
    await visit("/");
    await click("#create-topic");

    let uploads = [
      // 0 Default markdown with dimensions- should work
      "<a href='https://example.com'>![test|690x313](upload://test.png)</a>",
      // 1 Image with scaling percentage, should work
      "![test|690x313,50%](upload://test.png)",
      // 2 image with scaling percentage and a proceeding whitespace, should work
      "![test|690x313, 50%](upload://test.png)",
      // 3 No dimensions, should not work
      "![test](upload://test.jpeg)",
      // 4 Wrapped in backticks should not work
      "`![test|690x313](upload://test.png)`",
      // 5 html image - should not work
      "<img src='/images/avatar.png' wight='20' height='20'>",
      // 6 two images one the same line, but both are syntactically correct - both should work
      "![onTheSameLine1|200x200](upload://onTheSameLine1.jpeg) ![onTheSameLine2|250x250](upload://onTheSameLine2.jpeg)",
      // 7 & 8 Identical images - both should work
      "![identicalImage|300x300](upload://identicalImage.png)",
      "![identicalImage|300x300](upload://identicalImage.png)",
      // 9 Image with whitespaces in alt - should work
      "![image with spaces in alt|690x220](upload://test.png)",
      // 10 Image with markdown title - should work
      `![image|690x220](upload://test.png "image title")`,
      // 11 bbcode - should not work
      "[img]/images/avatar.png[/img]",
      // 12 Image with data attributes
      "![test|foo=bar|690x313,50%|bar=baz](upload://test.png)",
    ];

    await fillIn(".d-editor-input", uploads.join("\n"));

    assert.strictEqual(
      count(".button-wrapper"),
      10,
      "it adds correct amount of scaling button groups"
    );

    // Default
    uploads[0] =
      "<a href='https://example.com'>![test|690x313, 50%](upload://test.png)</a>";
    await click(
      queryAll(
        ".button-wrapper[data-image-index='0'] .scale-btn[data-scale='50']"
      )[0]
    );
    assertImageResized(assert, uploads);

    // Targets the correct image if two on the same line
    uploads[6] =
      "![onTheSameLine1|200x200, 50%](upload://onTheSameLine1.jpeg) ![onTheSameLine2|250x250](upload://onTheSameLine2.jpeg)";
    await click(
      queryAll(
        ".button-wrapper[data-image-index='3'] .scale-btn[data-scale='50']"
      )[0]
    );
    assertImageResized(assert, uploads);

    // Try the other image on the same line
    uploads[6] =
      "![onTheSameLine1|200x200, 50%](upload://onTheSameLine1.jpeg) ![onTheSameLine2|250x250, 75%](upload://onTheSameLine2.jpeg)";
    await click(
      queryAll(
        ".button-wrapper[data-image-index='4'] .scale-btn[data-scale='75']"
      )[0]
    );
    assertImageResized(assert, uploads);

    // Make sure we target the correct image if there are duplicates
    uploads[7] = "![identicalImage|300x300, 50%](upload://identicalImage.png)";
    await click(
      queryAll(
        ".button-wrapper[data-image-index='5'] .scale-btn[data-scale='50']"
      )[0]
    );
    assertImageResized(assert, uploads);

    // Try the other dupe
    uploads[8] = "![identicalImage|300x300, 75%](upload://identicalImage.png)";
    await click(
      queryAll(
        ".button-wrapper[data-image-index='6'] .scale-btn[data-scale='75']"
      )[0]
    );
    assertImageResized(assert, uploads);

    // Don't mess with image titles
    uploads[10] = `![image|690x220, 75%](upload://test.png "image title")`;
    await click(
      queryAll(
        ".button-wrapper[data-image-index='8'] .scale-btn[data-scale='75']"
      )[0]
    );
    assertImageResized(assert, uploads);

    // Keep data attributes
    uploads[12] = `![test|foo=bar|690x313, 75%|bar=baz](upload://test.png)`;
    await click(
      queryAll(
        ".button-wrapper[data-image-index='9'] .scale-btn[data-scale='75']"
      )[0]
    );
    assertImageResized(assert, uploads);

    await fillIn(
      ".d-editor-input",
      `
![test|690x313](upload://test.png)

\`<script>alert("xss")</script>\`
    `
    );

    assert.ok(
      !exists("script"),
      "it does not unescape script tags in code blocks"
    );
  });

  test("Editing alt text (with enter key) for single image in preview updates alt text in composer", async function (assert) {
    const scaleButtonContainer = ".scale-btn-container";

    const readonlyAltText = ".alt-text";
    const editAltTextButton = ".alt-text-edit-btn";

    const altTextInput = ".alt-text-input";
    const altTextEditOk = ".alt-text-edit-ok";
    const altTextEditCancel = ".alt-text-edit-cancel";

    await visit("/");

    await click("#create-topic");
    await fillIn(".d-editor-input", `![zorro|200x200](upload://zorro.png)`);

    assert.equal(query(readonlyAltText).innerText, "zorro", "correct alt text");
    assert.ok(visible(readonlyAltText), "alt text is visible");
    assert.ok(visible(editAltTextButton), "alt text edit button is visible");
    assert.ok(invisible(altTextInput), "alt text input is hidden");
    assert.ok(invisible(altTextEditOk), "alt text edit ok button is hidden");
    assert.ok(invisible(altTextEditCancel), "alt text edit cancel is hidden");

    await click(editAltTextButton);

    assert.ok(invisible(scaleButtonContainer), "scale buttons are hidden");
    assert.ok(invisible(readonlyAltText), "alt text is hidden");
    assert.ok(invisible(editAltTextButton), "alt text edit button is hidden");
    assert.ok(visible(altTextInput), "alt text input is visible");
    assert.ok(visible(altTextEditOk), "alt text edit ok button is visible");
    assert.ok(visible(altTextEditCancel), "alt text edit cancel is hidden");
    assert.equal(
      queryAll(altTextInput).val(),
      "zorro",
      "correct alt text in input"
    );

    await triggerKeyEvent(altTextInput, "keypress", "[".charCodeAt(0));
    await triggerKeyEvent(altTextInput, "keypress", "]".charCodeAt(0));
    assert.equal(
      queryAll(altTextInput).val(),
      "zorro",
      "does not input [ ] keys"
    );

    await fillIn(altTextInput, "steak");
    await triggerKeyEvent(altTextInput, "keypress", 13);

    assert.equal(
      queryAll(".d-editor-input").val(),
      "![steak|200x200](upload://zorro.png)",
      "alt text updated"
    );
    assert.equal(
      query(readonlyAltText).innerText,
      "steak",
      "shows the alt text"
    );
    assert.ok(visible(editAltTextButton), "alt text edit button is visible");
    assert.ok(visible(scaleButtonContainer), "scale buttons are visible");
    assert.ok(visible(editAltTextButton), "alt text edit button is visible");
    assert.ok(invisible(altTextInput), "alt text input is hidden");
    assert.ok(invisible(altTextEditOk), "alt text edit ok button is hidden");
    assert.ok(invisible(altTextEditCancel), "alt text edit cancel is hidden");
  });

  test("Editing alt text (with check button) in preview updates alt text in composer", async function (assert) {
    const scaleButtonContainer = ".scale-btn-container";
    const readonlyAltText = ".alt-text";
    const editAltTextButton = ".alt-text-edit-btn";

    const altTextInput = ".alt-text-input";
    const altTextEditOk = ".alt-text-edit-ok";
    const altTextEditCancel = ".alt-text-edit-cancel";

    await visit("/");

    await click("#create-topic");
    await fillIn(".d-editor-input", `![zorro|200x200](upload://zorro.png)`);

    await click(editAltTextButton);

    await fillIn(altTextInput, "steak");
    await click(altTextEditOk);

    assert.equal(
      queryAll(".d-editor-input").val(),
      "![steak|200x200](upload://zorro.png)",
      "alt text updated"
    );
    assert.equal(
      query(readonlyAltText).innerText,
      "steak",
      "shows the alt text"
    );

    assert.ok(visible(editAltTextButton), "alt text edit button is visible");
    assert.ok(visible(scaleButtonContainer), "scale buttons are visible");
    assert.ok(visible(editAltTextButton), "alt text edit button is visible");
    assert.ok(invisible(altTextInput), "alt text input is hidden");
    assert.ok(invisible(altTextEditOk), "alt text edit ok button is hidden");
    assert.ok(invisible(altTextEditCancel), "alt text edit cancel is hidden");
  });

  test("Cancel alt text edit in preview does not update alt text in composer", async function (assert) {
    const scaleButtonContainer = ".scale-btn-container";

    const readonlyAltText = ".alt-text";
    const editAltTextButton = ".alt-text-edit-btn";

    const altTextInput = ".alt-text-input";
    const altTextEditOk = ".alt-text-edit-ok";
    const altTextEditCancel = ".alt-text-edit-cancel";

    await visit("/");

    await click("#create-topic");
    await fillIn(".d-editor-input", `![zorro|200x200](upload://zorro.png)`);

    await click(editAltTextButton);

    await fillIn(altTextInput, "steak");
    await click(altTextEditCancel);

    assert.equal(
      queryAll(".d-editor-input").val(),
      "![zorro|200x200](upload://zorro.png)",
      "alt text not updated"
    );
    assert.equal(
      query(readonlyAltText).innerText,
      "zorro",
      "shows the unedited alt text"
    );

    assert.ok(visible(editAltTextButton), "alt text edit button is visible");
    assert.ok(visible(scaleButtonContainer), "scale buttons are visible");
    assert.ok(visible(editAltTextButton), "alt text edit button is visible");
    assert.ok(invisible(altTextInput), "alt text input is hidden");
    assert.ok(invisible(altTextEditOk), "alt text edit ok button is hidden");
    assert.ok(invisible(altTextEditCancel), "alt text edit cancel is hidden");
  });

  test("Editing alt text for one of two images in preview updates correct alt text in composer", async function (assert) {
    const editAltTextButton = ".alt-text-edit-btn";
    const altTextInput = ".alt-text-input";

    await visit("/");
    await click("#create-topic");

    await fillIn(
      ".d-editor-input",
      `![zorro|200x200](upload://zorro.png) ![not-zorro|200x200](upload://not-zorro.png)`
    );
    await click(editAltTextButton);

    await fillIn(altTextInput, "tomtom");
    await triggerKeyEvent(altTextInput, "keypress", 13);

    assert.equal(
      queryAll(".d-editor-input").val(),
      `![tomtom|200x200](upload://zorro.png) ![not-zorro|200x200](upload://not-zorro.png)`,
      "the correct image's alt text updated"
    );
  });

  test("Deleting alt text for image empties alt text in composer and allows further modification", async function (assert) {
    const altText = ".alt-text";
    const editAltTextButton = ".alt-text-edit-btn";
    const altTextInput = ".alt-text-input";

    await visit("/");

    await click("#create-topic");
    await fillIn(".d-editor-input", `![zorro|200x200](upload://zorro.png)`);

    await click(editAltTextButton);

    await fillIn(altTextInput, "");
    await triggerKeyEvent(altTextInput, "keypress", 13);

    assert.equal(
      queryAll(".d-editor-input").val(),
      "![|200x200](upload://zorro.png)",
      "alt text updated"
    );
    assert.equal(query(altText).innerText, "", "shows the alt text");

    await click(editAltTextButton);

    await fillIn(altTextInput, "tomtom");
    await triggerKeyEvent(altTextInput, "keypress", 13);

    assert.equal(
      queryAll(".d-editor-input").val(),
      "![tomtom|200x200](upload://zorro.png)",
      "alt text updated"
    );
  });
});
