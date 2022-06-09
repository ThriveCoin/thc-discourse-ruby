import { click, currentURL, fillIn, settled, visit } from "@ember/test-helpers";
import { test } from "qunit";
import I18n from "I18n";
import {
  acceptance,
  count,
  exists,
  publishToMessageBus,
  query,
  updateCurrentUser,
} from "discourse/tests/helpers/qunit-helpers";
import { fixturesByUrl } from "discourse/tests/helpers/create-pretender";
import selectKit from "../helpers/select-kit-helper";
import { cloneJSON } from "discourse-common/lib/object";

acceptance(
  "User Private Messages - user with no group messages",
  function (needs) {
    needs.user();

    needs.site({
      can_tag_pms: true,
    });

    test("viewing messages", async function (assert) {
      await visit("/u/eviltrout/messages");

      assert.strictEqual(
        count(".topic-list-item"),
        1,
        "displays the topic list"
      );

      assert.ok(
        !exists(".group-notifications-button"),
        "displays the group notifications button"
      );
    });

    test("viewing messages of another user", async function (assert) {
      updateCurrentUser({ id: 5, username: "charlie" });

      await visit("/u/eviltrout/messages");

      assert.ok(
        !exists(".messages-nav li a.new"),
        "it does not display new filter"
      );

      assert.ok(
        !exists(".messages-nav li a.unread"),
        "it does not display unread filter"
      );
    });
  }
);

