import DiscourseURL, { userPath } from "discourse/lib/url";
import { and, notEmpty } from "@ember/object/computed";
import { fmt, propertyNotEqual, setting } from "discourse/lib/computed";
import AdminUser from "admin/models/admin-user";
import CanCheckEmails from "discourse/mixins/can-check-emails";
import Controller from "@ember/controller";
import I18n from "I18n";
import { ajax } from "discourse/lib/ajax";
import bootbox from "bootbox";
import discourseComputed from "discourse-common/utils/decorators";
import getURL from "discourse-common/lib/get-url";
import { htmlSafe } from "@ember/template";
import { iconHTML } from "discourse-common/lib/icon-library";
import { extractError, popupAjaxError } from "discourse/lib/ajax-error";
import { inject as service } from "@ember/service";
import showModal from "discourse/lib/show-modal";

export default Controller.extend(CanCheckEmails, {
  router: service(),
  adminTools: service(),
  originalPrimaryGroupId: null,
  customGroupIdsBuffer: null,
  availableGroups: null,
  userTitleValue: null,
  ssoExternalEmail: null,
  ssoLastPayload: null,

  showBadges: setting("enable_badges"),
  hasLockedTrustLevel: notEmpty("model.manual_locked_trust_level"),

  primaryGroupDirty: propertyNotEqual(
    "originalPrimaryGroupId",
    "model.primary_group_id"
  ),

  canDisableSecondFactor: and(
    "model.second_factor_enabled",
    "model.can_disable_second_factor"
  ),

  @discourseComputed("model.customGroups")
  customGroupIds(customGroups) {
    return customGroups.mapBy("id");
  },

  @discourseComputed("customGroupIdsBuffer", "customGroupIds")
  customGroupsDirty(buffer, original) {
    if (buffer === null) {
      return false;
    }

    return buffer.length === original.length
      ? buffer.any((id) => !original.includes(id))
      : true;
  },

  @discourseComputed("model.automaticGroups")
  automaticGroups(automaticGroups) {
    return automaticGroups
      .map((group) => {
        const name = htmlSafe(group.name);
        return `<a href="/g/${name}">${name}</a>`;
      })
      .join(", ");
  },

  @discourseComputed("model.associated_accounts")
  associatedAccountsLoaded(associatedAccounts) {
    return typeof associatedAccounts !== "undefined";
  },

  @discourseComputed("model.associated_accounts")
  associatedAccounts(associatedAccounts) {
    return associatedAccounts
      .map((provider) => `${provider.name} (${provider.description})`)
      .join(", ");
  },

  @discourseComputed("model.user_fields.[]")
  userFields(userFields) {
    return this.site.collectUserFields(userFields);
  },

  preferencesPath: fmt("model.username_lower", userPath("%@/preferences")),

  @discourseComputed(
    "model.can_delete_all_posts",
    "model.staff",
    "model.post_count"
  )
  deleteAllPostsExplanation(canDeleteAllPosts, staff, postCount) {
    if (canDeleteAllPosts) {
      return null;
    }

    if (staff) {
      return I18n.t("admin.user.delete_posts_forbidden_because_staff");
    }
    if (postCount > this.siteSettings.delete_all_posts_max) {
      return I18n.t("admin.user.cant_delete_all_too_many_posts", {
        count: this.siteSettings.delete_all_posts_max,
      });
    } else {
      return I18n.t("admin.user.cant_delete_all_posts", {
        count: this.siteSettings.delete_user_max_post_age,
      });
    }
  },

  @discourseComputed("model.canBeDeleted", "model.staff")
  deleteExplanation(canBeDeleted, staff) {
    if (canBeDeleted) {
      return null;
    }

    if (staff) {
      return I18n.t("admin.user.delete_forbidden_because_staff");
    } else {
      return I18n.t("admin.user.delete_forbidden", {
        count: this.siteSettings.delete_user_max_post_age,
      });
    }
  },

  @discourseComputed("model.username")
  postEditsByEditorFilter(username) {
    return { editor: username };
  },

  groupAdded(added) {
    this.model
      .groupAdded(added)
      .catch(() => bootbox.alert(I18n.t("generic_error")));
  },

  groupRemoved(groupId) {
    this.model
      .groupRemoved(groupId)
      .then(() => {
        if (groupId === this.originalPrimaryGroupId) {
          this.set("originalPrimaryGroupId", null);
        }
      })
      .catch(() => bootbox.alert(I18n.t("generic_error")));
  },

  @discourseComputed("ssoLastPayload")
  ssoPayload(lastPayload) {
    return lastPayload.split("&");
  },

  actions: {
    impersonate() {
      return this.model
        .impersonate()
        .then(() => DiscourseURL.redirectTo("/"))
        .catch((e) => {
          if (e.status === 404) {
            bootbox.alert(I18n.t("admin.impersonate.not_found"));
          } else {
            bootbox.alert(I18n.t("admin.impersonate.invalid"));
          }
        });
    },
    logOut() {
      return this.model
        .logOut()
        .then(() => bootbox.alert(I18n.t("admin.user.logged_out")));
    },
    resetBounceScore() {
      return this.model.resetBounceScore();
    },
    approve() {
      return this.model.approve(this.currentUser);
    },

    _formatError(event) {
      return `http: ${event.status} - ${event.body}`;
    },

    deactivate() {
      return this.model
        .deactivate()
        .then(() =>
          this.model.setProperties({ active: false, can_activate: true })
        )
        .catch((e) => {
          const error = I18n.t("admin.user.deactivate_failed", {
            error: this._formatError(e),
          });
          bootbox.alert(error);
        });
    },
    sendActivationEmail() {
      return this.model
        .sendActivationEmail()
        .then(() => bootbox.alert(I18n.t("admin.user.activation_email_sent")))
        .catch(popupAjaxError);
    },
    activate() {
      return this.model
        .activate()
        .then(() =>
          this.model.setProperties({
            active: true,
            can_deactivate: !this.model.staff,
          })
        )
        .catch((e) => {
          const error = I18n.t("admin.user.activate_failed", {
            error: this._formatError(e),
          });
          bootbox.alert(error);
        });
    },
    revokeAdmin() {
      return this.model.revokeAdmin();
    },
    grantAdmin() {
      return this.model
        .grantAdmin()
        .then((result) => {
          if (result.email_confirmation_required) {
            bootbox.alert(I18n.t("admin.user.grant_admin_confirm"));
          }
        })
        .catch((error) => {
          const nonce = error.jqXHR?.responseJSON.second_factor_challenge_nonce;
          if (nonce) {
            this.router.transitionTo("second-factor-auth", {
              queryParams: { nonce },
            });
          } else {
            popupAjaxError(error);
          }
        });
    },
    revokeModeration() {
      return this.model.revokeModeration();
    },
    grantModeration() {
      return this.model.grantModeration();
    },
    saveTrustLevel() {
      return this.model
        .saveTrustLevel()
        .then(() => window.location.reload())
        .catch((e) => {
          let error;
          if (e.jqXHR.responseJSON && e.jqXHR.responseJSON.errors) {
            error = e.jqXHR.responseJSON.errors[0];
          }
          error =
            error ||
            I18n.t("admin.user.trust_level_change_failed", {
              error: this._formatError(e),
            });
          bootbox.alert(error);
        });
    },
    restoreTrustLevel() {
      return this.model.restoreTrustLevel();
    },
    lockTrustLevel(locked) {
      return this.model
        .lockTrustLevel(locked)
        .then(() => window.location.reload())
        .catch((e) => {
          let error;
          if (e.jqXHR.responseJSON && e.jqXHR.responseJSON.errors) {
            error = e.jqXHR.responseJSON.errors[0];
          }
          error =
            error ||
            I18n.t("admin.user.trust_level_change_failed", {
              error: this._formatError(e),
            });
          bootbox.alert(error);
        });
    },
    unsilence() {
      return this.model.unsilence();
    },
    silence() {
      return this.model.silence();
    },

    anonymize() {
      const user = this.model;
      const message = I18n.t("admin.user.anonymize_confirm");

      const performAnonymize = () => {
        this.model
          .anonymize()
          .then((data) => {
            if (data.success) {
              if (data.username) {
                document.location = getURL(
                  `/admin/users/${user.get("id")}/${data.username}`
                );
              } else {
                document.location = getURL("/admin/users/list/active");
              }
            } else {
              bootbox.alert(I18n.t("admin.user.anonymize_failed"));
              if (data.user) {
                user.setProperties(data.user);
              }
            }
          })
          .catch(() => bootbox.alert(I18n.t("admin.user.anonymize_failed")));
      };
      const buttons = [
        {
          label: I18n.t("composer.cancel"),
          class: "cancel",
          link: true,
        },
        {
          label: I18n.t("admin.user.anonymize_yes"),
          class: "btn btn-danger",
          icon: iconHTML("exclamation-triangle"),
          callback: () => {
            performAnonymize();
          },
        },
      ];

      bootbox.dialog(message, buttons, { classes: "delete-user-modal" });
    },

    disableSecondFactor() {
      return this.model.disableSecondFactor();
    },

    clearPenaltyHistory() {
      const user = this.model;
      const path = `/admin/users/${user.get("id")}/penalty_history`;

      return ajax(path, { type: "DELETE" })
        .then(() => user.set("tl3_requirements.penalty_counts.total", 0))
        .catch(popupAjaxError);
    },

    destroy() {
      const postCount = this.get("model.post_count");
      const maxPostCount = this.siteSettings.delete_all_posts_max;
      const message = I18n.t("admin.user.delete_confirm");
      const location = document.location.pathname;

      const performDestroy = (block) => {
        bootbox.dialog(I18n.t("admin.user.deleting_user"));
        let formData = { context: location };
        if (block) {
          formData["block_email"] = true;
          formData["block_urls"] = true;
          formData["block_ip"] = true;
        }
        if (postCount <= maxPostCount) {
          formData["delete_posts"] = true;
        }
        this.model
          .destroy(formData)
          .then((data) => {
            if (data.deleted) {
              if (/^\/admin\/users\/list\//.test(location)) {
                document.location = location;
              } else {
                document.location = getURL("/admin/users/list/active");
              }
            } else {
              bootbox.alert(I18n.t("admin.user.delete_failed"));
            }
          })
          .catch(() => {
            bootbox.alert(I18n.t("admin.user.delete_failed"));
          });
      };

      const buttons = [
        {
          label: I18n.t("composer.cancel"),
          class: "btn",
          link: true,
        },
        {
          icon: iconHTML("exclamation-triangle"),
          label: I18n.t("admin.user.delete_and_block"),
          class: "btn btn-danger",
          callback: () => {
            performDestroy(true);
          },
        },
        {
          label: I18n.t("admin.user.delete_dont_block"),
          class: "btn btn-primary",
          callback: () => {
            performDestroy(false);
          },
        },
      ];

      bootbox.dialog(message, buttons, { classes: "delete-user-modal" });
    },

    promptTargetUser() {
      showModal("admin-merge-users-prompt", {
        admin: true,
        model: this.model,
      });
    },

    showMergeConfirmation(targetUsername) {
      showModal("admin-merge-users-confirmation", {
        admin: true,
        model: {
          username: this.model.username,
          targetUsername,
        },
      });
    },

    merge(targetUsername) {
      const user = this.model;
      const location = document.location.pathname;

      let formData = { context: location };

      if (targetUsername) {
        formData["target_username"] = targetUsername;
      }

      this.model
        .merge(formData)
        .then((response) => {
          if (response.success) {
            showModal("admin-merge-users-progress", {
              admin: true,
              model: this.model,
            });
          } else {
            bootbox.alert(I18n.t("admin.user.merge_failed"));
          }
        })
        .catch(() => {
          AdminUser.find(user.id).then((u) => user.setProperties(u));
          bootbox.alert(I18n.t("admin.user.merge_failed"));
        });
    },

    viewActionLogs() {
      this.adminTools.showActionLogs(this, {
        target_user: this.get("model.username"),
      });
    },
    showSuspendModal() {
      this.adminTools.showSuspendModal(this.model);
    },
    unsuspend() {
      this.model.unsuspend().catch(popupAjaxError);
    },
    showSilenceModal() {
      this.adminTools.showSilenceModal(this.model);
    },

    saveUsername(newUsername) {
      const oldUsername = this.get("model.username");
      this.set("model.username", newUsername);

      const path = `/users/${oldUsername.toLowerCase()}/preferences/username`;

      return ajax(path, { data: { new_username: newUsername }, type: "PUT" })
        .catch((e) => {
          this.set("model.username", oldUsername);
          popupAjaxError(e);
        })
        .finally(() => this.toggleProperty("editingUsername"));
    },

    saveName(newName) {
      const oldName = this.get("model.name");
      this.set("model.name", newName);

      const path = userPath(`${this.get("model.username").toLowerCase()}.json`);

      return ajax(path, { data: { name: newName }, type: "PUT" })
        .catch((e) => {
          this.set("model.name", oldName);
          popupAjaxError(e);
        })
        .finally(() => this.toggleProperty("editingName"));
    },

    saveTitle(newTitle) {
      const oldTitle = this.get("model.title");
      this.set("model.title", newTitle);

      const path = userPath(`${this.get("model.username").toLowerCase()}.json`);

      return ajax(path, { data: { title: newTitle }, type: "PUT" })
        .catch((e) => {
          this.set("model.title", oldTitle);
          popupAjaxError(e);
        })
        .finally(() => this.toggleProperty("editingTitle"));
    },

    saveCustomGroups() {
      const currentIds = this.customGroupIds;
      const bufferedIds = this.customGroupIdsBuffer;
      const availableGroups = this.availableGroups;

      bufferedIds
        .filter((id) => !currentIds.includes(id))
        .forEach((id) => this.groupAdded(availableGroups.findBy("id", id)));

      currentIds
        .filter((id) => !bufferedIds.includes(id))
        .forEach((id) => this.groupRemoved(id));
    },

    resetCustomGroups() {
      this.set("customGroupIdsBuffer", this.model.customGroups.mapBy("id"));
    },

    savePrimaryGroup() {
      const primaryGroupId = this.get("model.primary_group_id");
      const path = `/admin/users/${this.get("model.id")}/primary_group`;

      return ajax(path, {
        type: "PUT",
        data: { primary_group_id: primaryGroupId },
      })
        .then(() => this.set("originalPrimaryGroupId", primaryGroupId))
        .catch(() => bootbox.alert(I18n.t("generic_error")));
    },

    resetPrimaryGroup() {
      this.set("model.primary_group_id", this.originalPrimaryGroupId);
    },

    deleteSSORecord() {
      return bootbox.confirm(
        I18n.t("admin.user.discourse_connect.confirm_delete"),
        I18n.t("no_value"),
        I18n.t("yes_value"),
        (confirmed) => {
          if (confirmed) {
            return this.model.deleteSSORecord();
          }
        }
      );
    },

    checkSsoEmail() {
      return ajax(userPath(`${this.model.username_lower}/sso-email.json`), {
        data: { context: window.location.pathname },
      }).then((result) => {
        if (result) {
          this.set("ssoExternalEmail", result.email);
        }
      });
    },

    checkSsoPayload() {
      return ajax(userPath(`${this.model.username_lower}/sso-payload.json`), {
        data: { context: window.location.pathname },
      }).then((result) => {
        if (result) {
          this.set("ssoLastPayload", result.payload);
        }
      });
    },

    showDeletePostsConfirmation() {
      showModal("admin-delete-posts-confirmation", {
        admin: true,
        model: this.model,
      });
    },

    deleteAllPosts() {
      let deletedPosts = 0;
      let deletedPercentage = 0;
      const user = this.model;

      const performDelete = (progressModal) => {
        this.model
          .deleteAllPosts()
          .then(({ posts_deleted }) => {
            if (posts_deleted === 0) {
              user.set("post_count", 0);
              progressModal.send("closeModal");
            } else {
              deletedPosts += posts_deleted;
              deletedPercentage = Math.floor(
                (deletedPosts * 100) / user.get("post_count")
              );
              progressModal.setProperties({
                deletedPercentage,
              });
              performDelete(progressModal);
            }
          })
          .catch((e) => {
            progressModal.send("closeModal");
            let error;
            AdminUser.find(user.get("id")).then((u) => user.setProperties(u));
            error = extractError(e) || I18n.t("admin.user.delete_posts_failed");
            bootbox.alert(error);
          });
      };

      const progressModal = showModal("admin-delete-user-posts-progress", {
        admin: true,
      });
      performDelete(progressModal);
    },
  },
});
