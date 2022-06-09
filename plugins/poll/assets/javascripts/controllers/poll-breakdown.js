import Controller from "@ember/controller";
import I18n from "I18n";
import ModalFunctionality from "discourse/mixins/modal-functionality";
import { action } from "@ember/object";
import { ajax } from "discourse/lib/ajax";
import { classify } from "@ember/string";
import discourseComputed from "discourse-common/utils/decorators";
import { htmlSafe } from "@ember/template";
import loadScript from "discourse/lib/load-script";
import { popupAjaxError } from "discourse/lib/ajax-error";
import bootbox from "bootbox";

export default Controller.extend(ModalFunctionality, {
  model: null,
  charts: null,
  groupedBy: null,
  highlightedOption: null,
  displayMode: "percentage",

  @discourseComputed("model.poll.title", "model.post.topic.title")
  title(pollTitle, topicTitle) {
    return pollTitle ? htmlSafe(pollTitle) : topicTitle;
  },

  @discourseComputed("model.groupableUserFields")
  groupableUserFields(fields) {
    return fields.map((field) => {
      const transformed = field.split("_").filter(Boolean);

      if (transformed.length > 1) {
        transformed[0] = classify(transformed[0]);
      }

      return { id: field, label: transformed.join(" ") };
    });
  },

  @discourseComputed("model.poll.options")
  totalVotes(options) {
    return options.reduce((sum, option) => sum + option.votes, 0);
  },

  onShow() {
    this.set("charts", null);
    this.set("displayMode", "percentage");
    this.set("groupedBy", this.model.groupableUserFields[0]);

    loadScript("/javascripts/Chart.min.js")
      .then(() => loadScript("/javascripts/chartjs-plugin-datalabels.min.js"))
      .then(() => {
        this.fetchGroupedPollData();
      });
  },

  fetchGroupedPollData() {
    return ajax("/polls/grouped_poll_results.json", {
      data: {
        post_id: this.model.post.id,
        poll_name: this.model.poll.name,
        user_field_name: this.groupedBy,
      },
    })
      .catch((error) => {
        if (error) {
          popupAjaxError(error);
        } else {
          bootbox.alert(I18n.t("poll.error_while_fetching_voters"));
        }
      })
      .then((result) => {
        if (this.isDestroying || this.isDestroyed) {
          return;
        }

        this.set("charts", result.grouped_results);
      });
  },

  @action
  setGrouping(value) {
    this.set("groupedBy", value);
    this.fetchGroupedPollData();
  },

  @action
  onSelectPanel(panel) {
    this.set("displayMode", panel.id);
  },
});