acceptance(
  "User Private Messages - user with group messages",
  function (needs) {
    let fetchedNew;
    let fetchUserNew;
    let fetchedGroupNew;

    needs.user({
      id: 5,
      username: "charlie",
      groups: [{ id: 14, name: "awesome_group", has_messages: true }],
    });

    needs.site({
      can_tag_pms: true,
    });

    needs.hooks.afterEach(() => {
      fetchedNew = false;
      fetchedGroupNew = false;
      fetchUserNew = false;
    });

    needs.pretender((server, helper) => {
      server.get("/tags/personal_messages/:username.json", () => {
        return helper.response({ tags: [] });
      });

      server.get("/t/13.json", () => {
        const response = cloneJSON(fixturesByUrl["/t/12/1.json"]);
        response.suggested_group_name = "awesome_group";
        return helper.response(response);
      });

      server.get("/topics/private-messages/:username.json", () => {
        return helper.response({
          topic_list: {
            topics: [
              { id: 1, posters: [] },
              { id: 2, posters: [] },
              { id: 3, posters: [] },
            ],
          },
        });
      });

      [
        "/topics/private-messages-new/:username.json",
        "/topics/private-messages-unread/:username.json",
        "/topics/private-messages-archive/:username.json",
        "/topics/private-messages-group/:username/:group_name/new.json",
        "/topics/private-messages-group/:username/:group_name/unread.json",
        "/topics/private-messages-group/:username/:group_name/archive.json",
      ].forEach((url) => {
        server.get(url, () => {
          let topics;

          if (fetchedNew || fetchedGroupNew || fetchUserNew) {
            topics = [];
          } else {
            topics = [
              { id: 1, posters: [] },
              { id: 2, posters: [] },
              { id: 3, posters: [] },
            ];
          }

          return helper.response({
            topic_list: {
              topics,
            },
          });
        });
      });

      server.get(
        "/topics/private-messages-group/:username/:group_name.json",
        () => {
          return helper.response({
            topic_list: {
              topics: [
                { id: 1, posters: [] },
                { id: 2, posters: [] },
              ],
            },
          });
        }
      );

      server.put("/topics/pm-reset-new", (request) => {
        const requestBody = request.requestBody;
        // No easy way to do this https://github.com/pretenderjs/pretender/issues/159
        if (requestBody === "inbox=group&group_name=awesome_group") {
          fetchedGroupNew = true;
        }

        if (requestBody === "inbox=user") {
          fetchUserNew = true;
        }

        if (requestBody === "inbox=all") {
          fetchedNew = true;
        }

        return helper.response({ topic_ids: [1, 2, 3] });
      });

      server.put("/topics/bulk", (request) => {
        const requestBody = request.requestBody;

        if (requestBody.includes("private_message_inbox=all")) {
          fetchedNew = true;
        }

        if (
          requestBody.includes(
            "private_message_inbox=group&group_name=awesome_group"
          )
        ) {
          fetchedGroupNew = true;
        }

        if (requestBody.includes("private_message_inbox=user")) {
          fetchUserNew = true;
        }

        return helper.response({
          topic_ids: [1, 2, 3],
        });
      });
    });

    const publishReadToMessageBus = function (opts = {}) {
      publishToMessageBus(
        `/private-message-topic-tracking-state/user/${opts.userId || 5}`,
        {
          topic_id: opts.topicId,
          message_type: "read",
          payload: {
            last_read_post_number: 2,
            highest_post_number: 2,
            notification_level: 2,
          },
        }
      );
    };

    const publishUnreadToMessageBus = function (opts = {}) {
      publishToMessageBus(
        `/private-message-topic-tracking-state/user/${opts.userId || 5}`,
        {
          topic_id: opts.topicId,
          message_type: "unread",
          payload: {
            last_read_post_number: 1,
            highest_post_number: 2,
            notification_level: 2,
            group_ids: opts.groupIds || [],
          },
        }
      );
    };

    const publishNewToMessageBus = function (opts = {}) {
      publishToMessageBus(
        `/private-message-topic-tracking-state/user/${opts.userId || 5}`,
        {
          topic_id: opts.topicId,
          message_type: "new_topic",
          payload: {
            last_read_post_number: null,
            highest_post_number: 1,
            group_ids: opts.groupIds || [],
          },
        }
      );
    };

    const publishGroupArchiveToMessageBus = function (opts) {
      publishToMessageBus(
        `/private-message-topic-tracking-state/group/${opts.groupIds[0]}`,
        {
          topic_id: opts.topicId,
          message_type: "group_archive",
          payload: {
            group_ids: opts.groupIds,
            acting_user_id: opts.actingUserId,
          },
        }
      );
    };

    const publishGroupUnreadToMessageBus = function (opts) {
      publishToMessageBus(
        `/private-message-topic-tracking-state/group/${opts.groupIds[0]}`,
        {
          topic_id: opts.topicId,
          message_type: "unread",
          payload: {
            last_read_post_number: 1,
            highest_post_number: 2,
            notification_level: 2,
            group_ids: opts.groupIds || [],
          },
        }
      );
    };

    const publishGroupNewToMessageBus = function (opts) {
      publishToMessageBus(
        `/private-message-topic-tracking-state/group/${opts.groupIds[0]}`,
        {
          topic_id: opts.topicId,
          message_type: "new_topic",
          payload: {
            last_read_post_number: null,
            highest_post_number: 1,
            group_ids: opts.groupIds || [],
          },
        }
      );
    };

    test("viewing messages filtered by tags", async function (assert) {
      await visit("/u/charlie/messages/tags");

      assert.strictEqual(
        count(".action-list li"),
        3,
        "it does not expand personal or group inbox"
      );
    });

    test("incoming group archive message acted by current user", async function (assert) {
      await visit("/u/charlie/messages");

      publishGroupArchiveToMessageBus({
        groupIds: [14],
        topicId: 1,
        actingUserId: 5,
      });

      await visit("/u/charlie/messages"); // wait for re-render

      assert.ok(
        !exists(".show-mores"),
        `does not display the topic incoming info`
      );
    });

    test("incoming group archive message on inbox and archive filter", async function (assert) {
      for (const url of [
        "/u/charlie/messages/group/awesome_group",
        "/u/charlie/messages/group/awesome_group/archive",
      ]) {
        await visit(url);

        publishGroupArchiveToMessageBus({ groupIds: [14], topicId: 1 });

        await visit(url); // wait for re-render

        assert.ok(
          exists(".show-mores"),
          `${url} displays the topic incoming info`
        );
      }

      for (const url of [
        "/u/charlie/messages",
        "/u/charlie/messages/archive",
      ]) {
        await visit(url);

        publishGroupArchiveToMessageBus({ groupIds: [14], topicId: 1 });

        await visit(url); // wait for re-render

        assert.ok(
          !exists(".show-mores"),
          `${url} does not display the topic incoming info`
        );
      }
    });

    test("incoming unread and new messages on all filter", async function (assert) {
      await visit("/u/charlie/messages");

      publishUnreadToMessageBus({ topicId: 1 });
      publishNewToMessageBus({ topicId: 2 });

      await visit("/u/charlie/messages"); // wait for re-render

      assert.strictEqual(
        query(".messages-nav li a.new").innerText.trim(),
        I18n.t("user.messages.new_with_count", { count: 1 }),
        "displays the right count"
      );

      assert.strictEqual(
        query(".messages-nav li a.unread").innerText.trim(),
        I18n.t("user.messages.unread_with_count", { count: 1 }),
        "displays the right count"
      );
    });

    test("incoming new messages while viewing new", async function (assert) {
      await visit("/u/charlie/messages/new");

      publishNewToMessageBus({ topicId: 1 });

      await visit("/u/charlie/messages/new"); // wait for re-render

      assert.strictEqual(
        query(".messages-nav li a.new").innerText.trim(),
        I18n.t("user.messages.new_with_count", { count: 1 }),
        "displays the right count"
      );

      assert.ok(exists(".show-mores"), "displays the topic incoming info");
    });

    test("incoming unread messages while viewing unread", async function (assert) {
      await visit("/u/charlie/messages/unread");

      publishUnreadToMessageBus();

      await visit("/u/charlie/messages/unread"); // wait for re-render

      assert.strictEqual(
        query(".messages-nav li a.unread").innerText.trim(),
        I18n.t("user.messages.unread_with_count", { count: 1 }),
        "displays the right count"
      );

      assert.ok(exists(".show-mores"), "displays the topic incoming info");
    });

    test("incoming unread and new messages while viewing group unread", async function (assert) {
      await visit("/u/charlie/messages/group/awesome_group/unread");

      publishUnreadToMessageBus({ groupIds: [14], topicId: 1 });
      publishNewToMessageBus({ groupIds: [14], topicId: 2 });

      await visit("/u/charlie/messages/group/awesome_group/unread"); // wait for re-render

      assert.strictEqual(
        query(".messages-nav li a.unread").innerText.trim(),
        I18n.t("user.messages.unread_with_count", { count: 1 }),
        "displays the right count"
      );

      assert.strictEqual(
        query(".messages-nav li a.new").innerText.trim(),
        I18n.t("user.messages.new_with_count", { count: 1 }),
        "displays the right count"
      );

      assert.ok(exists(".show-mores"), "displays the topic incoming info");

      await visit("/u/charlie/messages/unread");

      assert.strictEqual(
        query(".messages-nav li a.unread").innerText.trim(),
        I18n.t("user.messages.unread"),
        "displays the right count"
      );

      assert.strictEqual(
        query(".messages-nav li a.new").innerText.trim(),
        I18n.t("user.messages.new"),
        "displays the right count"
      );
    });

    test("incoming messages is not tracked on non user messages route", async function (assert) {
      await visit("/u/charlie/messages");
      await visit("/t/13");

      publishNewToMessageBus({ topicId: 1, userId: 5 });

      await settled();
      await visit("/u/charlie/messages");

      assert.ok(
        !exists(".show-mores"),
        "does not display the topic incoming info"
      );
    });

    test("dismissing all unread messages", async function (assert) {
      await visit("/u/charlie/messages/unread");

      publishUnreadToMessageBus({ topicId: 1, userId: 5 });
      publishUnreadToMessageBus({ topicId: 2, userId: 5 });
      publishUnreadToMessageBus({ topicId: 3, userId: 5 });

      assert.strictEqual(
        count(".topic-list-item"),
        3,
        "displays the right topic list"
      );

      await click(".btn.dismiss-read");
      await click("#dismiss-read-confirm");

      assert.strictEqual(
        query(".messages-nav li a.unread").innerText.trim(),
        I18n.t("user.messages.unread"),
        "displays the right count"
      );

      assert.strictEqual(
        count(".topic-list-item"),
        0,
        "displays the right topic list"
      );
    });

    test("dismissing personal unread messages", async function (assert) {
      await visit("/u/charlie/messages/unread");

      assert.strictEqual(
        count(".topic-list-item"),
        3,
        "displays the right topic list"
      );

      await click(".btn.dismiss-read");
      await click("#dismiss-read-confirm");

      assert.strictEqual(
        count(".topic-list-item"),
        0,
        "displays the right topic list"
      );
    });

    test("dismissing group unread messages", async function (assert) {
      await visit("/u/charlie/messages/group/awesome_group/unread");

      assert.strictEqual(
        count(".topic-list-item"),
        3,
        "displays the right topic list"
      );

      await click(".btn.dismiss-read");
      await click("#dismiss-read-confirm");

      assert.strictEqual(
        count(".topic-list-item"),
        0,
        "displays the right topic list"
      );
    });

    test("dismissing new messages", async function (assert) {
      await visit("/u/charlie/messages/new");

      publishNewToMessageBus({ topicId: 1, userId: 5 });
      publishNewToMessageBus({ topicId: 2, userId: 5 });
      publishNewToMessageBus({ topicId: 3, userId: 5 });

      assert.strictEqual(
        count(".topic-list-item"),
        3,
        "displays the right topic list"
      );

      await click(".btn.dismiss-read");

      assert.strictEqual(
        query(".messages-nav li a.new").innerText.trim(),
        I18n.t("user.messages.new"),
        "displays the right count"
      );

      assert.strictEqual(
        count(".topic-list-item"),
        0,
        "displays the right topic list"
      );
    });

    test("dismissing personal new messages", async function (assert) {
      await visit("/u/charlie/messages/new");

      assert.strictEqual(
        count(".topic-list-item"),
        3,
        "displays the right topic list"
      );

      await click(".btn.dismiss-read");

      assert.strictEqual(
        count(".topic-list-item"),
        0,
        "displays the right topic list"
      );
    });

    test("dismissing new group messages", async function (assert) {
      await visit("/u/charlie/messages/group/awesome_group/new");

      assert.strictEqual(
        count(".topic-list-item"),
        3,
        "displays the right topic list"
      );

      await click(".btn.dismiss-read");

      assert.strictEqual(
        count(".topic-list-item"),
        0,
        "displays the right topic list"
      );
    });

    test("viewing messages", async function (assert) {
      await visit("/u/charlie/messages");

      assert.strictEqual(
        count(".topic-list-item"),
        3,
        "displays the right topic list"
      );

      await visit("/u/charlie/messages/group/awesome_group");

      assert.strictEqual(
        count(".topic-list-item"),
        2,
        "displays the right topic list"
      );

      assert.ok(
        exists(".group-notifications-button"),
        "displays the group notifications button"
      );
    });

    test("suggested messages without new or unread", async function (assert) {
      await visit("/t/12");

      assert.strictEqual(
        query(".suggested-topics-message").innerText.trim(),
        "Want to read more? Browse other messages in personal messages.",
        "displays the right browse more message"
      );
    });

    test("suggested messages with new and unread", async function (assert) {
      await visit("/t/12");

      publishNewToMessageBus({ userId: 5, topicId: 1 });

      await settled();

      assert.strictEqual(
        query(".suggested-topics-message").innerText.trim(),
        "There is 1 new message remaining, or browse other personal messages",
        "displays the right browse more message"
      );

      publishUnreadToMessageBus({ userId: 5, topicId: 2 });

      await settled();

      assert.strictEqual(
        query(".suggested-topics-message").innerText.trim(),
        "There is 1 unread and 1 new message remaining, or browse other personal messages",
        "displays the right browse more message"
      );

      publishReadToMessageBus({ userId: 5, topicId: 2 });

      await settled();

      assert.strictEqual(
        query(".suggested-topics-message").innerText.trim(),
        "There is 1 new message remaining, or browse other personal messages",
        "displays the right browse more message"
      );
    });

    test("suggested messages for group messages without new or unread", async function (assert) {
      await visit("/t/13");

      assert.ok(
        query(".suggested-topics-message")
          .innerText.trim()
          .match(
            /Want to read more\? Browse other messages in\s+awesome_group\./
          ),
        "displays the right browse more message"
      );
    });

    test("suggested messages for group messages with new and unread", async function (assert) {
      await visit("/t/13");

      publishGroupNewToMessageBus({ groupIds: [14], topicId: 1 });

      await settled();

      assert.ok(
        query(".suggested-topics-message")
          .innerText.trim()
          .match(
            /There is 1 new message remaining, or browse other messages in\s+awesome_group/
          ),
        "displays the right browse more message"
      );

      publishGroupUnreadToMessageBus({ groupIds: [14], topicId: 2 });

      await settled();

      assert.ok(
        query(".suggested-topics-message")
          .innerText.trim()
          .match(
            /There is 1 unread and 1 new message remaining, or browse other messages in\s+awesome_group/
          ),
        "displays the right browse more message"
      );
    });
  }
);

