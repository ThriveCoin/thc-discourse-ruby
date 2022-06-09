import Controller, { inject as controller } from "@ember/controller";
import I18n from "I18n";
import { action } from "@ember/object";
import bootbox from "bootbox";
import { bufferedProperty } from "discourse/mixins/buffered-content";
import discourseComputed from "discourse-common/utils/decorators";
import { popupAjaxError } from "discourse/lib/ajax-error";

export default Controller.extend(bufferedProperty("emailTemplate"), {
  adminCustomizeEmailTemplates: controller(),
  emailTemplate: null,
  saved: false,

  @discourseComputed("buffered.body", "buffered.subject")
  saveDisabled(body, subject) {
    return (
      this.emailTemplate.body === body && this.emailTemplate.subject === subject
    );
  },

  @discourseComputed("buffered")
  hasMultipleSubjects(buffered) {
    if (buffered.getProperties("subject")["subject"]) {
      return false;
    } else {
      return buffered.getProperties("id")["id"];
    }
  },

  @action
  saveChanges() {
    this.set("saved", false);
    const buffered = this.buffered;
    this.emailTemplate
      .save(buffered.getProperties("subject", "body"))
      .then(() => {
        this.set("saved", true);
      })
      .catch(popupAjaxError);
  },

  @action
  revertChanges() {
    this.set("saved", false);
    bootbox.confirm(
      I18n.t("admin.customize.email_templates.revert_confirm"),
      (result) => {
        if (result) {
          this.emailTemplate
            .revert()
            .then((props) => {
              const buffered = this.buffered;
              buffered.setProperties(props);
              this.commitBuffer();
            })
            .catch(popupAjaxError);
        }
      }
    );
  },
});
