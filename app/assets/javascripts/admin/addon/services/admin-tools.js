import AdminUser from "admin/models/admin-user";
import I18n from "I18n";
import { Promise } from "rsvp";
import Service from "@ember/service";
import { ajax } from "discourse/lib/ajax";
import bootbox from "bootbox";
import { getOwner } from "discourse-common/lib/get-owner";
import { iconHTML } from "discourse-common/lib/icon-library";
import showModal from "discourse/lib/show-modal";

// A service that can act as a bridge between the front end Discourse application
// and the admin application. Use this if you need front end code to access admin
// modules. Inject it optionally, and if it exists go to town!
export default Service.extend({
  showActionLogs(target, filters) {
    const controller = getOwner(target).lookup(
      "controller:adminLogs.staffActionLogs"
    );
    target.transitionToRoute("adminLogs.staffActionLogs").then(() => {
      controller.changeFilters(filters);
    });
  },

  checkSpammer(userId) {
    return AdminUser.find(userId).then((au) => this.spammerDetails(au));
  },

  deleteUser(id, formData) {
    return AdminUser.find(id).then((user) => user.destroy(formData));
  },

  spammerDetails(adminUser) {
    return {
      deleteUser: () => this._deleteSpammer(adminUser),
      canDelete:
        adminUser.get("can_be_deleted") &&
        adminUser.get("can_delete_all_posts"),
    };
  },

  _showControlModal(type, user, opts) {
    opts = opts || {};
    let controller = showModal(`admin-${type}-user`, {
      admin: true,
      modalClass: `${type}-user-modal`,
    });
    controller.setProperties({ postId: opts.postId, postEdit: opts.postEdit });

    return (user.adminUserView
      ? Promise.resolve(user)
      : AdminUser.find(user.get("id"))
    ).then((loadedUser) => {
      controller.setProperties({
        user: loadedUser,
        loadingUser: false,
        before: opts.before,
        successCallback: opts.successCallback,
      });

      controller.finishedSetup();
    });
  },

  showSilenceModal(user, opts) {
    this._showControlModal("silence", user, opts);
  },

  showSuspendModal(user, opts) {
    this._showControlModal("suspend", user, opts);
  },

  _deleteSpammer(adminUser) {
    // Try loading the email if the site supports it
    let tryEmail = this.siteSettings.moderators_view_emails
      ? adminUser.checkEmail()
      : Promise.resolve();

    return tryEmail.then(() => {
      let message = I18n.messageFormat("flagging.delete_confirm_MF", {
        POSTS: adminUser.get("post_count"),
        TOPICS: adminUser.get("topic_count"),
        email:
          adminUser.get("email") || I18n.t("flagging.hidden_email_address"),
        ip_address:
          adminUser.get("ip_address") || I18n.t("flagging.ip_address_missing"),
      });

      let userId = adminUser.get("id");

      return new Promise((resolve, reject) => {
        const buttons = [
          {
            label: I18n.t("composer.cancel"),
            class: "d-modal-cancel",
            link: true,
          },
          {
            label:
              `${iconHTML("exclamation-triangle")} ` +
              I18n.t("flagging.yes_delete_spammer"),
            class: "btn btn-danger confirm-delete",
            callback() {
              return ajax(`/admin/users/${userId}.json`, {
                type: "DELETE",
                data: {
                  delete_posts: true,
                  block_email: true,
                  block_urls: true,
                  block_ip: true,
                  delete_as_spammer: true,
                  context: window.location.pathname,
                },
              })
                .then((result) => {
                  if (result.deleted) {
                    resolve();
                  } else {
                    throw new Error("failed to delete");
                  }
                })
                .catch(() => {
                  bootbox.alert(I18n.t("admin.user.delete_failed"));
                  reject();
                });
            },
          },
        ];

        bootbox.dialog(message, buttons, {
          classes: "flagging-delete-spammer",
        });
      });
    });
  },
});
