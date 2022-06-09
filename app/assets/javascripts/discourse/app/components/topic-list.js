import { alias, and, reads } from "@ember/object/computed";
import discourseComputed, { observes } from "discourse-common/utils/decorators";
import Component from "@ember/component";
import LoadMore from "discourse/mixins/load-more";
import { on } from "@ember/object/evented";
import { next, schedule } from "@ember/runloop";
import showModal from "discourse/lib/show-modal";

export default Component.extend(LoadMore, {
  tagName: "table",
  classNames: ["topic-list"],
  classNameBindings: ["bulkSelectEnabled:sticky-header"],
  showTopicPostBadges: true,
  listTitle: "topic.title",
  canDoBulkActions: and("currentUser.staff", "selected.length"),

  // Overwrite this to perform client side filtering of topics, if desired
  filteredTopics: alias("topics"),

  _init: on("init", function () {
    this.addObserver("hideCategory", this.rerender);
    this.addObserver("order", this.rerender);
    this.addObserver("ascending", this.rerender);
    this.refreshLastVisited();
  }),

  @discourseComputed("bulkSelectEnabled")
  toggleInTitle(bulkSelectEnabled) {
    return !bulkSelectEnabled && this.canBulkSelect;
  },

  @discourseComputed
  sortable() {
    return !!this.changeSort;
  },

  skipHeader: reads("site.mobileView"),

  @discourseComputed("order")
  showLikes(order) {
    return order === "likes";
  },

  @discourseComputed("order")
  showOpLikes(order) {
    return order === "op_likes";
  },

  @observes("topics.[]")
  topicsAdded() {
    // special case so we don't keep scanning huge lists
    if (!this.lastVisitedTopic) {
      this.refreshLastVisited();
    }
  },

  @observes("topics", "order", "ascending", "category", "top")
  lastVisitedTopicChanged() {
    this.refreshLastVisited();
  },

  scrolled() {
    this._super(...arguments);
    let onScroll = this.onScroll;
    if (!onScroll) {
      return;
    }

    onScroll.call(this);
  },

  scrollToLastPosition() {
    if (!this.scrollOnLoad) {
      return;
    }

    const scrollTo = this.session.topicListScrollPosition;
    if (scrollTo >= 0) {
      schedule("afterRender", () => {
        if (this.element && !this.isDestroying && !this.isDestroyed) {
          next(() => window.scrollTo(0, scrollTo + 1));
        }
      });
    }
  },

  didInsertElement() {
    this._super(...arguments);
    this.scrollToLastPosition();
  },

  _updateLastVisitedTopic(topics, order, ascending, top) {
    this.set("lastVisitedTopic", null);

    if (!this.highlightLastVisited) {
      return;
    }

    if (order && order !== "activity") {
      return;
    }

    if (top) {
      return;
    }

    if (!topics || topics.length === 1) {
      return;
    }

    if (ascending) {
      return;
    }

    let user = this.currentUser;
    if (!user || !user.previous_visit_at) {
      return;
    }

    let lastVisitedTopic, topic;

    let prevVisit = user.get("previousVisitAt");

    // this is more efficient cause we keep appending to list
    // work backwards
    let start = 0;
    while (topics[start] && topics[start].get("pinned")) {
      start++;
    }

    let i;
    for (i = topics.length - 1; i >= start; i--) {
      if (topics[i].get("bumpedAt") > prevVisit) {
        lastVisitedTopic = topics[i];
        break;
      }
      topic = topics[i];
    }

    if (!lastVisitedTopic || !topic) {
      return;
    }

    // end of list that was scanned
    if (topic.get("bumpedAt") > prevVisit) {
      return;
    }

    this.set("lastVisitedTopic", lastVisitedTopic);
  },

  refreshLastVisited() {
    this._updateLastVisitedTopic(
      this.topics,
      this.order,
      this.ascending,
      this.top
    );
  },

  updateAutoAddTopicsToBulkSelect(newVal) {
    this.set("autoAddTopicsToBulkSelect", newVal);
  },

  click(e) {
    const onClick = (sel, callback) => {
      let target = $(e.target).closest(sel);

      if (target.length === 1) {
        callback.apply(this, [target]);
      }
    };

    onClick("button.bulk-select", function () {
      this.toggleBulkSelect();
      this.rerender();
    });

    onClick("button.bulk-select-all", function () {
      this.updateAutoAddTopicsToBulkSelect(true);
      $("input.bulk-select:not(:checked)").click();
    });

    onClick("button.bulk-clear-all", function () {
      this.updateAutoAddTopicsToBulkSelect(false);
      $("input.bulk-select:checked").click();
    });

    onClick("th.sortable", function (e2) {
      this.changeSort(e2.data("sort-order"));
      this.rerender();
    });

    onClick("button.bulk-select-actions", function () {
      const controller = showModal("topic-bulk-actions", {
        model: {
          topics: this.selected,
          category: this.category,
        },
        title: "topics.bulk.actions",
      });

      const action = this.bulkSelectAction;
      if (action) {
        controller.set("refreshClosure", () => action());
      }
    });
  },

  keyDown(e) {
    if (e.key === "Enter" || e.key === " ") {
      let onKeyDown = (sel, callback) => {
        let target = $(e.target).closest(sel);

        if (target.length === 1) {
          callback.apply(this, [target]);
        }
      };

      onKeyDown("th.sortable", (e2) => {
        this.changeSort(e2.data("sort-order"));
        this.rerender();
      });
    }
  },
});
