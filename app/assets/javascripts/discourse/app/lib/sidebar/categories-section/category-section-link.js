import I18n from "I18n";

import { htmlSafe } from "@ember/template";

import { tracked } from "@glimmer/tracking";
import { bind } from "discourse-common/utils/decorators";
import { categoryBadgeHTML } from "discourse/helpers/category-link";
import Category from "discourse/models/category";

export default class CategorySectionLink {
  @tracked totalUnread = 0;
  @tracked totalNew = 0;

  constructor({ category, topicTrackingState }) {
    this.category = category;
    this.topicTrackingState = topicTrackingState;

    this.callbackId = this.topicTrackingState.onStateChange(
      this._refreshCounts
    );

    this._refreshCounts();
  }

  teardown() {
    this.topicTrackingState.offStateChange(this.callbackId);
  }

  @bind
  _refreshCounts() {
    this.totalUnread = this.topicTrackingState.countUnread({
      categoryId: this.category.id,
    });

    if (this.totalUnread === 0) {
      this.totalNew = this.topicTrackingState.countNew({
        categoryId: this.category.id,
      });
    }
  }

  get name() {
    return this.category.slug;
  }

  get route() {
    return "discovery.latestCategory";
  }

  get model() {
    return `${Category.slugFor(this.category)}/${this.category.id}`;
  }

  get currentWhen() {
    return "discovery.unreadCategory discovery.topCategory discovery.newCategory discovery.latestCategory";
  }

  get title() {
    return this.category.description_excerpt;
  }

  get text() {
    return htmlSafe(categoryBadgeHTML(this.category, { link: false }));
  }

  get badgeText() {
    if (this.totalUnread > 0) {
      return I18n.t("sidebar.unread_count", {
        count: this.totalUnread,
      });
    } else if (this.totalNew > 0) {
      return I18n.t("sidebar.new_count", {
        count: this.totalNew,
      });
    }
  }

  get route() {
    if (this.totalUnread > 0) {
      return "discovery.unreadCategory";
    } else if (this.totalNew > 0) {
      return "discovery.newCategory";
    } else {
      return "discovery.latestCategory";
    }
  }
}
