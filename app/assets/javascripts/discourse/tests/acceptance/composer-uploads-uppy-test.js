import {
  acceptance,
  createFile,
  loggedInUser,
  paste,
  query,
} from "discourse/tests/helpers/qunit-helpers";
import { withPluginApi } from "discourse/lib/plugin-api";
import bootbox from "bootbox";
import { authorizedExtensions } from "discourse/lib/uploads";
import { click, fillIn, settled, visit } from "@ember/test-helpers";
import I18n from "I18n";
import { skip, test } from "qunit";
import { Promise } from "rsvp";

function pretender(server, helper) {
  server.post("/uploads/lookup-urls", () => {
    return helper.response([
      {
        url:
          "//testbucket.s3.dualstack.us-east-2.amazonaws.com/original/1X/f1095d89269ff22e1818cf54b73e857261851019.jpeg",
        short_path: "/uploads/short-url/yoj8pf9DdIeHRRULyw7i57GAYdz.jpeg",
        short_url: "upload://yoj8pf9DdIeHRRULyw7i57GAYdz.jpeg",
      },
    ]);
  });

  server.post(
    "/uploads.json",
    () => {
      return helper.response({
        extension: "jpeg",
        filesize: 126177,
        height: 800,
        human_filesize: "123 KB",
        id: 202,
        original_filename: "avatar.PNG.jpg",
        retain_hours: null,
        short_path: "/uploads/short-url/yoj8pf9DdIeHRRULyw7i57GAYdz.jpeg",
        short_url: "upload://yoj8pf9DdIeHRRULyw7i57GAYdz.jpeg",
        thumbnail_height: 320,
        thumbnail_width: 690,
        url:
          "//testbucket.s3.dualstack.us-east-2.amazonaws.com/original/1X/f1095d89269ff22e1818cf54b73e857261851019.jpeg",
        width: 1920,
      });
    },
    500 // this delay is important to slow down the uploads a bit so we can click elements in the UI like the cancel button
  );
}

