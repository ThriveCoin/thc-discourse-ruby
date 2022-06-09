import Component from "@ember/component";
import I18n from "I18n";
import discourseComputed from "discourse-common/utils/decorators";
import { emojiUrlFor } from "discourse/lib/text";
import { action, set, setProperties } from "@ember/object";
import { later, schedule } from "@ember/runloop";

export default Component.extend({
  classNameBindings: [":value-list", ":emoji-list"],
  values: null,
  validationMessage: null,
  emojiPickerIsActive: false,
  isEditorFocused: false,

  @discourseComputed("values")
  collection(values) {
    values = values || "";

    return values
      .split("|")
      .filter(Boolean)
      .map((value) => {
        return {
          isEditable: true,
          isEditing: false,
          value,
          emojiUrl: emojiUrlFor(value),
        };
      });
  },

  @action
  closeEmojiPicker() {
    this.collection.setEach("isEditing", false);
    this.set("emojiPickerIsActive", false);
    this.set("isEditorFocused", false);
  },

  @action
  emojiSelected(code) {
    if (!this._validateInput(code)) {
      return;
    }

    const item = this.collection.findBy("isEditing");
    if (item) {
      setProperties(item, {
        value: code,
        emojiUrl: emojiUrlFor(code),
        isEditing: false,
      });

      this._saveValues();
    } else {
      const newCollectionValue = {
        value: code,
        emojiUrl: emojiUrlFor(code),
        isEditable: true,
        isEditing: false,
      };
      this.collection.addObject(newCollectionValue);
      this._saveValues();
    }

    this.set("emojiPickerIsActive", false);
    this.set("isEditorFocused", false);
  },

  @discourseComputed("collection")
  showUpDownButtons(collection) {
    return collection.length - 1 ? true : false;
  },

  _splitValues(values) {
    if (values && values.length) {
      const emojiList = [];
      const emojis = values.split("|").filter(Boolean);
      emojis.forEach((emojiName) => {
        const emoji = {
          isEditable: true,
          isEditing: false,
        };
        emoji.value = emojiName;
        emoji.emojiUrl = emojiUrlFor(emojiName);

        emojiList.push(emoji);
      });

      return emojiList;
    } else {
      return [];
    }
  },

  @action
  editValue(index) {
    this.closeEmojiPicker();
    schedule("afterRender", () => {
      if (parseInt(index, 10) >= 0) {
        const item = this.collection[index];
        if (item.isEditable) {
          set(item, "isEditing", true);
        }
      }

      this.set("isEditorFocused", true);
      later(() => {
        if (this.element && !this.isDestroying && !this.isDestroyed) {
          this.set("emojiPickerIsActive", true);
        }
      }, 100);
    });
  },

  @action
  removeValue(value) {
    this._removeValue(value);
  },

  @action
  shift(operation, index) {
    let futureIndex = index + operation;

    if (futureIndex > this.collection.length - 1) {
      futureIndex = 0;
    } else if (futureIndex < 0) {
      futureIndex = this.collection.length - 1;
    }

    const shiftedEmoji = this.collection[index];
    this.collection.removeAt(index);
    this.collection.insertAt(futureIndex, shiftedEmoji);

    this._saveValues();
  },

  _validateInput(input) {
    this.set("validationMessage", null);

    if (!emojiUrlFor(input)) {
      this.set(
        "validationMessage",
        I18n.t("admin.site_settings.emoji_list.invalid_input")
      );
      return false;
    }

    return true;
  },

  _removeValue(value) {
    this.collection.removeObject(value);
    this._saveValues();
  },

  _replaceValue(index, newValue) {
    const item = this.collection[index];
    if (item.value === newValue) {
      return;
    }
    set(item, "value", newValue);
    this._saveValues();
  },

  _saveValues() {
    this.set("values", this.collection.mapBy("value").join("|"));
  },
});
