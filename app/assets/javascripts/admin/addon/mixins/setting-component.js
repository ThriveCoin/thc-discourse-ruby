import { isNone } from "@ember/utils";
import { fmt, propertyNotEqual } from "discourse/lib/computed";
import { alias, oneWay } from "@ember/object/computed";
import I18n from "I18n";
import Mixin from "@ember/object/mixin";
import { Promise } from "rsvp";
import { ajax } from "discourse/lib/ajax";
import { categoryLinkHTML } from "discourse/helpers/category-link";
import discourseComputed, { bind } from "discourse-common/utils/decorators";
import { htmlSafe } from "@ember/template";
import { on } from "@ember/object/evented";
import showModal from "discourse/lib/show-modal";
import { warn } from "@ember/debug";
import { action } from "@ember/object";
import { splitString } from "discourse/lib/utilities";

const CUSTOM_TYPES = [
  "bool",
  "enum",
  "list",
  "url_list",
  "host_list",
  "category_list",
  "value_list",
  "category",
  "uploaded_image_list",
  "compact_list",
  "secret_list",
  "upload",
  "group_list",
  "tag_list",
  "color",
  "simple_list",
  "emoji_list",
  "named_list",
];

const AUTO_REFRESH_ON_SAVE = ["logo", "logo_small", "large_icon"];

export default Mixin.create({
  classNameBindings: [":row", ":setting", "overridden", "typeClass"],
  content: alias("setting"),
  validationMessage: null,
  isSecret: oneWay("setting.secret"),
  setting: null,

  @discourseComputed("buffered.value", "setting.value")
  dirty(bufferVal, settingVal) {
    if (isNone(bufferVal)) {
      bufferVal = "";
    }

    if (isNone(settingVal)) {
      settingVal = "";
    }

    return bufferVal.toString() !== settingVal.toString();
  },

  @discourseComputed("setting", "buffered.value")
  preview(setting, value) {
    // A bit hacky, but allows us to use helpers
    if (setting.setting === "category_style") {
      const category = this.site.get("categories.firstObject");
      if (category) {
        return categoryLinkHTML(category, { categoryStyle: value });
      }
    }

    const preview = setting.preview;
    if (preview) {
      const escapedValue = preview.replace(/\{\{value\}\}/g, value);
      return htmlSafe(`<div class='preview'>${escapedValue}</div>`);
    }
  },

  @discourseComputed("componentType")
  typeClass(componentType) {
    return componentType.replace(/\_/g, "-");
  },

  @discourseComputed("setting.setting", "setting.label")
  settingName(setting, label) {
    return label || setting.replace(/\_/g, " ");
  },

  @discourseComputed("type")
  componentType(type) {
    return CUSTOM_TYPES.indexOf(type) !== -1 ? type : "string";
  },

  @discourseComputed("setting")
  type(setting) {
    if (setting.type === "list" && setting.list_type) {
      return `${setting.list_type}_list`;
    }

    return setting.type;
  },

  componentName: fmt("typeClass", "site-settings/%@"),

  @discourseComputed("setting.anyValue")
  allowAny(anyValue) {
    return anyValue !== false;
  },

  overridden: propertyNotEqual("setting.default", "buffered.value"),

  @discourseComputed("buffered.value")
  bufferedValues(value) {
    return splitString(value, "|");
  },

  @discourseComputed("setting.defaultValues")
  defaultValues(value) {
    return splitString(value, "|");
  },

  @discourseComputed("defaultValues", "bufferedValues")
  defaultIsAvailable(defaultValues, bufferedValues) {
    return (
      defaultValues.length > 0 &&
      !defaultValues.every((value) => bufferedValues.includes(value))
    );
  },

  @action
  update() {
    const defaultUserPreferences = [
      "default_email_digest_frequency",
      "default_include_tl0_in_digests",
      "default_email_level",
      "default_email_messages_level",
      "default_email_mailing_list_mode",
      "default_email_mailing_list_mode_frequency",
      "default_email_previous_replies",
      "default_email_in_reply_to",
      "default_other_new_topic_duration_minutes",
      "default_other_auto_track_topics_after_msecs",
      "default_other_notification_level_when_replying",
      "default_other_external_links_in_new_tab",
      "default_other_enable_quoting",
      "default_other_enable_defer",
      "default_other_dynamic_favicon",
      "default_other_like_notification_frequency",
      "default_other_skip_new_user_tips",
      "default_topics_automatic_unpin",
      "default_categories_watching",
      "default_categories_tracking",
      "default_categories_muted",
      "default_categories_watching_first_post",
      "default_categories_regular",
      "default_tags_watching",
      "default_tags_tracking",
      "default_tags_muted",
      "default_tags_watching_first_post",
      "default_text_size",
      "default_title_count_mode",
    ];
    const key = this.buffered.get("setting");

    if (defaultUserPreferences.includes(key)) {
      const data = {};
      data[key] = this.buffered.get("value");

      ajax(`/admin/site_settings/${key}/user_count.json`, {
        type: "PUT",
        data,
      }).then((result) => {
        const count = result.user_count;

        if (count > 0) {
          const controller = showModal("site-setting-default-categories", {
            model: { count, key: key.replaceAll("_", " ") },
            admin: true,
          });

          controller.set("onClose", () => {
            this.updateExistingUsers = controller.updateExistingUsers;
            this.save();
          });
        } else {
          this.save();
        }
      });
    } else {
      this.save();
    }
  },

  @action
  save() {
    this._save()
      .then(() => {
        this.set("validationMessage", null);
        this.commitBuffer();
        if (AUTO_REFRESH_ON_SAVE.includes(this.setting.setting)) {
          this.afterSave();
        }
      })
      .catch((e) => {
        if (e.jqXHR?.responseJSON?.errors) {
          this.set("validationMessage", e.jqXHR.responseJSON.errors[0]);
        } else {
          this.set("validationMessage", I18n.t("generic_error"));
        }
      });
  },

  @action
  cancel() {
    this.rollbackBuffer();
  },

  @action
  resetDefault() {
    this.set("buffered.value", this.get("setting.default"));
  },

  @action
  toggleSecret() {
    this.toggleProperty("isSecret");
  },

  @action
  setDefaultValues() {
    this.set(
      "buffered.value",
      this.bufferedValues.concat(this.defaultValues).uniq().join("|")
    );
    return false;
  },

  @bind
  _handleKeydown(event) {
    if (
      event.key === "Enter" &&
      event.target.classList.contains("input-setting-string")
    ) {
      this.save();
    }
  },

  _watchEnterKey: on("didInsertElement", function () {
    this.element.addEventListener("keydown", this._handleKeydown);
  }),

  _removeBindings: on("willDestroyElement", function () {
    this.element.removeEventListener("keydown", this._handleKeydown);
  }),

  _save() {
    warn("You should define a `_save` method", {
      id: "discourse.setting-component.missing-save",
    });
    return Promise.resolve();
  },
});