acceptance("Uppy Composer Attachment - Upload Placeholder", function (needs) {
  needs.user();
  needs.pretender(pretender);
  needs.settings({
    simultaneous_uploads: 2,
    enable_rich_text_paste: true,
  });

  test("should insert the Uploading placeholder then the complete image placeholder", async function (assert) {
    await visit("/");
    await click("#create-topic");
    await fillIn(".d-editor-input", "The image:\n");
    const appEvents = loggedInUser().appEvents;
    const done = assert.async();

    appEvents.on("composer:all-uploads-complete", () => {
      assert.strictEqual(
        query(".d-editor-input").value,
        "The image:\n![avatar.PNG|690x320](upload://yoj8pf9DdIeHRRULyw7i57GAYdz.jpeg)\n"
      );
      done();
    });

    appEvents.on("composer:upload-started", () => {
      assert.strictEqual(
        query(".d-editor-input").value,
        "The image:\n[Uploading: avatar.png...]()\n"
      );
    });

    const image = createFile("avatar.png");
    appEvents.trigger("composer:add-files", image);
  });

  test("should error if too many files are added at once", async function (assert) {
    await visit("/");
    await click("#create-topic");
    const appEvents = loggedInUser().appEvents;
    const image = createFile("avatar.png");
    const image1 = createFile("avatar1.png");
    const image2 = createFile("avatar2.png");
    const done = assert.async();
    appEvents.on("composer:uploads-aborted", async () => {
      assert.strictEqual(
        query(".bootbox .modal-body").innerHTML,
        I18n.t("post.errors.too_many_dragged_and_dropped_files", {
          count: 2,
        }),
        "it should warn about too many files added"
      );

      await click(".modal-footer .btn-primary");

      done();
    });

    appEvents.trigger("composer:add-files", [image, image1, image2]);
  });

  test("should error if an unauthorized extension file is added", async function (assert) {
    await visit("/");
    await click("#create-topic");
    const appEvents = loggedInUser().appEvents;
    const jsonFile = createFile("something.json", "application/json");
    const done = assert.async();

    appEvents.on("composer:uploads-aborted", async () => {
      assert.strictEqual(
        query(".bootbox .modal-body").innerHTML,
        I18n.t("post.errors.upload_not_authorized", {
          authorized_extensions: authorizedExtensions(
            false,
            this.siteSettings
          ).join(", "),
        }),
        "it should warn about unauthorized extensions"
      );

      await click(".modal-footer .btn-primary");

      done();
    });

    appEvents.trigger("composer:add-files", [jsonFile]);
  });

  test("cancelling uploads clears the placeholders out", async function (assert) {
    await visit("/");
    await click("#create-topic");
    await fillIn(".d-editor-input", "The image:\n");

    const image = createFile("avatar.png");
    const image2 = createFile("avatar2.png");

    const appEvents = loggedInUser().appEvents;
    let uploadStarted = 0;
    appEvents.on("composer:upload-started", () => {
      uploadStarted++;

      if (uploadStarted === 2) {
        assert.strictEqual(
          query(".d-editor-input").value,
          "The image:\n[Uploading: avatar.png...]()\n[Uploading: avatar2.png...]()\n",
          "it should show the upload placeholders when the upload starts"
        );
      }
    });
    appEvents.on("composer:uploads-cancelled", () => {
      assert.strictEqual(
        query(".d-editor-input").value,
        "The image:\n",
        "it should clear the cancelled placeholders"
      );
    });

    await new Promise(function (resolve) {
      appEvents.on("composer:uploads-preprocessing-complete", function () {
        resolve();
      });
      appEvents.trigger("composer:add-files", [image, image2]);
    });
    await click("#cancel-file-upload");
  });

  test("should insert a newline before and after an image when pasting in the end of the line", async function (assert) {
    await visit("/");
    await click("#create-topic");
    await fillIn(".d-editor-input", "The image:");
    const appEvents = loggedInUser().appEvents;
    const done = assert.async();

    appEvents.on("composer:upload-started", () => {
      assert.strictEqual(
        query(".d-editor-input").value,
        "The image:\n[Uploading: avatar.png...]()\n"
      );
    });

    appEvents.on("composer:all-uploads-complete", () => {
      assert.strictEqual(
        query(".d-editor-input").value,
        "The image:\n![avatar.PNG|690x320](upload://yoj8pf9DdIeHRRULyw7i57GAYdz.jpeg)\n"
      );
      done();
    });

    const image = createFile("avatar.png");
    appEvents.trigger("composer:add-files", image);
  });

  test("should insert a newline before and after an image when pasting in the middle of the line", async function (assert) {
    await visit("/");
    await click("#create-topic");
    await fillIn(".d-editor-input", "The image: Text after the image.");
    const textArea = query(".d-editor-input");
    textArea.selectionStart = 10;
    textArea.selectionEnd = 10;

    const appEvents = loggedInUser().appEvents;
    const done = assert.async();

    appEvents.on("composer:upload-started", () => {
      assert.strictEqual(
        query(".d-editor-input").value,
        "The image:\n[Uploading: avatar.png...]()\n Text after the image."
      );
    });

    appEvents.on("composer:all-uploads-complete", () => {
      assert.strictEqual(
        query(".d-editor-input").value,
        "The image:\n![avatar.PNG|690x320](upload://yoj8pf9DdIeHRRULyw7i57GAYdz.jpeg)\n Text after the image."
      );
      done();
    });

    const image = createFile("avatar.png");
    appEvents.trigger("composer:add-files", image);
  });

  test("should insert a newline before and after an image when pasting with text selected", async function (assert) {
    await visit("/");
    await click("#create-topic");
    await fillIn(
      ".d-editor-input",
      "The image: [paste here] Text after the image."
    );
    const textArea = query(".d-editor-input");
    textArea.selectionStart = 10;
    textArea.selectionEnd = 23;

    const appEvents = loggedInUser().appEvents;
    const done = assert.async();

    appEvents.on("composer:upload-started", () => {
      assert.strictEqual(
        query(".d-editor-input").value,
        "The image:\n[Uploading: avatar.png...]()\n Text after the image."
      );
    });

    appEvents.on("composer:all-uploads-complete", () => {
      assert.strictEqual(
        query(".d-editor-input").value,
        "The image:\n![avatar.PNG|690x320](upload://yoj8pf9DdIeHRRULyw7i57GAYdz.jpeg)\n Text after the image."
      );
      done();
    });

    const image = createFile("avatar.png");
    appEvents.trigger("composer:add-files", image);
  });

  test("should insert a newline only after an image when pasting into an empty composer", async function (assert) {
    await visit("/");
    await click("#create-topic");
    const appEvents = loggedInUser().appEvents;
    const done = assert.async();

    appEvents.on("composer:upload-started", () => {
      assert.strictEqual(
        query(".d-editor-input").value,
        "[Uploading: avatar.png...]()\n"
      );
    });

    appEvents.on("composer:all-uploads-complete", () => {
      assert.strictEqual(
        query(".d-editor-input").value,
        "![avatar.PNG|690x320](upload://yoj8pf9DdIeHRRULyw7i57GAYdz.jpeg)\n"
      );
      done();
    });

    const image = createFile("avatar.png");
    appEvents.trigger("composer:add-files", image);
  });

  test("should insert a newline only after an image when pasting into a blank line", async function (assert) {
    await visit("/");
    await click("#create-topic");
    await fillIn(".d-editor-input", "The image:\n");
    const appEvents = loggedInUser().appEvents;
    const done = assert.async();

    appEvents.on("composer:upload-started", () => {
      assert.strictEqual(
        query(".d-editor-input").value,
        "The image:\n[Uploading: avatar.png...]()\n"
      );
    });

    appEvents.on("composer:all-uploads-complete", () => {
      assert.strictEqual(
        query(".d-editor-input").value,
        "The image:\n![avatar.PNG|690x320](upload://yoj8pf9DdIeHRRULyw7i57GAYdz.jpeg)\n"
      );
      done();
    });

    const image = createFile("avatar.png");
    appEvents.trigger("composer:add-files", image);
  });

  skip("should place cursor properly after inserting a placeholder", async function (assert) {
    const appEvents = loggedInUser().appEvents;
    const done = assert.async();

    await visit("/");
    await click("#create-topic");
    await fillIn(".d-editor-input", "The image:\ntext after image");
    const input = query(".d-editor-input");
    input.selectionStart = 10;
    input.selectionEnd = 10;

    appEvents.on("composer:all-uploads-complete", () => {
      // after uploading we have this in the textarea:
      // "The image:\n![avatar.PNG|690x320](upload://yoj8pf9DdIeHRRULyw7i57GAYdz.jpeg)\ntext after image"
      // cursor should be just before "text after image":
      assert.equal(input.selectionStart, 76);
      assert.equal(input.selectionEnd, 76);
      done();
    });

    const image = createFile("avatar.png");
    appEvents.trigger("composer:add-files", image);
  });

  test("should be able to paste a table with files and not upload the files", async function (assert) {
    await visit("/");
    await click("#create-topic");
    const appEvents = loggedInUser().appEvents;
    const done = assert.async();

    let uppyEventFired = false;

    appEvents.on("composer:upload-started", () => {
      uppyEventFired = true;
    });

    let element = query(".d-editor");
    let inputElement = query(".d-editor-input");
    inputElement.focus();
    await paste(element, "\ta\tb\n1\t2\t3", {
      types: ["text/plain", "Files"],
      files: [createFile("avatar.png")],
    });
    await settled();

    assert.strictEqual(
      inputElement.value,
      "||a|b|\n|---|---|---|\n|1|2|3|\n",
      "only the plain text table is pasted"
    );
    assert.strictEqual(
      uppyEventFired,
      false,
      "uppy does not start uploading the file"
    );
    done();
  });
});

