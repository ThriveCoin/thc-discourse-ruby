import DiscourseRoute from "discourse/routes/discourse";
import EmberObject from "@ember/object";
import showModal from "discourse/lib/show-modal";

export default DiscourseRoute.extend({
  queryParams: {
    filters: { refreshModel: true },
  },

  beforeModel(transition) {
    const params = transition.to.queryParams;
    const controller = this.controllerFor("admin-logs-staff-action-logs");
    if (controller.filters === null || params.force_refresh) {
      controller.resetFilters();
    }
  },

  deserializeQueryParam(value, urlKey, defaultValueType) {
    if (urlKey === "filters") {
      return EmberObject.create(JSON.parse(decodeURIComponent(value)));
    }

    return this._super(value, urlKey, defaultValueType);
  },

  serializeQueryParam(value, urlKey, defaultValueType) {
    if (urlKey === "filters") {
      if (value && Object.keys(value).length > 0) {
        return JSON.stringify(value);
      } else {
        return null;
      }
    }

    return this._super(value, urlKey, defaultValueType);
  },

  // TODO: make this automatic using an `{{outlet}}`
  renderTemplate() {
    this.render("admin/templates/logs/staff-action-logs", {
      into: "adminLogs",
    });
  },

  actions: {
    showDetailsModal(model) {
      showModal("admin-staff-action-log-details", { model, admin: true });
      this.controllerFor("modal").set("modalClass", "log-details-modal");
    },

    showCustomDetailsModal(model) {
      let modal = showModal("admin-theme-change", { model, admin: true });
      this.controllerFor("modal").set("modalClass", "history-modal");
      modal.loadDiff();
    },

    onFiltersChange(filters) {
      if (filters && Object.keys(filters) === 0) {
        this.transitionTo("adminLogs.staffActionLogs");
      } else {
        this.transitionTo("adminLogs.staffActionLogs", {
          queryParams: { filters },
        });
      }
    },
  },
});
