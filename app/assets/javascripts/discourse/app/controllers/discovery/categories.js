import DiscoveryController from "discourse/controllers/discovery";
import { inject as controller } from "@ember/controller";
import { dasherize } from "@ember/string";
import discourseComputed from "discourse-common/utils/decorators";
import { reads } from "@ember/object/computed";

const subcategoryStyleComponentNames = {
  rows: "categories_only",
  rows_with_featured_topics: "categories_with_featured_topics",
  boxes: "categories_boxes",
  boxes_with_featured_topics: "categories_boxes_with_topics",
};

const mobileCompatibleViews = [
  "categories_with_featured_topics",
  "subcategories_with_featured_topics",
];

export default DiscoveryController.extend({
  discovery: controller(),

  // this makes sure the composer isn't scoping to a specific category
  category: null,

  canEdit: reads("currentUser.staff"),

  @discourseComputed("model.parentCategory")
  categoryPageStyle(parentCategory) {
    let style = this.siteSettings.desktop_category_page_style;

    if (this.site.mobileView && !mobileCompatibleViews.includes(style)) {
      style = mobileCompatibleViews[0];
    }

    if (parentCategory) {
      style =
        subcategoryStyleComponentNames[
          parentCategory.get("subcategory_list_style")
        ] || style;
    }

    const componentName =
      parentCategory && style === "categories_and_latest_topics"
        ? "categories_only"
        : style;
    return dasherize(componentName);
  },
  actions: {
    refresh() {
      this.send("triggerRefresh");
    },
    showInserted() {
      const tracker = this.topicTrackingState;

      // Move inserted into topics
      this.model.loadBefore(tracker.get("newIncoming"), true);
      tracker.resetTracking();
      return false;
    },
  },
});
