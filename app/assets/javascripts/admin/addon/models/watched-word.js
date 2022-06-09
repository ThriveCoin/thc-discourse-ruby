import EmberObject from "@ember/object";
import I18n from "I18n";
import { ajax } from "discourse/lib/ajax";

const WatchedWord = EmberObject.extend({
  save() {
    return ajax(
      "/admin/customize/watched_words" +
        (this.id ? "/" + this.id : "") +
        ".json",
      {
        type: this.id ? "PUT" : "POST",
        data: {
          word: this.word,
          replacement: this.replacement,
          action_key: this.action,
        },
        dataType: "json",
      }
    );
  },

  destroy() {
    return ajax("/admin/customize/watched_words/" + this.id + ".json", {
      type: "DELETE",
    });
  },
});

WatchedWord.reopenClass({
  findAll() {
    return ajax("/admin/customize/watched_words.json").then((list) => {
      const actions = {};

      list.actions.forEach((action) => {
        actions[action] = [];
      });

      list.words.forEach((watchedWord) => {
        actions[watchedWord.action].pushObject(WatchedWord.create(watchedWord));
      });

      return Object.keys(actions).map((nameKey) => {
        return EmberObject.create({
          nameKey,
          name: I18n.t("admin.watched_words.actions." + nameKey),
          words: actions[nameKey],
          compiledRegularExpression: list.compiled_regular_expressions[nameKey],
        });
      });
    });
  },
});

export default WatchedWord;
