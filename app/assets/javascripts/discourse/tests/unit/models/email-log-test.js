import { module, test } from "qunit";
import EmailLog from "admin/models/email-log";
import { setPrefix } from "discourse-common/lib/get-url";

module("Unit | Model | email-log", function () {
  test("create", function (assert) {
    assert.ok(EmailLog.create(), "it can be created without arguments");
  });

  test("subfolder support", function (assert) {
    setPrefix("/forum");
    const attrs = {
      id: 60,
      to_address: "wikiman@asdf.com",
      email_type: "user_linked",
      user_id: 9,
      created_at: "2018-08-08T17:21:52.022Z",
      post_url: "/t/some-pro-tips-for-you/41/5",
      post_description: "Some Pro Tips For You",
      bounced: false,
      user: {
        id: 9,
        username: "wikiman",
        avatar_template:
          "/forum/letter_avatar_proxy/v2/letter/w/dfb087/{size}.png",
      },
    };
    const emailLog = EmailLog.create(attrs);
    assert.strictEqual(
      emailLog.get("post_url"),
      "/forum/t/some-pro-tips-for-you/41/5",
      "includes the subfolder in the post url"
    );
  });
});