acceptance("User Private Messages - user with no messages", function (needs) {
  needs.user();

  needs.pretender((server, helper) => {
    const emptyResponse = {
      topic_list: {
        topics: [],
      },
    };

    const apiUrls = [
      "/topics/private-messages/:username.json",
      "/topics/private-messages-sent/:username.json",
      "/topics/private-messages-new/:username.json",
      "/topics/private-messages-unread/:username.json",
      "/topics/private-messages-archive/:username.json",
    ];

    apiUrls.forEach((url) => {
      server.get(url, () => {
        return helper.response(emptyResponse);
      });
    });
  });

  test("It renders the empty state panel", async function (assert) {
    await visit("/u/charlie/messages");
    assert.ok(exists("div.empty-state"));

    await visit("/u/charlie/messages/sent");
    assert.ok(exists("div.empty-state"));

    await visit("/u/charlie/messages/new");
    assert.ok(exists("div.empty-state"));

    await visit("/u/charlie/messages/unread");
    assert.ok(exists("div.empty-state"));

    await visit("/u/charlie/messages/archive");
    assert.ok(exists("div.empty-state"));
  });
});

acceptance(
  "User Private Messages - composer with tags - Desktop",
  function (needs) {
    needs.user();
    needs.pretender((server, helper) => {
      server.post("/posts", () => {
        return helper.response({
          action: "create_post",
          post: {
            id: 323,
            name: "Robin Ward",
            username: "eviltrout",
            avatar_template:
              "/letter_avatar_proxy/v4/letter/j/b77776/{size}.png",
            created_at: "2021-10-26T11:47:54.253Z",
            cooked: "<p>Testing private messages with tags</p>",
            post_number: 1,
            post_type: 1,
            updated_at: "2021-10-26T11:47:54.253Z",
            yours: true,
            topic_id: 161,
            topic_slug: "testing-private-messages-with-tags",
            raw: "This is a test for private messages with tags",
            user_id: 29,
          },
          success: true,
        });
      });

      server.get("/t/161.json", () => {
        return helper.response(200, {});
      });

      server.get("/u/search/users", () => {
        return helper.response({
          users: [
            {
              username: "eviltrout",
              name: "Robin Ward",
              avatar_template:
                "https://avatars.discourse.org/v3/letter/t/41988e/{size}.png",
            },
            {
              username: "r_ocelot",
              name: "Revolver Ocelot",
              avatar_template:
                "https://avatars.discourse.org/v3/letter/t/41988e/{size}.png",
            },
          ],
        });
      });
    });

    needs.site({
      can_tag_pms: true,
      can_tag_topics: true,
    });

    test("tags are present on private messages - Desktop mode", async function (assert) {
      await visit("/u/eviltrout/messages");
      await click(".new-private-message");

      assert.ok(exists("#reply-control .mini-tag-chooser"));

      await fillIn("#reply-title", "Sending a message with tags");
      await fillIn(
        "#reply-control .d-editor-input",
        "This is a message to test tags"
      );

      const users = selectKit("#reply-control .user-chooser");

      await users.expand();
      await fillIn(
        "#private-message-users-body input.filter-input",
        "eviltrout"
      );
      await users.selectRowByValue("eviltrout");

      await fillIn(
        "#private-message-users-body input.filter-input",
        "r_ocelot"
      );
      await users.selectRowByValue("r_ocelot");

      const tags = selectKit("#reply-control .mini-tag-chooser");
      await tags.expand();
      await tags.selectRowByValue("monkey");
      await tags.selectRowByValue("gazelle");

      await click("#reply-control .save-or-cancel button");

      assert.strictEqual(
        currentURL(),
        "/t/testing-private-messages-with-tags/161",
        "it creates the private message"
      );
    });
  }
);

acceptance(
  "User Private Messages - composer with tags - Mobile",
  function (needs) {
    needs.mobileView();
    needs.user();

    needs.site({
      can_tag_pms: true,
      can_tag_topics: true,
    });

    test("tags are not present on private messages - Mobile mode", async function (assert) {
      await visit("/u/eviltrout/messages");
      await click(".new-private-message");
      assert.ok(!exists("#reply-control .mini-tag-chooser"));
    });
  }
);