acceptance("Uppy Composer Attachment - Upload Error", function (needs) {
  needs.user();
  needs.pretender((server, helper) => {
    server.post("/uploads.json", () => {
      return helper.response(422, {
        success: false,
        errors: [
          "There was an error uploading the file, the gif was way too cool.",
        ],
      });
    });
  });
  needs.settings({
    simultaneous_uploads: 2,
  });

  test("should show an error message for the failed upload", async function (assert) {
    await visit("/");
    await click("#create-topic");
    await fillIn(".d-editor-input", "The image:\n");
    const appEvents = loggedInUser().appEvents;
    const done = assert.async();

    appEvents.on("composer:upload-error", async () => {
      assert.strictEqual(
        query(".bootbox .modal-body").innerHTML,
        "There was an error uploading the file, the gif was way too cool.",
        "it should show the error message from the server"
      );

      await click(".modal-footer .btn-primary");

      done();
    });

    const image = createFile("avatar.png");
    appEvents.trigger("composer:add-files", image);
  });
});

acceptance("Uppy Composer Attachment - Upload Handler", function (needs) {
  needs.user();
  needs.pretender(pretender);
  needs.settings({
    simultaneous_uploads: 2,
  });
  needs.hooks.beforeEach(() => {
    withPluginApi("0.8.14", (api) => {
      api.addComposerUploadHandler(["png"], (files) => {
        const file = files[0];
        const isNativeFile = file instanceof File ? "WAS" : "WAS NOT";
        bootbox.alert(
          `This is an upload handler test for ${file.name}. The file ${isNativeFile} a native file object.`
        );
      });
    });
  });

  test("should use upload handler if the matching extension is used and a single file is uploaded", async function (assert) {
    await visit("/");
    await click("#create-topic");
    const image = createFile("handlertest.png");
    const appEvents = loggedInUser().appEvents;
    const done = assert.async();

    appEvents.on("composer:uploads-aborted", async () => {
      assert.strictEqual(
        query(".bootbox .modal-body").innerHTML,
        "This is an upload handler test for handlertest.png. The file WAS a native file object.",
        "it should show the bootbox triggered by the upload handler"
      );
      await click(".modal-footer .btn");
      done();
    });

    appEvents.trigger("composer:add-files", [image]);
  });
});
