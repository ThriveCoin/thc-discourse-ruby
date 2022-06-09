import EmberObject, { get } from "@ember/object";
import { alias, sort } from "@ember/object/computed";
import Archetype from "discourse/models/archetype";
import PostActionType from "discourse/models/post-action-type";
import PreloadStore from "discourse/lib/preload-store";
import RestModel from "discourse/models/rest";
import Singleton from "discourse/mixins/singleton";
import TrustLevel from "discourse/models/trust-level";
import deprecated from "discourse-common/lib/deprecated";
import discourseComputed from "discourse-common/utils/decorators";
import { getOwner } from "discourse-common/lib/get-owner";
import { isEmpty } from "@ember/utils";
import { htmlSafe } from "@ember/template";

const Site = RestModel.extend({
  isReadOnly: alias("is_readonly"),

  init() {
    this._super(...arguments);

    this.topicCountDesc = ["topic_count:desc"];
  },

  @discourseComputed("notification_types")
  notificationLookup(notificationTypes) {
    const result = [];
    Object.keys(notificationTypes).forEach(
      (k) => (result[notificationTypes[k]] = k)
    );
    return result;
  },

  @discourseComputed("post_action_types.[]")
  flagTypes() {
    const postActionTypes = this.post_action_types;
    if (!postActionTypes) {
      return [];
    }
    return postActionTypes.filterBy("is_flag", true);
  },

  categoriesByCount: sort("categories", "topicCountDesc"),

  collectUserFields(fields) {
    fields = fields || {};

    let siteFields = this.user_fields;

    if (!isEmpty(siteFields)) {
      return siteFields.map((f) => {
        let value = fields ? fields[f.id.toString()] : null;
        value = value || htmlSafe("&mdash;");
        return { name: f.name, value };
      });
    }
    return [];
  },

  // Sort subcategories under parents
  @discourseComputed("categoriesByCount", "categories.[]")
  sortedCategories(categories) {
    const children = new Map();

    categories.forEach((category) => {
      const parentId = parseInt(category.parent_category_id, 10) || -1;
      const group = children.get(parentId) || [];
      group.pushObject(category);

      children.set(parentId, group);
    });

    const reduce = (values) =>
      values.flatMap((c) => [c, reduce(children.get(c.id) || [])]).flat();

    return reduce(children.get(-1));
  },

  // Returns it in the correct order, by setting
  @discourseComputed("categories.[]")
  categoriesList() {
    return this.siteSettings.fixed_category_positions
      ? this.categories
      : this.sortedCategories;
  },

  @discourseComputed("categories.[]", "categories.@each.notification_level")
  trackedCategoriesList(categories) {
    const trackedCategories = [];

    for (const category of categories) {
      if (category.isTracked) {
        if (
          !this.siteSettings.suppress_uncategorized_badge ||
          category.id !== this.uncategorized_category_id
        ) {
          trackedCategories.push(category);
        }
      }
    }

    return trackedCategories;
  },

  postActionTypeById(id) {
    return this.get("postActionByIdLookup.action" + id);
  },

  topicFlagTypeById(id) {
    return this.get("topicFlagByIdLookup.action" + id);
  },

  removeCategory(id) {
    const categories = this.categories;
    const existingCategory = categories.findBy("id", id);
    if (existingCategory) {
      categories.removeObject(existingCategory);
      delete this.categoriesById.categoryId;
    }
  },

  updateCategory(newCategory) {
    const categories = this.categories;
    const categoryId = get(newCategory, "id");
    const existingCategory = categories.findBy("id", categoryId);

    // Don't update null permissions
    if (newCategory.permission === null) {
      delete newCategory.permission;
    }

    if (existingCategory) {
      existingCategory.setProperties(newCategory);
      return existingCategory;
    } else {
      // TODO insert in right order?
      newCategory = this.store.createRecord("category", newCategory);
      categories.pushObject(newCategory);
      this.categoriesById[categoryId] = newCategory;
      return newCategory;
    }
  },
});

Site.reopenClass(Singleton, {
  // The current singleton will retrieve its attributes from the `PreloadStore`.
  createCurrent() {
    const store = getOwner(this).lookup("service:store");
    const siteAttributes = PreloadStore.get("site");
    siteAttributes["isReadOnly"] = PreloadStore.get("isReadOnly");
    siteAttributes["isStaffWritesOnly"] = PreloadStore.get("isStaffWritesOnly");
    return store.createRecord("site", siteAttributes);
  },

  create() {
    const result = this._super.apply(this, arguments);
    const store = result.store;

    if (result.categories) {
      let subcatMap = {};

      result.categoriesById = {};
      result.categories = result.categories.map((c) => {
        if (c.parent_category_id) {
          subcatMap[c.parent_category_id] =
            subcatMap[c.parent_category_id] || [];
          subcatMap[c.parent_category_id].push(c.id);
        }
        return (result.categoriesById[c.id] = store.createRecord(
          "category",
          c
        ));
      });

      // Associate the categories with their parents
      result.categories.forEach((c) => {
        let subcategoryIds = subcatMap[c.get("id")];
        if (subcategoryIds) {
          c.set(
            "subcategories",
            subcategoryIds.map((id) => result.categoriesById[id])
          );
        }
        if (c.get("parent_category_id")) {
          c.set(
            "parentCategory",
            result.categoriesById[c.get("parent_category_id")]
          );
        }
      });
    }

    if (result.trust_levels) {
      result.trustLevels = Object.entries(result.trust_levels).map(
        ([key, id]) => {
          return new TrustLevel(id, key);
        }
      );
      delete result.trust_levels;
    }

    if (result.post_action_types) {
      result.postActionByIdLookup = EmberObject.create();
      result.post_action_types = result.post_action_types.map((p) => {
        const actionType = PostActionType.create(p);
        result.postActionByIdLookup.set("action" + p.id, actionType);
        return actionType;
      });
    }

    if (result.topic_flag_types) {
      result.topicFlagByIdLookup = EmberObject.create();
      result.topic_flag_types = result.topic_flag_types.map((p) => {
        const actionType = PostActionType.create(p);
        result.topicFlagByIdLookup.set("action" + p.id, actionType);
        return actionType;
      });
    }

    if (result.archetypes) {
      result.archetypes = result.archetypes.map((a) => {
        a.site = result;
        return Archetype.create(a);
      });
    }

    if (result.user_fields) {
      result.user_fields = result.user_fields.map((uf) =>
        EmberObject.create(uf)
      );
    }

    return result;
  },
});

if (typeof Discourse !== "undefined") {
  let warned = false;
  // eslint-disable-next-line no-undef
  Object.defineProperty(Discourse, "Site", {
    get() {
      if (!warned) {
        deprecated("Import the Site class instead of using Discourse.Site", {
          since: "2.4.0",
          dropFrom: "2.6.0",
        });
        warned = true;
      }
      return Site;
    },
  });
}

export default Site;
