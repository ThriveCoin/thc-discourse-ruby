import DiscourseURL, { userPath } from "discourse/lib/url";
import CanCheckEmails from "discourse/mixins/can-check-emails";
import Controller from "@ember/controller";
import I18n from "I18n";
import { SECOND_FACTOR_METHODS } from "discourse/models/user";
import { alias } from "@ember/object/computed";
import bootbox from "bootbox";
import discourseComputed from "discourse-common/utils/decorators";
import { findAll } from "discourse/models/login-method";
import { iconHTML } from "discourse-common/lib/icon-library";
import { popupAjaxError } from "discourse/lib/ajax-error";
import showModal from "discourse/lib/show-modal";

export default Controller.extend(CanCheckEmails, {
  loading: false,
  dirty: false,
  resetPasswordLoading: false,
  resetPasswordProgress: "",
  password: null,
  errorMessage: null,
  newUsername: null,
  backupEnabled: alias("model.second_factor_backup_enabled"),
  secondFactorMethod: SECOND_FACTOR_METHODS.TOTP,
  totps: null,

  loaded: false,

  init() {
    this._super(...arguments);
    this.set("totps", []);
  },

  @discourseComputed
  displayOAuthWarning() {
    return findAll().length > 0;
  },

  @discourseComputed("currentUser")
  showEnforcedNotice(user) {
    return user && user.enforcedSecondFactor;
  },

  handleError(error) {
    if (error.jqXHR) {
      error = error.jqXHR;
    }
    let parsedJSON = error.responseJSON;
    if (parsedJSON.error_type === "invalid_access") {
      const usernameLower = this.model.username.toLowerCase();
      DiscourseURL.redirectTo(
        userPath(`${usernameLower}/preferences/second-factor`)
      );
    } else {
      popupAjaxError(error);
    }
  },

  loadSecondFactors() {
    if (this.dirty === false) {
      return;
    }
    this.set("loading", true);

    this.model
      .loadSecondFactorCodes(this.password)
      .then((response) => {
        if (response.error) {
          this.set("errorMessage", response.error);
          return;
        }

        this.setProperties({
          errorMessage: null,
          loaded: true,
          totps: response.totps,
          security_keys: response.security_keys,
          password: null,
          dirty: false,
        });
        this.set(
          "model.second_factor_enabled",
          (response.totps && response.totps.length > 0) ||
            (response.security_keys && response.security_keys.length > 0)
        );
      })
      .catch((e) => this.handleError(e))
      .finally(() => this.set("loading", false));
  },

  markDirty() {
    this.set("dirty", true);
  },

  actions: {
    confirmPassword() {
      if (!this.password) {
        return;
      }
      this.markDirty();
      this.loadSecondFactors();
      this.set("password", null);
    },

    resetPassword() {
      this.setProperties({
        resetPasswordLoading: true,
        resetPasswordProgress: "",
      });

      return this.model
        .changePassword()
        .then(() => {
          this.set(
            "resetPasswordProgress",
            I18n.t("user.change_password.success")
          );
        })
        .catch(popupAjaxError)
        .finally(() => this.set("resetPasswordLoading", false));
    },

    disableAllSecondFactors() {
      if (this.loading) {
        return;
      }
      const message = I18n.t("user.second_factor.disable_confirm");
      const buttons = [
        {
          label: I18n.t("cancel"),
          class: "d-modal-cancel",
          link: true,
        },
        {
          icon: iconHTML("ban"),
          label: I18n.t("user.second_factor.disable"),
          class: "btn-danger btn-icon-text",
          callback: () => {
            this.model
              .disableAllSecondFactors()
              .then(() => {
                const usernameLower = this.model.username.toLowerCase();
                DiscourseURL.redirectTo(
                  userPath(`${usernameLower}/preferences`)
                );
              })
              .catch((e) => this.handleError(e))
              .finally(() => this.set("loading", false));
          },
        },
      ];

      bootbox.dialog(message, buttons, {
        classes: "disable-second-factor-modal",
      });
    },

    createTotp() {
      const controller = showModal("second-factor-add-totp", {
        model: this.model,
        title: "user.second_factor.totp.add",
      });
      controller.setProperties({
        onClose: () => this.loadSecondFactors(),
        markDirty: () => this.markDirty(),
        onError: (e) => this.handleError(e),
      });
    },

    createSecurityKey() {
      const controller = showModal("second-factor-add-security-key", {
        model: this.model,
        title: "user.second_factor.security_key.add",
      });
      controller.setProperties({
        onClose: () => this.loadSecondFactors(),
        markDirty: () => this.markDirty(),
        onError: (e) => this.handleError(e),
      });
    },

    editSecurityKey(security_key) {
      const controller = showModal("second-factor-edit-security-key", {
        model: security_key,
        title: "user.second_factor.security_key.edit",
      });
      controller.setProperties({
        user: this.model,
        onClose: () => this.loadSecondFactors(),
        markDirty: () => this.markDirty(),
        onError: (e) => this.handleError(e),
      });
    },

    editSecondFactor(second_factor) {
      const controller = showModal("second-factor-edit", {
        model: second_factor,
        title: "user.second_factor.edit_title",
      });
      controller.setProperties({
        user: this.model,
        onClose: () => this.loadSecondFactors(),
        markDirty: () => this.markDirty(),
        onError: (e) => this.handleError(e),
      });
    },

    editSecondFactorBackup() {
      const controller = showModal("second-factor-backup-edit", {
        model: this.model,
        title: "user.second_factor_backup.title",
      });
      controller.setProperties({
        onClose: () => this.loadSecondFactors(),
        markDirty: () => this.markDirty(),
        onError: (e) => this.handleError(e),
      });
    },
  },
});
