import discourseComputed, {
  observes,
  on,
} from "discourse-common/utils/decorators";
import Component from "@ember/component";
import I18n from "I18n";
import { findRawTemplate } from "discourse-common/lib/raw-templates";
import { makeArray } from "discourse-common/lib/helpers";

export default Component.extend({
  @discourseComputed("placeholderKey")
  placeholder(placeholderKey) {
    return placeholderKey ? I18n.t(placeholderKey) : "";
  },

  @observes("badgeNames")
  _update() {
    if (this.canReceiveUpdates === "true") {
      this._initializeAutocomplete({ updateData: true });
    }
  },

  @on("didInsertElement")
  _initializeAutocomplete(opts) {
    let selectedBadges;

    $(this.element.querySelector("input")).autocomplete({
      allowAny: false,
      items: makeArray(this.badgeNames),
      single: this.single,
      updateData: opts && opts.updateData ? opts.updateData : false,
      template: findRawTemplate("badge-selector-autocomplete"),

      onChangeItems(items) {
        selectedBadges = items;
        this.set("badgeNames", items.join(","));
      },

      transformComplete(g) {
        return g.name;
      },

      dataSource(term) {
        return this.badgeFinder(term).then((badges) => {
          if (!selectedBadges) {
            return badges;
          }

          return badges.filter(
            (badge) => !selectedBadges.any((s) => s === badge.name)
          );
        });
      },
    });
  },
});
