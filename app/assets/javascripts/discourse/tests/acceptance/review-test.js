import {
  acceptance,
  count,
  exists,
  publishToMessageBus,
  query,
  queryAll,
} from "discourse/tests/helpers/qunit-helpers";
import { click, fillIn, visit } from "@ember/test-helpers";
import I18n from "I18n";
import selectKit from "discourse/tests/helpers/select-kit-helper";
import { test } from "qunit";

acceptance("Review", function (needs) {
  needs.user();

  let requests = [];

  needs.pretender((server, helper) => {
    server.get("/tags/filter/search", (request) => {
      requests.push(request);
      return helper.response({
        results: [
          { id: "monkey", name: "monkey", count: 1 },
          { id: "not-monkey", name: "not-monkey", count: 1 },
          { id: "happy-monkey", name: "happy-monkey", count: 1 },
        ],
      });
    });
  });

  const user = '.reviewable-item[data-reviewable-id="1234"]';

  test("It returns a list of reviewable items", async function (assert) {
    await visit("/review");

    assert.ok(exists(".reviewable-item"), "has a list of items");
    assert.ok(exists(user));
    assert.ok(
      exists(`${user}.reviewable-user`),
      "applies a class for the type"
    );
    assert.ok(
      exists(`${user} .reviewable-action.approve`),
      "creates a button for approve"
    );
    assert.ok(
      exists(`${user} .reviewable-action.reject`),
      "creates a button for reject"
    );
  });

  test("Grouped by topic", async function (assert) {
    await visit("/review/topics");
    assert.ok(
      exists(".reviewable-topic"),
      "it has a list of reviewable topics"
    );
  });

  test("Reject user", async function (assert) {
    let reviewableActionDropdown = selectKit(
      `${user} .reviewable-action-dropdown`
    );

    await visit("/review");
    await reviewableActionDropdown.expand();
    await reviewableActionDropdown.selectRowByValue("reject_user_delete");

    assert.ok(
      queryAll(".reject-reason-reviewable-modal:visible .title")
        .html()
        .includes(I18n.t("review.reject_reason.title")),
      "it opens reject reason modal when user is rejected"
    );

    await click(".modal-footer .cancel");
    await reviewableActionDropdown.expand();
    await reviewableActionDropdown.selectRowByValue("reject_user_block");

    assert.ok(
      queryAll(".reject-reason-reviewable-modal:visible .title")
        .html()
        .includes(I18n.t("review.reject_reason.title")),
      "it opens reject reason modal when user is rejected and blocked"
    );
  });

  test("Settings", async function (assert) {
    await visit("/review/settings");

    assert.ok(exists(".reviewable-score-type"), "has a list of bonuses");

    const field = selectKit(
      ".reviewable-score-type:nth-of-type(1) .field .combo-box"
    );
    await field.expand();
    await field.selectRowByValue("5");
    await click(".save-settings");

    assert.ok(exists(".reviewable-settings .saved"), "it saved");
  });

  test("Flag related", async function (assert) {
    await visit("/review");

    assert.ok(
      exists(".reviewable-flagged-post .post-contents .username a[href]"),
      "it has a link to the user"
    );

    assert.strictEqual(
      queryAll(".reviewable-flagged-post .post-body").html().trim(),
      "<b>cooked content</b>"
    );

    assert.strictEqual(count(".reviewable-flagged-post .reviewable-score"), 2);
  });

  test("Flag related", async function (assert) {
    await visit("/review/1");

    assert.ok(exists(".reviewable-flagged-post"), "it shows the flagged post");
  });

  test("Clicking the buttons triggers actions", async function (assert) {
    await visit("/review");
    await click(`${user} .reviewable-action.approve`);
    assert.ok(!exists(user), "it removes the reviewable on success");
  });

  test("Editing a reviewable", async function (assert) {
    const topic = '.reviewable-item[data-reviewable-id="4321"]';
    await visit("/review");
    assert.ok(exists(`${topic} .reviewable-action.approve`));
    assert.ok(!exists(`${topic} .category-name`));
    assert.strictEqual(
      queryAll(`${topic} .discourse-tag:nth-of-type(1)`).text(),
      "hello"
    );
    assert.strictEqual(
      queryAll(`${topic} .discourse-tag:nth-of-type(2)`).text(),
      "world"
    );

    assert.strictEqual(
      queryAll(`${topic} .post-body`).text().trim(),
      "existing body"
    );

    await click(`${topic} .reviewable-action.edit`);
    await click(`${topic} .reviewable-action.save-edit`);
    assert.ok(
      exists(`${topic} .reviewable-action.approve`),
      "saving without changes is a cancel"
    );
    await click(`${topic} .reviewable-action.edit`);

    assert.ok(
      !exists(`${topic} .reviewable-action.approve`),
      "when editing actions are disabled"
    );

    await fillIn(".editable-field.payload-raw textarea", "new raw contents");
    await click(`${topic} .reviewable-action.cancel-edit`);
    assert.strictEqual(
      queryAll(`${topic} .post-body`).text().trim(),
      "existing body",
      "cancelling does not update the value"
    );

    await click(`${topic} .reviewable-action.edit`);
    let category = selectKit(`${topic} .category-id .select-kit`);
    await category.expand();
    await category.selectRowByValue("6");

    let tags = selectKit(`${topic} .payload-tags .mini-tag-chooser`);
    requests = [];
    await tags.expand();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].queryParams.categoryId, "6");
    await tags.fillInFilter("monkey");
    await tags.selectRowByValue("monkey");

    await fillIn(".editable-field.payload-raw textarea", "new raw contents");
    await click(`${topic} .reviewable-action.save-edit`);

    assert.strictEqual(
      queryAll(`${topic} .discourse-tag:nth-of-type(1)`).text(),
      "hello"
    );
    assert.strictEqual(
      queryAll(`${topic} .discourse-tag:nth-of-type(2)`).text(),
      "world"
    );
    assert.strictEqual(
      queryAll(`${topic} .discourse-tag:nth-of-type(3)`).text(),
      "monkey"
    );

    assert.strictEqual(
      queryAll(`${topic} .post-body`).text().trim(),
      "new raw contents"
    );
    assert.strictEqual(
      queryAll(`${topic} .category-name`).text().trim(),
      "support"
    );
  });

  test("Reviewables can become stale", async function (assert) {
    await visit("/review");

    const reviewable = query(`[data-reviewable-id="1234"]`);
    assert.notOk(reviewable.className.includes("reviewable-stale"));
    assert.strictEqual(
      count(`[data-reviewable-id="1234"] .status .pending`),
      1
    );
    assert.ok(!exists(".stale-help"));

    publishToMessageBus("/reviewable_counts", {
      review_count: 1,
      updates: {
        1234: { last_performing_username: "foo", status: 1 },
      },
    });

    await visit("/review"); // wait for re-render

    assert.ok(reviewable.className.includes("reviewable-stale"));
    assert.strictEqual(count("[data-reviewable-id=1234] .status .approved"), 1);
    assert.strictEqual(count(".stale-help"), 1);
    assert.ok(query(".stale-help").innerText.includes("foo"));

    await visit("/");
    await visit("/review"); // reload review

    assert.strictEqual(count(".stale-help"), 0);
  });
});
