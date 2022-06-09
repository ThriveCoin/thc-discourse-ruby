import EmberObject from "@ember/object";
import I18n from "I18n";
import Setting from "admin/mixins/setting-object";
import { ajax } from "discourse/lib/ajax";
import discourseComputed from "discourse-common/utils/decorators";

const SiteSetting = EmberObject.extend(Setting, {
  @discourseComputed("setting")
  staffLogFilter(setting) {
    if (!setting) {
      return;
    }

    return {
      subject: setting,
      action_name: "change_site_setting",
    };
  },
});

SiteSetting.reopenClass({
  findAll() {
    return ajax("/admin/site_settings").then(function (settings) {
      // Group the results by category
      const categories = {};
      settings.site_settings.forEach(function (s) {
        if (!categories[s.category]) {
          categories[s.category] = [];
        }
        categories[s.category].pushObject(SiteSetting.create(s));
      });

      return Object.keys(categories).map(function (n) {
        return {
          nameKey: n,
          name: I18n.t("admin.site_settings.categories." + n),
          siteSettings: categories[n],
        };
      });
    });
  },

  update(key, value, opts = {}) {
    const data = {};
    data[key] = value;

    if (opts["updateExistingUsers"] === true) {
      data["update_existing_user"] = true;
    }

    return ajax(`/admin/site_settings/${key}`, { type: "PUT", data });
  },
});

export default SiteSetting;
